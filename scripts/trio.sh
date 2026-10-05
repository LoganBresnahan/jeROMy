#!/usr/bin/env bash
# The standing trio from /verify, run headlessly through dsh with the jeROMy
# plugin: look, read, edit. Each is one `dsh --profile headless --json` run;
# the JSON event streams and a summary land in .chat-out/trio-<stamp>/.
# Only one dsh process can own the bridge port, so this stops a running web
# instance first and brings it back afterwards.
#
# Usage: scripts/trio.sh [look|read|edit ...]   (default: all three)
#        scripts/trio.sh --task "<instruction>" [min-tool-calls]
set -uo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
DSH_SRC="$(cd "${DSH_SRC:-$REPO/../deepseek-harness}" && pwd)"
PATCH="$REPO/.dsh-dev/cordis.yml"
OUT="$REPO/.chat-out/trio-$(date +%Y%m%d-%H%M%S)"
WORK="${XDG_CACHE_HOME:-$HOME/.cache}/jeromy/headless-cwd"   # outside the repo: dsh walks up from cwd for AGENTS.md/CLAUDE.md
mkdir -p "$OUT" "$WORK"
TSX_ESM="$(cd "$DSH_SRC" && node -p "require.resolve('tsx/esm')")"   # `--import tsx/esm` resolves from cwd, which has no node_modules
[ -f "$PATCH" ] || { echo "[trio] no $PATCH; run scripts/up.sh once" >&2; exit 1; }

declare -A TASK=(
  [look]="Take a screenshot of the emulator and describe what you see. Be specific about objects, text and colors."
  [read]="Using get_tile_at_pixel, tell me what tile is at screen pixel (128, 220) and which palette it uses. Then read that palette with get_palette and report its four color indices. Report raw tool values."
  [edit]="Take a screenshot. Then use write_palette to set background palette 1, color index 1 to NES color 0x12 (blue). Pause the emulator, step one frame, take another screenshot and tell me exactly what changed between the two images. Finally call clear_palette_overrides and resume_emulator. Report raw write_palette output."
)
declare -A MIN_CALLS=([look]=1 [read]=2 [edit]=5)
# --task "<text>": a one-off check named `custom` through the same machinery
# (neutral cwd, bridge wait, replay line). Used by unattended runs.
if [ "${1:-}" = "--task" ]; then TASK[custom]="$2"; MIN_CALLS[custom]="${3:-1}"; set -- custom; fi
CHECKS=("$@"); [ ${#CHECKS[@]} -eq 0 ] && CHECKS=(look read edit)

owner_of() { ss -ltnp 2>/dev/null | grep -E ":$1 " | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2; }
WEB_PID="$(owner_of 9001)"; RESTART=0
if [ -n "$WEB_PID" ]; then
  if tr '\0' ' ' < "/proc/$WEB_PID/cmdline" | grep -q -- "--profile jeromy"; then
    echo "[trio] stopping the web dsh (pid $WEB_PID) to free the bridge port; will restart after"
    kill "$WEB_PID"; RESTART=1; sleep 2
  else
    echo "[trio] port 9001 owned by pid $WEB_PID (not our dsh); stop it first" >&2; exit 1
  fi
fi

# Prints the summary; exits 1 when the check did not really run: a tool
# result that is an error (the bridge was down, a timeout) or fewer tool
# calls than the task needs. "turn completed" alone is not a pass: on
# 2026-10-05 an edit check "completed" with zero emulator access because the
# Lua client had not reconnected yet.
summarize() { python3 - "$1" "$2" <<'PY'
import sys, json
calls = steps = errs = 0; tin = tout = 0; final = ""; reason = "?"; err = None
for line in open(sys.argv[1]):
    line = line.strip()
    if not line.startswith("{"): continue
    e = json.loads(line); t = e.get("type")
    if t == "tool_call": calls += 1
    elif t == "tool_result":
        r = e.get("result"); txt = r if isinstance(r, str) else json.dumps(r)
        if e.get("status") not in (None, "completed") or txt.startswith("Error:") or "bridge is not connected" in txt: errs += 1
    elif t == "status" and e.get("phase") == "step_end":
        steps += 1; u = e.get("usage", {}); tin += u.get("inputTokens", 0) + u.get("cacheReadTokens", 0); tout += u.get("outputTokens", 0)
    elif t == "status" and e.get("phase") == "turn_end": reason = json.dumps(e.get("reason"))
    elif t == "final": final = (e.get("text") or "").strip().replace("\n", " ")
    elif t == "error": err = e.get("message")
need = int(sys.argv[2]); ok = err is None and errs == 0 and calls >= need
print(f"steps {steps} · tool calls {calls} (need ≥{need}) · tool errors {errs} · tokens in {tin} out {tout} · turn_end {reason}" + (f" · ERROR {err}" if err else "") + ("" if ok else " · CHECK FAILED"))
print("  " + (final[:220] + ("…" if len(final) > 220 else "")))
sys.exit(0 if ok else 1)
PY
}

wait_port_free() { # a finished dsh can hold the bridge socket for a few seconds; the Lua side can only reconnect once it is gone
  for _ in $(seq 1 30); do [ -z "$(owner_of 9001)" ] && return 0; sleep 1; done
  echo "[trio] port 9001 still held by pid $(owner_of 9001) after 30 s" >&2; return 1
}

run_check() { # $1 = name; sets code/sok/sid; writes $OUT/$1.jsonl
  local name="$1" task="${TASK[$1]}"
  # Run from a neutral directory outside any repo: dsh injects the nearest
  # AGENTS.md/CLAUDE.md above cwd into the agent as `agent-instructions`, and
  # neither the harness's nor jeROMy's rulebook is for the ROM-hacking agent
  # (ADR-0011, found 2026-10-05).
  # TSX_TSCONFIG_PATH: outside the checkout tsx would not see its tsconfig `paths`
  # and would load stale built packages instead of workspace sources.
  ( cd "$WORK" && TSX_TSCONFIG_PATH="$DSH_SRC/tsconfig.json" timeout 420 node --import "$TSX_ESM" "$DSH_SRC/apps/cli/src/bin.ts" --profile headless --patch "$PATCH" --json "$task" ) > "$OUT/$name.jsonl" 2> "$OUT/$name.err"
  code=$?
  sid="$(grep -o '"sessionId":"session-[0-9a-f-]*"' "$OUT/$name.jsonl" | head -1 | cut -d'"' -f4)"
  summary="$(summarize "$OUT/$name.jsonl" "${MIN_CALLS[$name]:-1}")"; sok=$?
  echo "exit $code · $summary"
  [ -n "$sid" ] && echo "  replay: scripts/dsh-log.mjs show ${sid#session-} --images $OUT/$name-img"
  [ $code -eq 0 ] || echo "  stderr: $(grep -v '^\$ node' "$OUT/$name.err" | tail -3 | tr '\n' ' ')"
}

FAIL=0
for name in "${CHECKS[@]}"; do
  [ -n "${TASK[$name]:-}" ] || { echo "[trio] unknown check: $name" >&2; FAIL=1; continue; }
  wait_port_free || { FAIL=1; break; }
  echo "=== $name"
  run_check "$name"
  if [ $sok -ne 0 ] && grep -q "bridge is not connected" "$OUT/$name.jsonl"; then
    # The Lua client did not come back after the previous run's disconnect
    # (docs/issues.md, 2026-10-05). Only a Mesen restart reloads bridge.lua
    # (the handoff keeps the running script); retry once after it.
    echo "  bridge never connected; restarting Mesen with the ROM + bridge.lua and retrying"
    mv "$OUT/$name.jsonl" "$OUT/$name.attempt1.jsonl"; mv "$OUT/$name.err" "$OUT/$name.attempt1.err"
    "$REPO/scripts/mesen-up.sh" --restart >/dev/null 2>&1; sleep 6
    wait_port_free || { FAIL=1; break; }
    run_check "$name"
  fi
  [ $code -eq 0 ] && [ $sok -eq 0 ] || FAIL=1
done

if [ $RESTART -eq 1 ]; then
  echo "[trio] restarting the web dsh"
  (setsid nohup "$REPO/scripts/dsh-dev.sh" --no-open > "$REPO/.dsh-dev/dsh.log" 2>&1 &)
fi
echo "[trio] streams in $OUT"
exit $FAIL
