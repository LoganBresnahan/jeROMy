#!/usr/bin/env bash
# One eval run (ADR-0020, eval/README.md): write the config first, bring the
# loop up on the spec's game, run each task blind through scripts/trio.sh with
# a cost cap, keep the streams, the screenshots and the replay transcripts,
# then grade with scripts/eval-grade.mjs. Claude judges the picture rows and
# writes report.md afterwards.
#
# Usage: scripts/eval-run.sh --spec eval/spec/smb.json --slug sheet3-hud \
#          --lines C1.coins,C1.timer --task "<task 1>" [--task "<task 2>" ...] \
#          [--min-calls N] [--cap 1.00] [--holdout] [--rerun-of <run-id>]
# --rerun-of: this run redoes lines of an earlier one (eval/README.md, "Re-running a sheet");
#   read eval/failures.md first. eval-grade.mjs then writes comparison.md.
set -uo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"
SPEC=""; SLUG=""; LINES=""; MIN=8; CAP="1.00"; HOLDOUT=false; TASKS=(); RERUN=""
while [ $# -gt 0 ]; do
  case "$1" in
    --spec) SPEC="$2"; shift 2 ;;
    --slug) SLUG="$2"; shift 2 ;;
    --lines) LINES="$2"; shift 2 ;;
    --task) TASKS+=("$2"); shift 2 ;;
    --min-calls) MIN="$2"; shift 2 ;;
    --cap) CAP="$2"; shift 2 ;;
    --holdout) HOLDOUT=true; shift ;;
    --rerun-of) RERUN="$2"; shift 2 ;;
    *) echo "[eval-run] unknown argument $1" >&2; exit 2 ;;
  esac
done
[ -f "$SPEC" ] && [ -n "$SLUG" ] && [ -n "$LINES" ] && [ ${#TASKS[@]} -gt 0 ] || { sed -n 2,15p "$0" >&2; exit 2; }
[ -z "$RERUN" ] || [ -d "eval/runs/$RERUN" ] || { echo "[eval-run] --rerun-of $RERUN: no such run under eval/runs" >&2; exit 2; }

spec_get() { python3 -c "import json,sys; print(json.load(open('$SPEC')).get('$1',''))"; }
GAME="$(spec_get game)"; SHA1="$(spec_get sha1)"; ROM="$(spec_get rom_path)"; SPECV="$(spec_get spec_version)"
[ "$(spec_get holdout)" = "True" ] && HOLDOUT=true
ID="$(date +%Y%m%d-%H%M)-$SLUG"; RUN="eval/runs/$ID"
mkdir -p "$RUN/streams" "$RUN/images" "$RUN/transcripts"

balance() { scripts/budget.sh 2>/dev/null | sed -n 's/.*USD \([0-9.]*\).*/\1/p'; }
BEFORE="$(balance)"
[ -n "$BEFORE" ] || { echo "[eval-run] budget unavailable; runs stop (eval/README.md stop conditions)" >&2; exit 1; }
COMMIT="$(git rev-parse --short HEAD)$(git diff --quiet && git diff --cached --quiet || echo '+dirty')"
MODEL="$(sed -n 's/^ *model: *//p' .dsh-dev/cordis.yml | head -1)"

# If the config is not written, the run did not happen (eval/README.md step 2).
{
  echo "# Config: $ID"
  echo
  echo "- commit: \`$COMMIT\`"
  echo "- game: $GAME (sha1 \`$SHA1\`)"
  echo "- spec: \`$SPEC\` v$SPECV · lines: $LINES"
  echo "- model: ${MODEL:-?} · blind: true (JEROMY_BLIND=1) · holdout: $HOLDOUT"
  [ -n "$RERUN" ] && echo "- re-run of: \`$RERUN\` (eval/failures.md entries for these lines apply)"
  echo "- caps: \$$CAP per run · min tool calls per task $MIN · trio timeout ${TRIO_TIMEOUT:-420} s"
  echo "- balance before: \$$BEFORE"
  echo "- started: $(date -Iseconds)"
  echo
  i=0; for t in "${TASKS[@]}"; do i=$((i+1)); echo "## Task $i"; echo; echo '```'; echo "$t"; echo '```'; echo; done
} > "$RUN/config.md"
python3 - "$RUN/run.json" "$ID" "$SPEC" "$LINES" "$CAP" "$BEFORE" "$COMMIT" "$HOLDOUT" "$RERUN" <<'PY'
import json, sys, time
f, i, spec, lines, cap, before, commit, holdout, rerun = sys.argv[1:]
json.dump({"id": i, "spec": spec, "lines": lines.split(","), "cap_usd": float(cap), "balance_before": float(before), "commit": commit, "holdout": holdout == "true", **({"rerun_of": rerun} if rerun else {}), "started": time.time(), "tasks": []}, open(f, "w"), indent=2)
PY

# ADR-0022: the run starts from the mapping minus its own lines and promotes into that copy, never into mappings/.
node scripts/eval-mapping-in.mjs "$SPEC" "$LINES" "$RUN/mapping-in" | tee -a "$RUN/config.md"
export TRIO_PATCH="$REPO/.chat-out/eval-$ID-cordis.yml"
mkdir -p "$REPO/.chat-out"
python3 - "$REPO/.dsh-dev/cordis.yml" "$TRIO_PATCH" "$REPO/$RUN/mapping-in" <<'PY'
import sys
src, dst, mdir = sys.argv[1:]
out, done = [], False
for line in open(src):
    out.append(line)
    # The jeromy plugin row's config: viewFps is its last key; mappingsDir goes beside it.
    if not done and line.strip().startswith("viewFps:"):
        out.append(line[: len(line) - len(line.lstrip())] + f"mappingsDir: '{mdir}'\n"); done = True
if not done: sys.exit("no viewFps key in the jeromy plugin row; cannot set mappingsDir")
open(dst, "w").write("".join(out))
PY
[ $? -eq 0 ] || { echo "[eval-run] could not write the run's patch; stop" >&2; exit 1; }

# The view only reports the ROM name; a handoff does not refresh the plugin's ROM identity (docs/issues.md), so a different game means a full down/up.
want="$(basename "${ROM//\\//}")"
have="$(curl -sf --max-time 3 http://127.0.0.1:9002/status | python3 -c 'import sys,json; print(json.load(sys.stdin).get("rom") or "")' 2>/dev/null)"
if [ "$have" != "$want" ]; then
  echo "[eval-run] loaded ROM is '${have:-none}', spec wants '$want': up.sh --down && up.sh"
  scripts/up.sh --down >/dev/null 2>&1
  scripts/up.sh "$ROM" > "$RUN/up.log" 2>&1 || { scripts/up.sh --down >/dev/null 2>&1; scripts/up.sh "$ROM" >> "$RUN/up.log" 2>&1 || { echo "[eval-run] bridge down after two up.sh attempts; stop" >&2; exit 1; }; }
fi
curl -sf --max-time 3 http://127.0.0.1:9002/status | grep -q '"connected":true' || { echo "[eval-run] view not connected; stop" >&2; exit 1; }
curl -sf -X POST --max-time 3 http://127.0.0.1:9002/clicks/clear >/dev/null
curl -sf -X POST --max-time 3 -H 'content-type: application/json' -d '{"action":"resume"}' http://127.0.0.1:9002/control >/dev/null

# Cost cap: the balance is polled while a task runs; past the cap the headless dsh is stopped.
watch_cap() {
  while sleep 20; do
    now="$(balance)"; [ -n "$now" ] || continue
    if python3 -c "import sys; sys.exit(0 if $BEFORE - $now > $CAP else 1)"; then
      echo "[eval-run] cost cap \$$CAP exceeded (balance $now); stopping the run" >&2
      pkill -f -- "--profile headless" ; touch "$RUN/.capped"; return
    fi
  done
}

i=0; START=$(date +%s)
for t in "${TASKS[@]}"; do
  i=$((i+1))
  [ -f "$RUN/.capped" ] && break
  echo "=== task $i"
  watch_cap & WPID=$!
  t0=$(date +%s)
  scripts/trio.sh --blind --task "$t" "$MIN" | tee "$RUN/streams/task-$i.trio.txt"
  kill "$WPID" 2>/dev/null; wait "$WPID" 2>/dev/null
  out="$(sed -n 's/^\[trio\] streams in //p' "$RUN/streams/task-$i.trio.txt" | tail -1)"
  sid="$(sed -n 's/.*replay: scripts\/dsh-log.mjs show \([0-9a-f-]*\).*/\1/p' "$RUN/streams/task-$i.trio.txt" | tail -1)"
  [ -n "$out" ] && cp "$out/custom.jsonl" "$RUN/streams/task-$i.jsonl"
  # A turn that ended on a provider error (2026-10-09: MALFORMED_RESPONSE, a tool call streamed as invalid JSON)
  # lost the task's work; resume the same session once so what it had found can still be proven and recorded.
  if [ -n "$sid" ] && [ ! -f "$RUN/.capped" ] && grep -q '"phase":"turn_end".*"kind":"error"' "$RUN/streams/task-$i.jsonl" 2>/dev/null; then
    echo "[eval-run] task $i ended on an error; resuming session $sid once"
    echo "- task $i: turn ended on an error ($(grep -o '"code":"[A-Z_]*"' "$RUN/streams/task-$i.jsonl" | tail -1)); resumed once with \"continue\"" >> "$RUN/config.md"
    TRIO_SESSION_ID="session-$sid" scripts/trio.sh --blind --task "continue" 1 | tee "$RUN/streams/task-$i.r1.trio.txt"
    rout="$(sed -n 's/^\[trio\] streams in //p' "$RUN/streams/task-$i.r1.trio.txt" | tail -1)"
    [ -n "$rout" ] && cp "$rout/custom.jsonl" "$RUN/streams/task-$i.r1.jsonl"
  fi
  if [ -n "$sid" ]; then
    node scripts/dsh-log.mjs show "$sid" --images "$RUN/images/task-$i" > "$RUN/transcripts/task-$i.txt" 2>&1
  fi
  python3 - "$RUN/run.json" "$i" "${sid:-}" "$t0" "$(date +%s)" <<'PY'
import json, sys
f, n, sid, t0, t1 = sys.argv[1:]
r = json.load(open(f)); r["tasks"].append({"n": int(n), "session": sid, "seconds": int(t1) - int(t0)}); json.dump(r, open(f, "w"), indent=2)
PY
done

sleep 5; AFTER="$(balance)"
python3 - "$RUN/run.json" "${AFTER:-}" "$START" "$(date +%s)" <<'PY'
import json, sys
f, after, s, e = sys.argv[1:]
r = json.load(open(f))
if after: r["balance_after"] = float(after); r["cost_usd"] = round(r["balance_before"] - float(after), 4)
r["wall_seconds"] = int(e) - int(s); json.dump(r, open(f, "w"), indent=2)
PY
{
  echo "- balance after: \$${AFTER:-?} · ended: $(date -Iseconds)$( [ -f "$RUN/.capped" ] && echo ' · STOPPED AT COST CAP')"
} >> "$RUN/config.md"
{
  echo "# Sessions: $ID"; echo
  python3 -c "
import json; r = json.load(open('$RUN/run.json'))
for t in r['tasks']: print(f\"- task {t['n']}: session \`{t['session'] or '?'}\` · {t['seconds']} s · replay: \`scripts/dsh-log.mjs show {t['session']} --images $RUN/images/task-{t['n']}\`\")
print(f\"\nCost: \${r.get('cost_usd', '?')} (balance before \${r['balance_before']}, after \${r.get('balance_after', '?')}).\")
"
} > "$RUN/sessions.md"
rm -f "$RUN/.capped"
node scripts/eval-grade.mjs "$RUN"
echo "[eval-run] record in $RUN: judge the pending rows from images/, then write report.md"
