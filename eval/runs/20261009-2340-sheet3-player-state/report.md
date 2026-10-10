# Report: 20261009-2340-sheet3-player-state

The last eight sheet-3 lines on SMB, in four blind tasks ordered so each
could use what the one before promoted into the run's copy: the area index
and Mario's vertical page; his power state and the star timer; the crouch
and swim flags; the enemy slots' active flags and states. deepseek-flash,
$0.37, 557 tool calls, about 32 minutes. Held back: the area index (found
as a side discovery by the scenes run), and as holds the enemy-type entry
(its notes name the flag and state arrays) and the timer routine (its notes
name the power byte).

## Distribution

| Stage | Count |
|---|---|
| lines in scope | 8 |
| recorded / reached proof | 8 / 8 |
| derived (in the session's own diff, search or trace first) | 2 (crouch, enemy state) |
| graded right (reference) | 8 |
| graded wrong | 0 |
| promoted | 8 |
| cost (USD), tool calls, wall time | 0.37, 557, 1947 s |

| line | claim | reference | proof |
|---|---|---|---|
| C1.area | `$0760` | AreaNumber | write+look (a different area loaded) |
| C2.player_y_high | `$00B5` | Player_Y_HighPos | watch |
| C2.power | `$0756` (and `$0754`, the size flag) | PlayerStatus, PlayerSize | write+look |
| C2.star | `$079F` | StarInvincibleTimer | write+look |
| C2.crouch | `$0714` | CrouchingFlag | watch, derived |
| C2.swim | `$0704` | SwimmingFlag | watch |
| C3.enemy_flag | `$000F`, 6 slots | Enemy_Flag | write+look |
| C3.enemy_state | `$001E`, 6 slots | Enemy_State | write+look, derived |

Sheet 3 is complete: 30 of 30.

## Recall (F4)

Task 2's reasoning reads "PlayerStatus = $0756 ;0 = small, 1 = big, 2 = fire"
before any search: the worker's memory of the disassembly, label and all.
Six of eight lines are right but not derived. By Logan's call (2026-10-09)
they count, being proven; the holdout carries the method's claim. Task 1
found the area index again by disassembling the level init, as the scenes
run did.

## Grader change

Spec v14: `player_y_page` tied the x-page line and then the y-position line
(the y-page line now takes y/vertical page with three words), and
`player_swimming_flag (water-area flag)` fell to C1.area (`swimming` is not
a five-letter prefix match for `swim`; area now excludes swim). Every SMB
run was regraded under v14: no reference-graded row moved; 13 old picture
side claims in sheet-2 runs now land on sheet-1 lines (pending, out of
those runs' scope).

## Ledger

F9 (two more vocabulary ties), F11 (task 4, `trace_writes` while paused,
once), F4 (above). No provider error.

## The change this run argues for

None to the worker. What is left on SMB: sheet 1's flagpole, Koopa and
power-up pictures (C2.power is now mapped, so a task can make Mario big or
fire by writing it); sheet 2's other palette tables, the enemy sprite table
and the CHR origin; sheet 4's area format, 1-2 and the timer header; sheet
5's VRAM writer and scroll split.

## Note added 2026-10-10 (ledger F17)

Task 2 searched the web for 1-1's star block and fetched Mario Wiki's 1-1 page (the RAM map fetch was blocked, HTTP 403) before recording the power state and star timer; no result contained an address. The claims stand on their own proofs and recall (F4); the run was not blind in ADR-0019's sense. Blind runs no longer have web tools.
