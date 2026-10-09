# The mapping eval loop

How jeROMy is developed from 2026-10-09 (ADR-0020): a spec says what
"mapped" means, DeepSeek runs blind sessions against it, the reference and
Claude grade the results, and the grades drive the next change to a tool,
skill, prompt or schema. This file is the operating manual Claude follows
during a run; `docs/adr/0020-built-by-an-eval-loop.md` is the decision.

```
eval/
  README.md              this manual
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
4. **Run.** `scripts/trio.sh --blind --task "<task text>" <min-calls>`.
   The task names the sheet, the scene and the proof required ("find X, prove
   it by writing it and looking, record it with record_mapping, then
   promote_mappings"), never an address, a label or a table name. One run
   may be several `--task` calls; each goes in `sessions.md`.
5. **Grade.**
   - `scripts/score-mapping.mjs <sha1> --discoveries --json` for every claim
     the reference can answer. Copy its rows into `grades.md` with
     `grader: reference`.
   - For picture claims: `scripts/dsh-log.mjs show <id> --images
     eval/runs/<run>/images`, Read each image the claim rests on, decide,
     and write the row with `grader: claude` and the image filename. Say in
     the row what in the image supports the verdict ("the 16x16 block at
     (64,176) is brown with a rivet pattern; the claim says brick").
   - A claim the run recorded without the proof step (no write-and-look, no
     reset for an origin) is `unproven` whatever the reference says.
6. **Report.** `report.md` holds the distribution (table below), two or
   three sentences on why lines failed where they did (from the replay: the
   tool trace, not the final text), and the one change the run argues for.
7. **Decide the change.** One thing: a tool, a skill step, a prompt line, a
   schema field. A decision gets an ADR; a prompt or skill edit cites the run
   that motivated it (`eval/runs/<run>`) in its commit subject.
8. **Verify, commit, push.** Tests twice, `npx tsc --noEmit`, `/verify` when
   the emulator-facing code changed, the run directory included. Subject:
   `eval <run-slug>: <what changed> (ADR-NNNN)`.
9. **Holdout at milestones.** After a new skill, a schema change, or every
   five SMB runs: the same sheet's task on the holdout game, graded the same
   way, recorded under `runs/` with `holdout: true` in its config. Nothing is
   tuned from its grades; its report says only whether the SMB gain carried.

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
`rejected` from a Claude read. Kept as `scripts/score-mapping.test.ts` plus
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
