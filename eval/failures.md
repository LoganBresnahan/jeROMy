# What breaks: the failure ledger

Every way a run failed, kept so a re-run can address it (eval/README.md,
"Re-running a sheet"). One entry per failure mode, not per run. An entry
names the runs that show it, the spec lines it hits, what was changed
because of it, and what a re-run must check to call it fixed.

Status is one of:

- `open`: seen, nothing changed yet.
- `changed`: a tool, skill, prompt, schema or runner change targets it; a
  re-run has not yet shown it fixed.
- `fixed`: a re-run of the lines it hit shows the failure gone (name the run).
- `holdout-only`: seen only on the holdout game. Recorded, never tuned
  against (ADR-0020 §5); it turns into an SMB entry the day an SMB run shows it.

Entries are never deleted. A fixed entry stays as the record of what the
change bought; if the failure comes back, reopen it with the new run.

## F1. A provider error ends the session mid-task

- **Seen:** `20261009-1135-sheet3-hud-position` task 1: DeepSeek streamed a
  tool call as invalid JSON (`MALFORMED_RESPONSE`) after 11 calls; dsh ended
  the turn and the task's work (one timer diff round) was lost.
- **Lines hit:** C1.coins, C1.timer, C1.score (that run).
- **Changed:** `eval-run.sh` resumes the session once with "continue"
  (`TRIO_SESSION_ID`), and `eval-grade.mjs` joins a task's streams so a
  proof before the error still counts (commit `7593dc6`).
- **Status:** `changed`. Resume is verified on a healthy session, never yet
  after a real provider error.
- **A re-run checks:** when a task's `config.md` shows "resumed once", the
  resumed stream recorded what the first stream had found.

## F2. A value that play cannot change quickly has nothing to diff

- **Seen:** `20261009-1209-holdout-sheet3` task 1 (rupees, bombs and keys
  start at zero; nothing on the first screens changes them; 173 calls, 900
  s cap, nothing recorded). On SMB the same gap was hidden by recall: world
  and level (`20261009-1135`) were found by reading "the likely header
  block", not by a diff (F4).
- **Lines hit:** SMB C1.world, C1.level (found, but not by the method),
  C2.power, C2.star (not yet run); Zelda C1.rupees, C1.bombs, C1.keys
  (holdout).
- **Changed:** nothing. `find-variable` has no route for it; a candidate
  route is "search by the displayed value (`equals`), then write each
  survivor and look", or reach a state where the value changes (a save
  state near a pickup).
- **Status:** `open`.
- **A re-run checks:** the line's claim is `derived` (its address came out
  of the session's own search), not read from a guessed block.

## F3. A proof that cannot tell two extents apart

- **Seen:** `20261009-1144-sheet3-hud-rerun` task 1: the score claimed at
  `$07DE`-`$07E3`; it is `$07DD`-`$07E2`. The proof wrote `0,0,1,2,3,0`,
  which reads the same under both ranges (SMB's ones place is a fixed `0`
  tile; a zero millions digit is blanked). Measured with `bridge-call.mjs`.
- **Lines hit:** C1.score; any multi-digit number (Zelda's rupees later).
- **Changed:** `find-variable` step 7: write a distinct digit to every byte
  and one past each end, claim only the bytes that showed (commit `7ec93e5`).
- **Status:** `changed`.
- **A re-run checks:** C1.score `agrees`, and the stream shows a write of
  distinct digits across the range before the record.

## F4. The worker recalls SMB's RAM map

- **Seen:** `20261009-1135` task 1 reasoning names `$07F8-$07FA` for the
  timer before any search; task 2 went to `$0750` "the likely header block"
  for world and level. `20261009-1144`'s coin claim was not in any diff.
- **Lines hit:** any SMB line; the `derived` column says which claims are
  the method's.
- **Changed:** the grader marks `derived` (commit `7593dc6`); nothing in
  the worker changes, by design.
- **Status:** `open` (a measurement, not a defect to fix). Question to
  Logan at the top of `20261009-1135`'s report: whether SMB lines should
  count only when derived.
- **A re-run checks:** report `derived` beside `right`; a line right but
  not derived is not evidence the method works.

## F5. A many-line task drops the last line

- **Seen:** `20261009-1135` task 2 asked for five values; after x and y the
  model wrote "Now the page byte for x" and never came back to it.
- **Lines hit:** C2.player_x_page (that run).
- **Changed:** the runner's tasks: the re-run gave the x page its own task
  and it came back right.
- **Status:** `fixed` (`20261009-1144-sheet3-hud-rerun`, x page `agrees`).
- **A re-run checks:** at most three or four lines per task.

## F6. Setup and dying eat the time cap

- **Seen:** `20261009-1209-holdout-sheet3` task 1: name registration took
  dozens of calls; Link died twice during idle waits.
- **Lines hit:** Zelda C1.* (holdout).
- **Changed:** nothing.
- **Status:** `holdout-only`. SMB's setup is two Start presses.
- **A re-run checks:** n/a until an SMB run shows it.

## F7. A broken tool

- **Seen:** `20261009-1135` task 2: `disassemble` failed twice with
  `cs_open failed for arch=6502` while tracing `$03AD`'s writer; the model
  decoded the bytes by hand.
- **Lines hit:** every sheet-5 line; the x/scroll derivation in sheet 3.
- **Changed:** three fixes in `src/agent/disassembler.ts` with a test
  against the real WASM; verified live through dsh (commit `7593dc6`).
- **Status:** `changed`: no mapping run has used it since.
- **A re-run checks:** sheet-5 streams show `disassemble` results, no errors.

## F8. A wrong statement promoted into the mapping cannot be taken back

- **Seen:** `20261009-1135` promoted `$0086` with "No separate player page
  byte was found". `20261009-1144` proved `$006D` and recorded a note
  correcting it, but the merge never overwrites, so the file holds both.
- **Lines hit:** any line a later run corrects.
- **Changed:** nothing. A session has no way to retract or amend an entry
  (ADR-0021 keeps "a later discovery fills gaps, never overwrites").
- **Status:** `open`. A decision (an ADR): let a proven later claim
  replace an entry's description, or mark the old sentence superseded.
- **A re-run checks:** n/a until the decision.

## F9. A spec line that is wrong about the game

- **Seen:** `20261009-1144`: C1.coins accepted only `CoinTally`; SMB also
  keeps the HUD's own coin digits and the game increments both, so a right
  claim graded `disagrees` until spec v2.
- **Lines hit:** C1.coins.
- **Changed:** spec v2 accepts either; the scorer learned
  `Name+offset:span` references (commit `7ec93e5`).
- **Status:** `fixed` (both SMB runs regraded under v2).
- **A re-run checks:** when a proven claim grades `disagrees`, check the
  line against the source before calling the claim wrong, and record a
  spec change as a spec version, never silently.
