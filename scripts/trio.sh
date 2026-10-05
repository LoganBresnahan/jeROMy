#!/usr/bin/env bash
# The standing trio from /verify, run headlessly through dsh with the jeROMy
# plugin: look, read, edit. Each is one `dsh --profile headless --json` run;
# the JSON event streams and a summary land in .chat-out/trio-<stamp>/.
# Only one dsh process can own the bridge port, so this stops a running web
# instance first and brings it back afterwards.
#
# Usage: scripts/trio.sh [look|read|edit ...]   (default: all three)
set -uo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
DSH_SRC="$(cd "${DSH_SRC:-$REPO/../deepseek-harness}" && pwd)"
PATCH="$REPO/.dsh-dev/cordis.yml"
OUT="$REPO/.chat-out/trio-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"
[ -f "$PATCH" ] || { echo "[trio] no $PATCH; run scripts/up.sh once" >&2; exit 1; }

declare -A TASK=(
  [look]="Take a screenshot of the emulator and describe what you see. Be specific about objects, text and colors."
  [read]="Using get_tile_at_pixel, tell me what tile is at screen pixel (128, 220) and which palette it uses. Then read that palette with get_palette and report its four color indices. Report raw tool values."
  [edit]="Take a screenshot. Then use write_palette to set background palette 1, color index 1 to NES color 0x12 (blue). Pause the emulator, step one frame, take another screenshot and tell me exactly what changed between the two images. Finally call clear_palette_overrides and resume_emulator. Report raw write_palette output."
)
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

summarize() { python3 - "$1" <<'PY'
import sys, json
calls = steps = 0; tin = tout = 0; final = ""; reason = "?"; err = None
for line in open(sys.argv[1]):
    line = line.strip()
    if not line.startswith("{"): continue
    e = json.loads(line); t = e.get("type")
    if t == "tool_call": calls += 1
    elif t == "status" and e.get("phase") == "step_end":
        steps += 1; u = e.get("usage", {}); tin += u.get("inputTokens", 0) + u.get("cacheReadTokens", 0); tout += u.get("outputTokens", 0)
    elif t == "status" and e.get("phase") == "turn_end": reason = json.dumps(e.get("reason"))
    elif t == "final": final = (e.get("text") or "").strip().replace("\n", " ")
    elif t == "error": err = e.get("message")
print(f"steps {steps} · tool calls {calls} · tokens in {tin} out {tout} · turn_end {reason}" + (f" · ERROR {err}" if err else ""))
print("  " + (final[:220] + ("…" if len(final) > 220 else "")))
PY
}

wait_port_free() { # a finished dsh can hold the bridge socket for a few seconds; the Lua side can only reconnect once it is gone
  for _ in $(seq 1 30); do [ -z "$(owner_of 9001)" ] && return 0; sleep 1; done
  echo "[trio] port 9001 still held by pid $(owner_of 9001) after 30 s" >&2; return 1
}

FAIL=0
for name in "${CHECKS[@]}"; do
  task="${TASK[$name]:-}"; [ -n "$task" ] || { echo "[trio] unknown check: $name" >&2; FAIL=1; continue; }
  wait_port_free || { FAIL=1; break; }
  echo "=== $name"
  ( cd "$DSH_SRC" && timeout 420 pnpm dsh --profile headless --patch "$PATCH" --json "$task" ) > "$OUT/$name.jsonl" 2> "$OUT/$name.err"
  code=$?
  echo "exit $code · $(summarize "$OUT/$name.jsonl")"
  [ $code -eq 0 ] || { FAIL=1; echo "  stderr: $(grep -v '^\$ node' "$OUT/$name.err" | tail -3 | tr '\n' ' ')"; }
done

if [ $RESTART -eq 1 ]; then
  echo "[trio] restarting the web dsh"
  (setsid nohup "$REPO/scripts/dsh-dev.sh" --no-open > "$REPO/.dsh-dev/dsh.log" 2>&1 &)
fi
echo "[trio] streams in $OUT"
exit $FAIL
