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
- **Status:** `fixed` (reopened once). Fixed once (`20261009-1241-sheet5-routines`
  task 2, one resume), then `sheet3-worldlevel-rerun` r1 and r3 were lost
  with one resume each (r1's resume failed in four seconds, r3's after 15
  calls). Five of fifteen tasks so far. The error is not deterministic: a
  manual resume of r3's session later completed. Runner now resumes up to
  three times. Root cause (`20261009-1414-sheet5b`, captured by an env-gated
  debug line in the dsh checkout, removed at the end of the session): the
  model writes hex literals in JSON tool arguments
  (`{"address": 0x8182, "length": 80}`), carrying the prompt's prose hex
  rule into JSON. Changed: a prompt line, "tool arguments are JSON with
  decimal numbers" (checked live). Fixed: no `MALFORMED_RESPONSE` in the
  fourteen tasks since (sheet2-text-tiles through sheet2-tiles-rerun2).
  Seen once more in `20261009-2322-sheet1-scenes` task 2 (after 5 calls, the
  first in about thirty tasks); the runner's resume finished the task, so
  nothing was lost. The cause was not captured (the debug line is out of the
  dsh checkout); if it recurs twice more, put the capture back.
- **A re-run checks:** no `MALFORMED_RESPONSE` across the next runs' tasks;
  if one appears, the debug capture says whether it is still hex.

## F2. A value that play cannot change quickly has nothing to diff

- **Seen:** `20261009-1209-holdout-sheet3` task 1 (rupees, bombs and keys
  start at zero; nothing on the first screens changes them; 173 calls, 900
  s cap, nothing recorded). On SMB the same gap was hidden by recall: world
  and level (`20261009-1135`) were found by reading "the likely header
  block", not by a diff (F4).
- **Lines hit:** SMB C1.world, C1.level (found, but not by the method),
  C2.power, C2.star (not yet run); Zelda C1.rupees, C1.bombs, C1.keys
  (holdout).
- **Changed:** `find-variable` "When play cannot change the value": narrow
  by `equals` the shown value and `unchanged` across play until every
  survivor is listed, then bisect with writes, a forced redraw and save
  states (commit after `06957a4`).
- **Status:** `changed`; partly measured. On SMB (`sheet3-worldlevel-rerun`)
  the one completed repeat went to the remembered block and skipped the
  route; on the holdout (`holdout-hud-f2` r1-r3) every repeat hit the time
  cap first (F6). From the hand-made start state (`holdout-hud-start`
  r1-r3, ADR-0023) the route ran and reached the right bytes in every
  repeat, but nothing was recorded (F13), so there is still no claim to
  grade.
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
- **Status:** `fixed` (`sheet3-hud-rerun3` r1-r3, clean hold-back: score
  right 3/3, distinct digits across the range and one past each end 3/3).
  The earlier `sheet3-hud-rerun2` series was contaminated (F10).
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
- **Status:** `open` (a measurement, not a defect to fix). Logan decided
  2026-10-09: SMB lines count when `agrees` and proven; `derived` is
  reported beside it as the method's number, and the holdout carries the
  claim that the method generalises.
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
- **Changed:** holdout runs start from a save state Logan made by hand
  (ADR-0023, his answer to `holdout-hud-f2-r3`'s question); `load_state`
  takes a file from Mesen's SaveStates folder.
- **Status:** `fixed` for the holdout: `holdout-hud-start` r1-r3 spent no
  call on setup. SMB's setup is two Start presses.
- **A re-run checks:** n/a until an SMB run shows it.

## F7. A broken tool

- **Seen:** `20261009-1135` task 2: `disassemble` failed twice with
  `cs_open failed for arch=6502` while tracing `$03AD`'s writer; the model
  decoded the bytes by hand.
- **Lines hit:** every sheet-5 line; the x/scroll derivation in sheet 3.
- **Changed:** three fixes in `src/agent/disassembler.ts` with a test
  against the real WASM; verified live through dsh (commit `7593dc6`).
- **Status:** `fixed` (`20261009-1241-sheet5-routines`: 19 calls, no errors).
- **A re-run checks:** sheet-5 streams show `disassemble` results, no errors.

## F8. A wrong statement promoted into the mapping cannot be taken back

- **Seen:** `20261009-1135` promoted `$0086` with "No separate player page
  byte was found". `20261009-1144` proved `$006D` and recorded a note
  correcting it, but the merge never overwrites, so the file holds both.
- **Lines hit:** any line a later run corrects.
- **Changed:** nothing. A session has no way to retract or amend an entry
  (ADR-0021 keeps "a later discovery fills gaps, never overwrites").
- **Status:** `fixed` by ADR-0022 (`sheet3-x-rerun` r1-r3: `$0086` replaced
  by a 3/3-right entry; the wrong sentence is gone). Residue: notes are
  never replaced, so a note correcting a sentence outlives the sentence.
- **A re-run checks:** n/a until the decision.

## F9. A spec line that is wrong about the game

- **Seen:** `20261009-1144`: C1.coins accepted only `CoinTally`; SMB also
  keeps the HUD's own coin digits and the game increments both, so a right
  claim graded `disagrees` until spec v2.
- **Lines hit:** C1.coins.
- **Changed:** spec v2 accepts either; the scorer learned
  `Name+offset:span` references (commit `7ec93e5`).
- **Status:** `fixed` (both SMB runs regraded under v2). Seen again in
  `20261009-1428-sheet2-text-tiles` (B4.game_text accepted only the first of
  the text table's nine labelled strings; spec v6) and in
  `20261009-1749-sheet3-engine-input-enemies` (the enemy slot lines read the
  equates as one byte; SMB has six slots; spec v9), in
  `20261009-1729-sheet4-level-data` (v8) and
  `20261009-1814-motion-physics-loader` (v11): two lines tying on
  vocabulary. Each spec change is versioned and every run regraded; the
  pattern says the matcher's tie-break (first line wins) deserves a rule,
  e.g. prefer the line whose reference agrees only when both tied lines
  are of the same class.
  `20261009-2240-sheet1-overworld-title` tied twice ("ground brick" on brick,
  "small Mario sprite palette" on the metasprite); the matcher now lets a
  tile's `group` decide first and picture lines take only their `kinds`
  (spec v13), so both landed right on regrade.
  `20261009-2340-sheet3-player-state` tied twice more (`player_y_page` on
  the x-page and y lines; `player_swimming_flag (water-area flag)` on the
  area line, since `swimming` is no prefix match for `swim`); spec v14.
- **A re-run checks:** when a proven claim grades `disagrees`, check the
  line against the source before calling the claim wrong, and record a
  spec change as a spec version, never silently.

## F10. A re-run starts from its own earlier answer

- **Seen:** before the first re-run with three repeats (2026-10-09): the
  prompt's Known Addresses carry every promoted entry, so a re-run of
  C1.score would have started from the wrong `$07DE` claim it is meant to
  rediscover, and a right line would pass by reading its answer.
- **Lines hit:** every line a run has already promoted.
- **Changed:** `scripts/eval-mapping-in.mjs` writes the mapping minus the
  in-scope lines' entries (each line's `entry`); `eval-run.sh` points the
  plugin's `mappingsDir` at that copy for the run, which also promotes
  there, not into `mappings/`.
- **Status:** `fixed` (reopened once). The held-back entries were out of the
  prompt, but other entries named the same addresses: the score series'
  copy mentioned `$07DD` six times and the coin and timer digits often
  (sheet 5's routine notes, the coin tally's description), and the
  sheet2-tiles re-run's copy mentioned `$8C8C` and `$6ED3`. Those two
  series' right answers are not clean measurements; both are re-run.
  `eval-mapping-in.mjs` now also holds back every entry and note that names
  a held-back address or a held-back entry's ROM origin (the world/level
  series' copy was clean). Fixed: `sheet3-x-rerun` and `sheet3-hud-rerun3`
  copies named none of their answers.
  Seen a third time in `20261009-2240-sheet1-overworld-title`, a first run:
  hand-made entries from 2026-10-05 that no spec line named (sprite
  `mario_small_standing`, sprite palette 4, the cloud tiles the bush shares,
  font digit 0, and the `statusbar_text_table` note giving the HUD layout
  and every letter's tile id) were in the prompt; task 2 read the sprite's
  tile ids from it. Those five lines (bush, small Mario, Mario's palette,
  HUD, font) were not promoted (`eval-promote.mjs --skip`, which also keeps
  their claims out as side discoveries) and are re-run. The entries are now
  the lines' `entry`/`entries`; a line may own `notes` (held back by its
  vocabulary), and only address and routine keys count as addresses when
  holding back what names them.
- **A first run checks too:** before a sheet's first run, list the
  mapping's entries no line names, and tie any that answer an in-scope line.
- **A re-run checks:** `config.md` lists the entries held back, and the
  session's prompt (`dsh-log.mjs show <id> --system --full`) does not
  contain them. A one-step session's prompt has no mapping at all (the
  bridge connects after the first prompt is built): check a later step.

## F11. trace_writes refused while the game is paused

- **Seen:** `20261009-1135` task 2 and `20261009-1241-sheet5-routines`
  task 1: `trace_writes needs frames to run and the emulator is paused`.
- **Lines hit:** none lost; one wasted call each time.
- **Changed:** nothing. The refusal is by design (ADR-0013: only named
  tools run frames) and its message says to resume first.
- **Status:** `open` (minor). Revisit if a run loses a line to it.
- **A re-run checks:** n/a.

## F12. A paused reset answers after its timeout

- **Seen:** `20261009-1428-sheet2-text-tiles` task 2: both `reset_emulator`
  calls (game paused) failed "timed out after 6000ms"; the Lua log shows
  each completing after exactly 6 s. The reset happened; the proof step
  was lost, and two right origins graded `unproven`. A paused reset also
  comes back `paused: false`, though bridge.lua says it stays paused.
- **Lines hit:** B2.metatiles, B3.player_sprites; any origin proof.
- **Changed:** the adapter's reset timeout is `frames × 400 ms + 5 s`
  (17 s for 30 frames); a paused reset through dsh checked live.
- **Status:** `fixed` (`sheet2-tiles-rerun` r1-r3: no reset error, both lines
  `write+reset+look` in all three). The `paused: false` after a paused reset
  remains (cosmetic; no line lost to it).
- **A re-run checks:** no `reset_emulator` error in the streams, and the
  origin lines reach `write+reset+look`.

## F13. Every record held until all values are settled; the cap ends it first

- **Seen:** `20261009-2153`/`2209`/`2224-holdout-hud-start` r1-r3: each
  repeat had written and seen the HUD follow at least one right byte
  (hearts `$066F`/`$0670`; rupees, keys in r2-r3) and recorded none before
  the 900 s cap, spending the time decoding the next value instead.
- **Lines hit:** Zelda C1.rupees, C1.bombs, C1.keys, C1.hearts (holdout).
- **Changed:** nothing (holdout: ADR-0020 §5).
- **Status:** `holdout-only`. SMB runs record line by line; if an SMB
  four-line task shows it, the change is a task or skill line "record each
  value as soon as its proof screenshot is taken".
- **A re-run checks:** a claim per proven value, in the order proven.

## F14. search_memory refused the CPU address space

- **Seen:** `20261009-2209` and `2224-holdout-hud-start`:
  `search_memory {"mem_type":"cpuDebug"}` → `bridge.lua: invalid memory
  type`; the tool's own description offers `cpuDebug`.
- **Lines hit:** any line whose search is over RAM by value (sheet 3).
- **Changed:** `bridge.lua` `search_memory` sizes `cpu`/`cpuDebug` as 64 KiB
  and `ppu`/`ppuDebug` as 16 KiB when Mesen will not size them.
- **Status:** `fixed` (checked live through the bridge before sheet 1).
- **A re-run checks:** no `invalid memory type` in any stream.

## F15. A number read from a tool result in the wrong base

- **Seen:** `20261009-2253-sheet1-rerun-r1`: `read_nametable` gave WORLD's W
  as 32; the worker wrote it `$14` (20 decimal), recorded font tile `$114`
  as W (it is K) and put `$14` in its HUD note. r2 and r3 read it right.
- **Lines hit:** A7.font (one tile), A6.hud (that repeat).
- **Changed:** nothing yet: one of three repeats, and the majority held.
- **Status:** `open`, watch. If it recurs, the change is in the tool, not
  the prompt: `read_nametable` (and the other tile tools) giving ids as hex
  strings beside the numbers, as `get_pixel_color` already gives
  `nes_color_hex`.
- **A re-run checks:** each claimed tile id renders as what its name says.

## F16. A target far into a level is never reached

- **Seen:** `20261010-0016-sheet1-powerups-koopa-flag` task 3: to reach the
  Koopa and the flagpole the worker wrote Mario's position and the camera
  bytes; the screen did not follow and the cap ran out (216 calls, nothing
  recorded). Playing (held Right+B, jumps) did make progress, too late.
- **Lines hit:** A4.koopa, A3.flagpole (and anything placed late in a level:
  A4.star, sheet 4's later objects).
- **Changed:** a new skill, `play-to-reach` (checkpointed stretches of play;
  never teleport by writing position).
- **Status:** `changed`; the re-run measures it.
- **A re-run checks:** the target is on screen in a screenshot, reached by
  play with save states, before half the cap.

