# Report: 20261009-2322-sheet1-scenes

Sheet 1's scene lines on SMB beyond 1-1 and the title: the 'WORLD x-y' card,
World 1-2 (underground), 2-2 (water) and 1-4 (castle), in two blind tasks.
The task said which world each scene is and that the mapping names the
world and level RAM, and that how the game picks the area it loads is not
mapped. deepseek-flash, $0.13, 249 tool calls, about 15 minutes. Notes the
scene lines' vocabulary matches were held back (two card notes).

## Distribution

| Stage | Count |
|---|---|
| lines in scope | 4 |
| recorded / reached proof | 4 / 4 |
| graded right (Claude) | 4 |
| graded wrong | 0 |
| promoted | 4 |
| side discovery | `$0760`, area number: `agrees` (AreaNumber), write+look |
| cost (USD), tool calls, wall time | 0.13, 249, 878 s |

Judged from the screenshots: the card (`task-1/5b900b4b1518.png`, WORLD 1-1,
Mario x 5), 1-2 (`task-1/c3f9cd2ef0f1.png`, blue brick on black), 2-2
(`task-2/8d26304dc825.png`, water and coral), 1-4 (`task-2/3b7ec9d6986d.png`,
gray brick, lava pit). Each `reach` names the writes and inputs, so a later
session can repeat them.

## How the method got there

Writing world and level and losing a life does not change the area loaded
(the card read the new numbers, the level did not change). Task 1 then read
the level-init code with `disassemble`, found the area selector (world base
table plus an area index, then the level-header table), and proved that
writing the area index at `$0760` before Start loads 1-2; task 2 used the
same route for 2-2 (world 2, area index 2) and 1-4. This is the C1.area line
of sheet 3, found and proven as a means to a sheet-1 end; it entered the
mapping as a side discovery (ADR-0022 §3) and the line now names it, so its
own run will hold it back. `derived` is false: the address came from reading
code, which the grader does not count as derivation for an address.

## Ledger

F1 once more (task 2, `MALFORMED_RESPONSE` after five calls; the resume
finished the task). No other failure.

## The change this run argues for

None. Sheet 1 is at 24 of 31; what remains is the flagpole and the Koopa
(further into 1-1) and the power-up pictures (big Mario, mushroom, fire
flower, star, fireball), which need the power state (C2.power, sheet 3,
still open) or the play to earn them.
