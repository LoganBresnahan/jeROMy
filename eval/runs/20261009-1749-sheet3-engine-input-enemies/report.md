# Report: 20261009-1749-sheet3-engine-input-enemies

First run of the rest of sheet 3 on SMB: engine state (frame counter, game
mode, pause flag), input and randomness (controller 1, RNG), and the enemy
slot arrays (type, x, y), as three tasks. deepseek-flash, blind, $0.23, 384
tool calls.

## Distribution (spec v9)

| Stage | Count |
|---|---|
| lines in scope | 8 |
| attempted | 8 |
| reached proof | 8 (write+look 5, watch 3) |
| recorded | 8 |
| derived | 5 (joypad, enemy type, enemy y not in a diff listing; the type slot came from tracing the sprite writer) |
| promoted | 8 |
| graded right | 8: `$0009` frame counter, `$0770` OperMode, `$0776` GamePauseStatus, `$06FC` SavedJoypad1Bits, `$07A7`+7 PseudoRandomBitReg, `$0016`+6 Enemy_ID, `$0087`+6 Enemy_X_Position, `$00CF`+6 Enemy_Y_Position |
| graded wrong | 0 |
| cost (USD), tool calls, wall time | 0.23, 384, about 22 min |

One side discovery, right: `$006E`+6, the enemies' x page (Enemy_PageLoc).
Proof checked by Claude from the image: writing type 11 to slot 0 turned
the Goomba into a red Koopa Troopa (`images/task-3/b5b32d016920.png`).

## Spec change made because of this run (v9)

The enemy slot lines now span six bytes, SMB's six enemy slots (from the
source: `Enemy_X_Position` `$87` to `Fireball_X_Position` `$8D`). Under v8
the three array claims, each starting exactly on its symbol, graded
`disagrees` because the equates carry no size. Falsification gained a
six-slot claim that must agree and a seven-slot one that must not.
Ledger F9 again (a spec line wrong about the game).

## Ledger

F5: at most three lines per task, none dropped. F1: no provider errors.
F2 did not show: every line changed with play or could be written and seen.

## The change this run argues for

None to the worker. Task 3 took 244 calls for three arrays; the enemy
lines are slow (an enemy only appears after walking, dies, and the slot
order shifts), which a save state near the first Goomba would cut.
