# Report: sheet3-hud-rerun2, three repeats (r1-r3)

A re-run of `20261009-1144-sheet3-hud-rerun` task 1 (coins, timer, score)
after the `find-variable` extent step (ledger F3), three repeats (eval/README.md,
"Re-running a sheet"), each starting from the mapping without these three
lines (ADR-0022, ledger F10). Same task text, byte for byte. Runs:
`20261009-1302-…-r1`, `20261009-1308-…-r2`, `20261009-1312-…-r3`.
deepseek-flash, blind; $0.02, $0.04, $0.03; 88, 60, 54 tool calls.

## Against 20261009-1144, per repeat

| line | before | r1 | r2 | r3 | series |
|---|---|---|---|---|---|
| C1.coins | agrees | agrees, derived | agrees | agrees, derived | same (3/3 right) |
| C1.timer | agrees, derived | agrees, derived | agrees, derived | agrees, derived | same (3/3 right) |
| C1.score | disagrees | agrees, derived | agrees | agrees, derived | **better (3/3 right)** |

No line worse in any repeat. Each repeat's `comparison.md` has its row.

## Ledger checks

- **F3 (a proof that cannot tell two extents apart): passed, 3 of 3.**
  Every repeat wrote distinct digits across the score's bytes before
  recording it (r1 `$07DC`-`$07E4` = 9,1..8; r2 `$07DD`-`$07E2` = 9..4; r3
  `$07DC`-`$07E3` = 1..8), and every repeat claimed `$07DD`-`$07E2`. Two of
  three (r1, r3) also probed one byte past each end as the step says; r2
  wrote only the range. r1 recorded the probe itself as a note, judged
  `confirmed` from `r1/images/task-1/5b5e423dd400.png` (HUD `1234760 ×56`:
  the bytes outside the range never drawn).
- **F10 (a re-run starts from its own answer): passed, 3 of 3.** Each
  `config.md` lists `addresses.0x07ED, addresses.0x07F8, addresses.0x07DE`
  held back; a two-step session through the same per-run patch was checked
  to hold the mapping without the held-back entry (2026-10-09).
- **F4 (recall):** coins were not derived in r2, score not in r2; r1 and r3
  derived all three. Recall did not decide any line here: the score, the
  one line a recalled answer would have got right in 20261009-1144 too, was
  wrong then.

## Promoted (ADR-0022)

`scripts/eval-promote.mjs r1 r2 r3`: score, coins and timer each 3/3 right;
the wrong `$07DE` entry from 20261009-1144 removed and replaced by `$07DD`
(six BCD bytes, millions to tens, fixed `0` ones tile, blank leading zero);
coins and timer entries replaced by r1's; r1's extent note added.

## The change this run argues for

None: the change under test (the extent step) did its job in all three.
Cost of the series $0.09.
