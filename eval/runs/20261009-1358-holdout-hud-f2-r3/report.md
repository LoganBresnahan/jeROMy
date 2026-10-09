# Report: holdout-hud-f2, three repeats (r1-r3), holdout

## Question for Logan (blocks the F2 measurement)

The holdout cannot measure the `find-variable` route for values play
cannot change: all three repeats hit the 900 s trio cap before recording
anything. On Zelda the cap is spent on name registration, idle deaths, and
four values in one task (ledger F6, `holdout-only`). Changing the cap or
the task because of holdout grades is tuning against the holdout (ADR-0020
§5), so I have not. Options, your call:
(a) a longer cap for every run (1800 s), justified as harness, not tuning;
(b) a holdout task fact that skips setup ("a save state in slot N starts on
the first screen", made once by hand, the same for every holdout run);
(c) leave it: F2 stays unmeasured until an SMB line needs the route with no
recall to lean on.

## What happened

A re-run of `20261009-1209-holdout-sheet3` task 1 (rupees, bombs, keys,
hearts), same text, three repeats after the F2 route was added. Runs
`20261009-1327-…-r1`, `20261009-1343-…-r2`, `20261009-1358-…-r3`; about
$0.47 for the series (balance $7.99 → $7.52); 240, 199, 160 tool calls.

| line | before | r1 | r2 | r3 |
|---|---|---|---|---|
| C1.rupees | not recorded | not recorded | not recorded | not recorded |
| C1.bombs | not recorded | not recorded | not recorded | not recorded |
| C1.keys | not recorded | not recorded | not recorded | not recorded |
| C1.hearts | not recorded | not recorded | not recorded | not recorded |

- **r1:** tried a guessed block (`$0671`-`$0673`, wrong, rejected by its
  own write), then traced the HUD's tile writer (`$A0D6`) and got the
  counters to show written values (`X11`, `X7`) just before the cap.
- **r2:** used the new route: an `unchanged` diff, then `equals` narrowing
  per counter (11, 8, 7, values it had put there through the HUD), then
  hearts; no bisection or proof before the cap.
- **r3:** spent most of its calls on hearts (damage diffs); one diff in the
  last stretch.

Did the SMB gain carry? Unknown, not measured: the route was attempted in
one of three repeats and not finished in any. No regression: the lines were
not recorded before either.

## Ledger

F2 stays `changed` (holdout check not reached); F6 seen three more times.
No provider error in these repeats (the debug line did not fire).
