# Report: 20261010-0016-sheet1-powerups-koopa-flag

Six of the last seven sheet-1 lines on SMB, in three blind tasks: the super
mushroom and big Mario; the fire flower and the fireball; the Koopa Troopa
and the flagpole (the star is left for a run that can reach its hidden
block). deepseek-flash, $0.41, 397 tool calls, about 27 minutes. Held back:
the old big-Mario tile sets, and as holds the power byte, the size flag and
the enemy-type entry (their notes give big Mario's and the Koopa's tile
ids).

## Distribution

| Stage | Count |
|---|---|
| lines in scope | 6 |
| recorded / reached proof | 4 / 4 |
| graded right (Claude) | 4: mushroom, big Mario, fire flower, fireball |
| graded wrong | 0 |
| not recorded | 2: Koopa, flagpole (task 3 hit the 900 s cap) |
| promoted | 4 |
| cost (USD), tool calls, wall time | 0.41, 397, about 1600 s |

Judged from the screenshots and the sprite CHR: the mushroom (`$76-$79`,
palette 6) on its block (`task-1/788cda51288b.png`); big Mario 16x32
(`$00 $01 / $4C $4D / $4A $4A(h) / $4B $4B(h)`, palette 4) by the pipe
(`task-1/d1d10976ee7b.png`); the fire flower (`$D6 $D6(h) / $D9 $D9(h)`,
palette 5) on the used block (`task-2/283840f1d002.png`); the fireball, one
8x8 entry cycling `$64`/`$65` with flips, palette 6, in flight by Fire Mario
(`task-2/4bd7a8066039.png`). Tasks 1 and 2 got big Mario by play (the power
byte was held back), as the task's facts described.

## Why task 3 failed

The Koopa and the flagpole are far into 1-1. The worker wrote Mario's
position and then the camera bytes to skip there; the screen did not
follow, Mario snapped back or stuck inside a pipe, and most of the cap went
on those writes. When it played instead (held Right+B with jumps) it
cleared the first pipes and reached page 4 before taking a hit, then the
cap ended the session. Ledger F16.

## Grader change

Spec v15: "Fire Mario's fireball" tied the small-Mario line on "mario";
small Mario now excludes fireball, flower, big and super.

## The change this run argues for

A skill for reaching a far point by playing, in checkpointed stretches:
`skills/play-to-reach/SKILL.md` (save_state, a short run of held direction
plus timed jump pulses, a look, load_state on any setback; never write
position to teleport). The re-run of the Koopa and the flagpole, three
repeats, measures it.

## Note added 2026-10-10 (ledger F17)

Task 3 also called the web tools (nothing recorded). Blind runs no longer have them.
