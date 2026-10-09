# Report: sheet3-hud-rerun3, three repeats (r1-r3)

The clean re-run of `20261009-1144-sheet3-hud-rerun` task 1 (coins,
timer, score) after the `find-variable` extent step (ledger F3), replacing
the contaminated `sheet3-hud-rerun2` series. Same task text. Each repeat
started from the mapping without the three lines' entries and without
every entry or note naming their addresses (the coin tally, three routines,
one note: the broader hold-back, ledger F10). Runs
`20261009-1524-…-r1`, `20261009-1644-…-r2`, `20261009-1656-…-r3`
(`20261009-1539-…-r2` was interrupted by a restart and is not counted);
$0.15, $0.10, $0.08.

## Against 20261009-1144

| line | before | r1 | r2 | r3 | series |
|---|---|---|---|---|---|
| C1.coins | agrees | agrees, derived | agrees | agrees, derived | same (3/3) |
| C1.timer | agrees, derived | agrees, derived | agrees, derived | agrees, derived | same (3/3) |
| C1.score | disagrees, derived | agrees, derived | agrees | agrees, derived | **better (3/3)** |

## Ledger checks

- **F3 (a proof that cannot tell two extents apart): passed, 3/3, clean.**
  Each repeat wrote distinct digits across the score and one byte past
  each end before recording (`$07DC`-`$07E3` = 1..8 in r1 and r2, 9,1,2,3,4,0,5,6,7
  in r3), and each claimed `$07DD`-`$07E2`.
- **F10 (start from its own answer): passed, 3/3.** Each `config.md` lists
  the entries held back, including the four that only named the answers.
- **F1:** no provider error in three tasks.

## Promoted (ADR-0022)

Score, coins and timer each 3/3 right; entries replaced by r1's.

## The change this run argues for

None. The extent step holds when the answer is not in the prompt.
