# The mapping eval loop

How jeROMy is developed from 2026-10-09 (ADR-0020): a spec says what
"mapped" means, DeepSeek runs blind sessions against it, the reference and
Claude grade the results, and the grades drive the next change to a tool,
skill, prompt or schema. This file is the operating manual Claude follows
during a run; `docs/adr/0020-built-by-an-eval-loop.md` is the decision.

```
eval/
  README.md              this manual
  failures.md            every way a run broke, what changed for it, what a re-run checks
  spec/
    attributes.md        the attribute classes of an NES game (what "mapped" means)
    smb.json             SMB's instances, one line each, with its grading method
    <holdout>.json       the holdout game's instances; never tuned against
  runs/
    <yyyymmdd-hhmm>-<slug>/
      config.md          commit, game, spec version, task text, blind, caps, balance before/after
      sessions.md        dsh session ids, one replay command each, cost
      grades.md          one row per claim: line id, claim, evidence, verdict, grader, image
      images/            the screenshots judged verdicts were made from
      report.md          the distribution, what was learned, what changed because of it
```

## One run, start to finish

1. **Pick the lines.** From `eval/spec/<game>.json`, the unticked lines of
   one sheet (or one scene). A run is one sheet or one scene, never the whole
   game: that keeps a bad run cheap and its diagnosis readable.
2. **Write `config.md` first.** Commit SHA, game SHA1, spec file and its
   version, the exact task text, `blind: true`, the per-run cost cap, the
   balance from `scripts/budget.sh`. If the config is not written, the run
   did not happen.
3. **Bring the loop up.** `scripts/up.sh`; confirm `connected:true` and no
   "unavailable" warning in `.dsh-dev/dsh.log`. Clear shared state: no
   overrides, no pause, no click history.
4. **Run.** `scripts/eval-run.sh --spec eval/spec/<game>.json --slug <slug>
   --lines <ids> --task "<task text>" [--task ...] --min-calls N` does steps
   2 to 5's mechanics: `config.md` and `run.json` first, `up.sh --down &&
   up.sh <rom>` when the loaded game differs (docs/issues.md), clicks and
   pause cleared, each task through `scripts/trio.sh --blind --task` with the
   balance polled against the cost cap, the stream, the replay transcript
   and the screenshots kept, `sessions.md`, then `scripts/eval-grade.mjs`.
   The task names the sheet, the scene and the proof required ("find X, prove
   it by writing it and looking, record it with record_mapping, then
   promote_mappings"), never an address, a label or a table name. One run
   may be several `--task` calls; each goes in `sessions.md`.
5. **Grade.**
   - `scripts/eval-grade.mjs eval/runs/<run>` (run by `eval-run.sh`) reads
     the `record_mapping` calls from the run's streams, assigns each to a
     spec line by its words, grades it with `scripts/score-mapping.mjs`
     against that line's reference symbols, and holds it to its proof step;
     it writes `grades.md` (rows `grader: reference`, picture rows
     `pending`), `grades.json` and `distribution.md`. The run's own claims,
     never the merged mapping file: promotion clears discoveries and a file
     entry is never overwritten.
   - For picture claims: `scripts/dsh-log.mjs show <id> --images
     eval/runs/<run>/images`, Read each image the claim rests on, decide,
     and write the verdict into `<run>/judged.json`, one object per claim:
     `{ "id": "<the record's id>", "verdict": "confirmed" | "rejected",
     "image": "<file>", "why": "...", "line": "<only to reassign>" }`. Say
     in `why` what in the image supports the verdict ("the 16x16 block at
     (64,176) is brown with a rivet pattern; the claim says brick"). Then
     `scripts/eval-grade.mjs <run>` again: the rows read `grader: claude`
     in `grades.md`, and `eval-promote.mjs` takes confirmed pictures like
     any right line.
   - A claim the run recorded without the proof step (no write-and-look, no
     reset for an origin) is `unproven` whatever the reference says.
6. **Report.** `report.md` holds the distribution (table below), two or
   three sentences on why lines failed where they did (from the replay: the
   tool trace, not the final text), and the one change the run argues for.
   Every failure goes into `eval/failures.md` (a new entry, or the run added
   to an existing one) before the run is committed.
7. **Decide the change.** One thing: a tool, a skill step, a prompt line, a
   schema field. A decision gets an ADR; a prompt or skill edit cites the run
   that motivated it (`eval/runs/<run>`) in its commit subject.
8. **Promote what graded right** (ADR-0022). A run starts from the mapping
   minus its own lines and promotes only into `<run>/mapping-in/`.
   `scripts/eval-promote.mjs <run> [<run> <run>]` (all three repeats of a
   re-run together) puts each line graded right and proven into
   `mappings/`, replacing that line's old entry, removes an entry a
   majority graded wrong, fills gaps with side discoveries, and updates the
   spec lines' `status`, `run` and `entry`.
9. **Verify, commit, push.** Tests twice, `npx tsc --noEmit`, `/verify` when
   the emulator-facing code changed, the run directory included. Subject:
   `eval <run-slug>: <what changed> (ADR-NNNN)`.
10. **Holdout at milestones.** After a new skill, a schema change, or every
   five SMB runs: the same sheet's task on the holdout game, graded the same
   way, recorded under `runs/` with `holdout: true` in its config. Nothing is
   tuned from its grades; its report says only whether the SMB gain carried.

## Re-running a sheet

A re-run is a run of lines an earlier run already attempted, after a change
meant to fix why they failed. It is how a change earns `fixed` in
`eval/failures.md`, and how a regression is caught.

1. **Read the ledger first.** In `eval/failures.md`, every entry whose
   "Lines hit" include the lines you are about to run. Each says what a
   re-run must check; those checks go in the report.
2. **Name the run you are redoing.** `scripts/eval-run.sh ... --rerun-of
   <run-id>`: the config records it and `eval-grade.mjs` writes
   `comparison.md`, every line in scope with its final verdict, proof and
   `derived` in the earlier run against this one (`better`, `same`,
   `worse`, `new`).
3. **Keep the task text unless the failure is in the task.** If the ledger
   says the task itself was the problem (F5: too many lines), change only
   that, and say so in `config.md`. Otherwise the same words, so the change
   under test is the only change.
4. **Report against the earlier run.** The report's first table is
   `comparison.md`; then the ledger checks, one line each (passed, failed,
   not reached).
5. **Update the ledger.** An entry moves to `fixed` only when its check
   passed in this run; a check that failed stays `changed` with this run
   added under "Seen"; a new way of failing is a new entry. Commit the
   ledger with the run.
6. **A `worse` line stops the loop** (Stop conditions) unless the replay
   explains it; the question goes at the top of the report.
7. **Three repeats** (Logan, 2026-10-09). A run is one sample of a model
   that varies, so every re-run is run three times, each its own record
   (`<slug>-r1`, `-r2`, `-r3`, all `--rerun-of` the same run). The third
   one's report holds the series: per line, the three outcomes. A ledger
   check passes when it passed in at least two of three; a line is `worse`
   only when it is worse in at least two of three.

A first run of a line is not a re-run, but it still reads the ledger: an
`open` entry that hits the line is a known risk, and the report says
whether it showed.

## Grading vocabulary

| Verdict | Meaning | Grader |
|---|---|---|
| `agrees` | the claim matches the reference symbol or range | reference |
| `disagrees` | the reference names something else at that address/range | reference |
| `unknown-to-reference` | the reference has nothing there; not wrong, not confirmed | reference |
| `confirmed` | the image shows what the claim says | claude |
| `rejected` | the image shows something else; the row says what | claude |
| `unproven` | recorded without the proof step the spec line requires | either |
| `overturned: <by> <date>` | a later human review reversed the verdict; the original stays in the row | logan |

Every `claude` row names its image. A row without an image is not a grade.

## The distribution (what a report shows)

| Stage | Count |
|---|---|
| lines in scope | |
| attempted (the run addressed the line at all) | |
| reached proof (wrote and looked, or reset, or traced) | |
| recorded (`record_mapping` called with the right type) | |
| promoted (`promote_mappings` wrote the file) | |
| graded right (`agrees` or `confirmed`) | |
| graded wrong (`disagrees` or `rejected`) | |
| unproven | |
| cost (USD), tool calls, wall time | |

Movement between stages is the result. "Attempted 12, reached proof 3" says
the skill's narrowing step is the problem; "reached proof 10, recorded 4"
says the recording step is. A scalar alone cannot say which.

## Before the first grade is trusted

Falsification (ADR-0020 §7): a fixture mapping with known-wrong claims (an
address one off, an origin in the neighbouring table, a level range that
spans two levels, a tile named for a different picture) must come back wrong
from `score-mapping.mjs`; the judge rows for the tile must come back
`rejected` from a Claude read. Kept as `scripts/score-mapping.test.mjs` plus
`eval/spec/falsify/` with its own README naming who checked each fixture.

## Stop conditions

From `docs/plans/overnight-2026-10-05.md`, plus the eval-specific ones:

- `scripts/budget.sh` reports `available false`, or a provider error names
  funds. Code and docs work continue; runs stop.
- The bridge is down after two `scripts/up.sh` attempts.
- A run's grades regress against the previous run of the same sheet and the
  replay does not explain why: stop, write the question at the top of the
  report, do not change anything to "fix" it.
- A session writes outside `hacks/`, `mappings/` or the emulator's RAM.
- A single run exceeds its cost cap (default $1).
- A product-scope question (what counts as a scene; whether music is in
  scope): top of the report, move to the next line.

## What Logan reads

`git log --oneline` and `eval/runs/*/report.md`, newest first; the judged
images when a `claude` verdict looks wrong. To overturn one: add
`overturned: logan <date>` to the row, leave the original verdict, and say
why in one line. The next run on that sheet treats the overturned row as
`unproven`.
