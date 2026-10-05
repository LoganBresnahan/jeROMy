#!/usr/bin/env bash
# The standing trio from /verify, run headlessly through dsh with the jeROMy
# plugin: look, read, edit, click, region, persist. Each is one `dsh --profile headless --json` run;
# the JSON event streams and a summary land in .chat-out/trio-<stamp>/.
# Only one dsh process can own the bridge port, so this stops a running web
# instance first and brings it back afterwards.
#
# Usage: scripts/trio.sh [look|read|edit|click|region|persist ...]   (default: all six)
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
  [click]="Call get_tile_at_pixel at (176, 182) and get_pixel_color at (176, 182), then get_palette for the palette the first result named. Report all three raw outputs verbatim and say whether the pixel's nes_color is one of that palette's entries or the shared backdrop."
  [region]="Call get_region at (176, 182) in color mode, then get_region at (176, 182) in object mode. Report both raw outputs verbatim and, in one sentence, say what a palette edit of the color-mode slot would also recolor according to the summary."
  [persist]="Do exactly this, no extra tool calls, and report every raw tool output verbatim: (1) search_memory with hex \"0F 29 1A 0F\" in prgRom. (2) write_memory at the first offset plus 1, bytes [22] (decimal twenty-two, which is NES color 0x16 red; do not write 0x22), mem_type prgRom, reason \"trio persist check\". (3) reset_emulator. (4) get_palette 0. (5) export_patch with format ips. (6) undo_edit with the seq the write reported. (7) reset_emulator."
)
declare -A MIN_CALLS=([look]=1 [read]=2 [edit]=5 [click]=3 [region]=2 [persist]=7)
# --task "<text>": a one-off check named `custom` through the same machinery
# (neutral cwd, bridge wait, replay line). Used by unattended runs.
if [ "${1:-}" = "--task" ]; then TASK[custom]="$2"; MIN_CALLS[custom]="${3:-1}"; set -- custom; fi
CHECKS=("$@"); [ ${#CHECKS[@]} -eq 0 ] && CHECKS=(look read edit click region persist)

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
summarize() { python3 - "$1" "$2" "${3:-}" <<'PY'
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
# Field-level checks on raw tool results, never on the model's prose (ADR-0010 phase 4).
if sys.argv[3:] == ["click"]:
    results = {}
    for line in open(sys.argv[1]):
        line = line.strip()
        if not line.startswith("{"): continue
        e = json.loads(line)
        if e.get("type") == "tool_call": results[e["callId"]] = e.get("tool")
        if e.get("type") == "tool_result" and isinstance(e.get("result"), str):
            try: results[results.get(e["callId"], "?")] = json.loads(e["result"])
            except Exception: pass
    tile = results.get("get_tile_at_pixel"); px = results.get("get_pixel_color"); pal = results.get("get_palette")
    problems = []
    if not isinstance(tile, dict) or tile.get("scroll_source") != "scanline": problems.append("get_tile_at_pixel did not answer from a scanline scroll (SMB always splits at the status bar)")
    if not isinstance(px, dict) or "nes_color" not in px: problems.append("no get_pixel_color result")
    if isinstance(tile, dict) and isinstance(px, dict) and isinstance(pal, dict):
        colors = pal.get("colors", []); backdrop = pal.get("background_color")
        if px["nes_color"] not in colors and px["nes_color"] != backdrop: problems.append(f"pixel color {px['nes_color']} not in palette {tile.get('palette_id')} {colors} nor backdrop {backdrop}")
    if problems: ok = False; final = "CLICK CHECK: " + "; ".join(problems) + " · " + final
if sys.argv[3:] == ["region"]:
    # ADR-0014: the pipe at (176, 182) is background palette 0; the fill must be by slot, with both edit paths stated.
    names = {}; regions = []
    for line in open(sys.argv[1]):
        line = line.strip()
        if not line.startswith("{"): continue
        e = json.loads(line)
        if e.get("type") == "tool_call": names[e["callId"]] = e.get("tool")
        if e.get("type") == "tool_result" and names.get(e["callId"]) == "get_region" and isinstance(e.get("result"), str):
            try: regions.append(json.loads(e["result"]))
            except Exception: pass
    problems = []
    modes = {r.get("mode") for r in regions}
    if not {"color", "object"} <= modes: problems.append(f"expected a color and an object get_region result, saw modes {sorted(m for m in modes if m)}")
    # The demo cycles title, gameplay and castle scenes, so only the shape of the answer is pinned, not the palette.
    for r in regions:
        if r.get("layer") not in ("background", "sprite"): problems.append(f"{r.get('mode')} region has no layer: {r.get('layer')}")
        if not r.get("pixel_count"): problems.append(f"{r.get('mode')} region is empty")
        if "tile edit" not in r.get("summary", ""): problems.append(f"{r.get('mode')} summary does not state the tile-edit path")
        # The demo scrolls, so (176, 182) is the pipe or the sky: slot 1-3 with the palette-edit sentence, or slot 0 named as the backdrop.
        if r.get("mode") == "color":
            summary = r.get("summary", "")
            if r.get("slot") in (1, 2, 3) and "palette edit" not in summary: problems.append("color summary does not state the palette-edit path")
            if r.get("slot") == 0 and "backdrop" not in summary: problems.append("color region on slot 0 does not name the backdrop")
            if r.get("slot") not in (0, 1, 2, 3): problems.append(f"color region has no slot: {r.get('slot')}")
    if problems: ok = False; final = "REGION CHECK: " + "; ".join(problems) + " · " + final
if sys.argv[3:] == ["persist"]:
    names = {}; res = []
    for line in open(sys.argv[1]):
        line = line.strip()
        if not line.startswith("{"): continue
        e = json.loads(line)
        if e.get("type") == "tool_call": names[e["callId"]] = e.get("tool")
        if e.get("type") == "tool_result" and isinstance(e.get("result"), str):
            try: res.append((names.get(e["callId"], "?"), json.loads(e["result"])))
            except Exception: res.append((names.get(e["callId"], "?"), e["result"]))
    by = {}
    for n, r in res: by.setdefault(n, []).append(r)
    problems = []
    w = next((r for r in by.get("write_memory", []) if isinstance(r, dict) and r.get("persistent")), None)
    if not w or not w.get("ledger"): problems.append("write_memory to prgRom was not ledgered")
    pal = next((r for r in by.get("get_palette", []) if isinstance(r, dict)), None)
    if not pal or 22 not in pal.get("colors", []): problems.append("palette 0 did not read $16 after reset")
    ex = next((r for r in by.get("export_patch", []) if isinstance(r, dict)), None)
    if not ex or not ex.get("written"): problems.append("export_patch wrote nothing")
    un = next((r for r in by.get("undo_edit", []) if isinstance(r, dict)), None)
    if not un or not un.get("undone"): problems.append("undo_edit did not restore the byte")
    if len(by.get("reset_emulator", [])) < 2: problems.append("reset_emulator not called twice")
    if problems: ok = False; final = "PERSIST CHECK: " + "; ".join(problems) + " · " + final
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
  summary="$(summarize "$OUT/$name.jsonl" "${MIN_CALLS[$name]:-1}" "$name")"; sok=$?
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
  # The web instance is only back when the plugin's view answers; a dsh that
  # listens on :3080 without :9001/:9002 happened once after a trio
  # (docs/issues.md, 2026-10-05) and is worth knowing about now, not later.
  # A cold tsx boot plus the Lua client's reconnect can take over a minute.
  waited=0
  until curl -sf --max-time 3 http://127.0.0.1:9002/status 2>/dev/null | grep -q '"connected":true'; do
    [ $waited -ge 120 ] && break; sleep 2; waited=$((waited + 2))
  done
  if [ $waited -lt 120 ]; then
    echo "[trio] web dsh back: view connected after ${waited}s"
  else
    echo "[trio] WARNING: web dsh restarted but the view on :9002 did not report a connected bridge within 120 s; keep .dsh-dev/dsh.log, then scripts/up.sh --down && scripts/up.sh (docs/issues.md)" >&2
  fi
fi
echo "[trio] streams in $OUT"
exit $FAIL
