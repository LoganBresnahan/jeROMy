# Report: 20261009-1144-sheet3-hud-rerun

Sheet 3 on SMB, the lines the first run did not reach: coins, timer, score
(task 1, the same task text as `20261009-1135-sheet3-hud-position` task 1)
and the player's x page (task 2). deepseek-flash, blind, $0.13, 240 tool
calls, 1023 s. No provider error this time.

## Distribution

| Stage | Count |
|---|---|
| lines in scope | 4 (coins, timer, score, x page) |
| attempted (from the replay) | 4 |
| reached proof | 4 |
| recorded | 4 |
| derived (in a diff before it was recorded) | 3: timer, score, x page; coins came from a 283-survivor diff that listed only its first 64 hits, then a read of the display block |
| promoted | 4 |
| graded right | 3: timer `$07F8`+3, coins `$07ED`+2 (spec v2), x page `$006D` |
| graded wrong | 1: score claimed at `$07DE`-`$07E3`; it is `$07DD`-`$07E2` |
| unproven | 0 |
| cost (USD), tool calls, wall time | 0.13, 240, 1023 s |

One more claim, a `note` ("Mario's level x is 16-bit: page `$006D` + low
`$0086`"), judged `confirmed` from `images/task-2/cc4c7be60dff.png` (row in
`grades.md`). It corrects the first run's promoted "no separate player page
byte was found", which was wrong; the mapping file now holds both, the note
saying the earlier sentence is wrong.

Against the first run of the sheet: no regression; the four lines it
reached stay right, and three of the four it missed are now right.

## The spec changed (v1 → v2) because of this run

Graded under v1, the coin claim (`$07ED`-`$07EE`, two BCD digits) came back
`disagrees`: v1's coin line accepted only `CoinTally` (`$075E`). The images
show the claim is right (`images/task-1/c621c934694e.png`: wrote 55,
took a coin, the HUD reads ×56). SMB keeps two coin counts and increments
both: the HUD's display digits at `DisplayDigits+$16` (`OutputNumbers` in
the source: `StatusBarOffset` `$18` minus length 2) and the binary tally
behind 1-ups. The line was wrong, not the claim; v2 accepts either, and
`score-mapping.mjs` learned `Name+offset:span` references so a line can
name bytes the reference reaches only through a label. Both runs are
regraded under v2; the first run's grades did not change.

## Why the score was wrong (from the replay and a measurement)

The model saw `$07E1` step 2→3 when the HUD went 000200→000300, called it
the hundreds digit, and assumed six digits ending in a ones byte:
`$07DE`-`$07E3`. Its proof wrote `0,0,1,2,3,0` and saw `001430`, which
cannot tell the two ranges apart: SMB's ones place is a fixed `0` tile, and
the millions digit `$07DD` is blanked while it is zero. Measured by Claude
with `bridge-call.mjs` (2026-10-09): `$07DD`-`$07E3` = 1..7 drew
`123456` then the fixed `0` at nametable `$2062`-`$2068`; `$07E3` is never
drawn. Recorded in `smb.json`'s score line and as a falsification fixture.

## The change this run argues for

**A proof step in the `find-variable` skill**: for a number drawn as
several digits, write a different digit to every byte of the candidate
range and one past each end, read the display, and claim only the bytes
that showed (a digit that never changes may be a fixed tile). One skill
edit, cited to this run.

## Next

The holdout run on the same sheet (Zelda), due since ADR-0021 (a schema
change) and now also a new skill step.
