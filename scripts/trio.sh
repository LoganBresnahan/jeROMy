#!/usr/bin/env bash
# The standing trio from /verify, run headlessly through dsh with the jeROMy
# plugin: look, read, edit, click, region, hacks, persist, play. Each is one `dsh --profile headless --json` run;
# the JSON event streams and a summary land in .chat-out/trio-<stamp>/.
# Only one dsh process can own the bridge port, so this stops a running web
# instance first and brings it back afterwards.
#
# Usage: scripts/trio.sh [look|read|edit|click|region|hacks|persist|play ...]   (default: all eight)
#        scripts/trio.sh --blind variable      (ADR-0019 calibration: blind lives-counter search on SMB, ~2 min, not in the default set)
#        scripts/trio.sh [--blind] --task "<instruction>" [min-tool-calls]   (--blind: JEROMY_BLIND=1, reference held back)
#        TRIO_SESSION_ID=session-<id> scripts/trio.sh --task "continue"   (resume that headless session; eval-run.sh after a provider error)
set -uo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
DSH_SRC="$(cd "${DSH_SRC:-$REPO/../deepseek-harness}" && pwd)"
PATCH="${TRIO_PATCH:-$REPO/.dsh-dev/cordis.yml}"   # eval-run.sh passes a per-run copy (ADR-0022: the run's own mappingsDir)
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
  [hacks]="Do exactly these calls in order, report every raw output verbatim, and nothing else: (1) new_hack with name trio-test and description 'trio check'. (2) use_hack trio-test. (3) write_memory at address 3276 (decimal), bytes [22], mem_type prgRom, reason 'trio hacks check'. (4) export_patch with format bps. (5) list_hacks. (6) use_hack default."
  [play]="Do exactly these calls in order and report every raw output verbatim: (0) reset_emulator. (1) snapshot_memory with name before. (2) play_input with script [{buttons: [\"start\"], frames: 10}, {buttons: [], frames: 60}, {buttons: [\"start\"], frames: 10}, {buttons: [], frames: 40}] and watch [9, 1904]. (3) snapshot_memory with name after. (4) diff_memory with a before, b after, filter changed, name d1. (5) reset_emulator. Then say in one sentence how many addresses changed."
  [variable]="Find the RAM address of the player's lives counter in this game by differential search, without any reference: use snapshot_memory, play_input and diff_memory (name each diff and narrow with from). Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title screen begins a game with 3 lives, but Start during the attract demo only returns to the title, so press Start, wait a second, and press Start again to be sure a game begins; the lives count is shown only on the black 'WORLD 1-1  x 3' card before each life, not in the in-game HUD; walking right for about four seconds from the start of 1-1 runs into the first enemy and loses a life, and the card appears about three seconds after. Plan your play_input scripts accordingly (each call is at most 600 frames; chain calls; take a screenshot when you need to know which screen you are on). Once a few candidates remain, prove one: write_memory a different value to it, lose another life, and take a screenshot of the card to confirm the number changed. Then record_mapping the address with mapping_type address, a clear name, and source 'differential search'. Report the raw diff results and the final address."
  [persist]="Do exactly this, no extra tool calls, and report every raw tool output verbatim: (1) search_memory with hex \"0F 29 1A 0F\" in prgRom. (2) write_memory at the first offset plus 1, bytes [22] (decimal twenty-two, which is NES color 0x16 red; do not write 0x22), mem_type prgRom, reason \"trio persist check\". (3) reset_emulator. (4) get_palette 0. (5) export_patch with format ips. (6) undo_edit with the seq the write reported. (7) reset_emulator."
)
declare -A MIN_CALLS=([look]=1 [read]=2 [edit]=5 [click]=3 [region]=2 [hacks]=6 [persist]=7 [play]=6 [variable]=10)
# --task "<text>": a one-off check named `custom` through the same machinery
# (neutral cwd, bridge wait, replay line). Used by unattended runs.
# --blind: the calibration switch (ADR-0019). JEROMY_BLIND=1 goes to the
# headless dsh only, never to the web dsh restarted afterwards, and the
# summary fails if lookup_symbol was called before the first write_memory.
BLIND=0; if [ "${1:-}" = "--blind" ]; then BLIND=1; shift; fi
if [ "${1:-}" = "--task" ]; then TASK[custom]="$2"; MIN_CALLS[custom]="${3:-1}"; set -- custom; fi
TIMEOUT="${TRIO_TIMEOUT:-420}"
CHECKS=("$@"); [ ${#CHECKS[@]} -eq 0 ] && CHECKS=(look read edit click region hacks persist play)

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
import sys, json, os
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
if sys.argv[3:] == ["hacks"]:
    # ADR-0018: a throwaway hack is created, switched to, written into, exported as v1, and left; use_hack default swaps the byte back.
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
    made = next((r for r in by.get("new_hack", []) if isinstance(r, dict)), None)
    if not made or made.get("created", {}).get("name") != "trio-test": problems.append("new_hack did not create trio-test")
    uses = [r for r in by.get("use_hack", []) if isinstance(r, dict)]
    if len(uses) < 2 or uses[0].get("to") != "trio-test" or uses[-1].get("to") != "default": problems.append("use_hack did not switch to trio-test and back to default")
    if uses and not uses[-1].get("reset"): problems.append("switching back from a hack with one edit did not reset the emulator")
    if uses and uses[-1].get("reverted") != [1]: problems.append(f"switching back did not revert edit #1 (got {uses[-1].get('reverted')})")
    w = next((r for r in by.get("write_memory", []) if isinstance(r, dict) and r.get("persistent")), None)
    if not w or "/trio-test/" not in str(w.get("ledger", {})) and "/trio-test/" not in json.dumps(w): problems.append("write_memory did not ledger into the trio-test hack")
    ex = next((r for r in by.get("export_patch", []) if isinstance(r, dict)), None)
    if not ex or not str(ex.get("written", "")).endswith("trio-test-v1.bps") or ex.get("hack") != "trio-test": problems.append(f"export_patch did not write trio-test-v1.bps for hack trio-test (got {ex and ex.get('written')})")
    if problems: ok = False; final = "HACKS CHECK: " + "; ".join(problems) + " · " + final
if sys.argv[3:] == ["play"]:
    # ADR-0019: after a reset, Start / 60 frames / Start / 40 frames completes with 120 frames and 120 polls, the watches
    # carry 60 samples each of $09 (frame counter) and $0770 (OperMode), and OperMode ends at 1: a press landed in the game.
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
    run = next((r for r in by.get("play_input", []) if isinstance(r, dict)), None)
    if not run: problems.append("no play_input result")
    else:
        ws = {w.get("address"): w.get("values") or [] for w in run.get("watch") or []}
        fc, mode = ws.get(9, []), ws.get(1904, [])
        if run.get("frames_run") != 120: problems.append(f"play_input ran {run.get('frames_run')} frames, not 120")
        if run.get("polls") != 120: problems.append(f"the core polled input {run.get('polls')} times in 120 frames")
        if len(fc) != 60: problems.append(f"watch did not sample $09 every other frame (got {len(fc)} samples)")
        elif len(set(fc)) < 2: problems.append("the watched frame counter never changed during the run")
        # $0770 is SMB's OperMode: 0 on the title screen and in the attract demo, 1 once a game begins. Start on the
        # title begins a game; Start in the demo returns to the title, so the second Start a second later begins it.
        # Hand-checked 2026-10-06 with bridge-call: Start 1 s after reset -> 1; 8 s or 14 s after -> re-init, still 0.
        if not mode or mode[-1] != 1: problems.append(f"two Start presses did not begin a game ($0770 ended at {mode[-1] if mode else None}; title/demo read 0, a game 1)")
    snaps = [r for r in by.get("snapshot_memory", []) if isinstance(r, dict)]
    if len(snaps) < 2 or any(r.get("length") != 2048 for r in snaps): problems.append("two 2048-byte snapshots were not taken")
    d = next((r for r in by.get("diff_memory", []) if isinstance(r, dict)), None)
    if not d or d.get("considered") != 2048 or not d.get("matched"): problems.append(f"diff_memory did not compare 2048 bytes with at least one change (got {d and {k: d.get(k) for k in ('considered', 'matched')}})")
    if problems: ok = False; final = "PLAY CHECK: " + "; ".join(problems) + " · " + final
if sys.argv[3:] == ["variable"]:
    # ADR-0019 calibration on SMB: at least two diff rounds, the second narrowed with `from`, and an address recorded
    # with source "differential search". The address itself is scored afterwards by scripts/score-mapping.mjs, not here.
    names = {}; diffs = []; recorded = None
    for line in open(sys.argv[1]):
        line = line.strip()
        if not line.startswith("{"): continue
        e = json.loads(line)
        if e.get("type") == "tool_call":
            names[e["callId"]] = e.get("tool")
            if e.get("tool") == "diff_memory": diffs.append(e.get("input") or e.get("args") or {})
            if e.get("tool") == "record_mapping": recorded = e.get("input") or e.get("args") or {}
    problems = []
    if len(diffs) < 2: problems.append(f"only {len(diffs)} diff_memory call(s); the procedure needs at least two rounds")
    elif not any(d.get("from") for d in diffs[1:]): problems.append("no diff narrowed with from")
    if not recorded or recorded.get("mapping_type") != "address" or "differential" not in str(recorded.get("source", "")): problems.append("no address recorded with source 'differential search'")
    if problems: ok = False; final = "VARIABLE CHECK: " + "; ".join(problems) + " · " + final
    else: final = f"VARIABLE: recorded {recorded.get('id')} {recorded.get('name')} after {len(diffs)} diff rounds · " + final
if os.environ.get("BLIND") == "1":
    # ADR-0019 calibration: the reference must not enter before the proof. A lookup_symbol before the first write_memory voids the run.
    order = []
    for line in open(sys.argv[1]):
        line = line.strip()
        if not line.startswith("{"): continue
        e = json.loads(line)
        if e.get("type") == "tool_call" and e.get("tool") in ("lookup_symbol", "write_memory"): order.append(e["tool"])
    if "lookup_symbol" in order and ("write_memory" not in order or order.index("lookup_symbol") < order.index("write_memory")):
        ok = False; final = "BLIND CHECK: lookup_symbol was called before the first write_memory · " + final
    # ADR-0020: the answer key is the imported reference, the eval spec and the mapping file; a call that names one voids the run.
    for line in open(sys.argv[1]):
        line = line.strip()
        if not line.startswith("{"): continue
        e = json.loads(line)
        if e.get("type") == "tool_call" and any(k in json.dumps(e.get("input") or e.get("args") or {}) for k in ("reference.json", "eval/spec", "eval/runs", "mappings/sha1-", "discoveries.json")):
            ok = False; final = f"BLIND CHECK: {e.get('tool')} touched the answer key · " + final; break
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
  ( cd "$WORK" && JEROMY_BLIND="$BLIND" TSX_TSCONFIG_PATH="$DSH_SRC/tsconfig.json" timeout "$TIMEOUT" node --import "$TSX_ESM" "$DSH_SRC/apps/cli/src/bin.ts" --profile headless --patch "$PATCH" ${TRIO_SESSION_ID:+--session-id "$TRIO_SESSION_ID"} --json "$task" ) > "$OUT/$name.jsonl" 2> "$OUT/$name.err"
  code=$?
  sid="$(grep -o '"sessionId":"session-[0-9a-f-]*"' "$OUT/$name.jsonl" | head -1 | cut -d'"' -f4)"
  summary="$(BLIND="$BLIND" summarize "$OUT/$name.jsonl" "${MIN_CALLS[$name]:-1}" "$name")"; sok=$?
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
  # The hacks check leaves a throwaway hack behind; remove it so list_hacks stays the person's own.
  if [ "$name" = "hacks" ]; then for d in "$REPO"/hacks/sha1-*/trio-test; do [ -d "$d" ] && rm -rf "$d" && echo "[trio] removed throwaway hack $d"; done; fi
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
