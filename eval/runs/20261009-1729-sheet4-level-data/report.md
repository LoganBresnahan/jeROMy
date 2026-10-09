# Report: 20261009-1729-sheet4-level-data

First run of sheet 4 (the level data) on SMB: World 1-1's layout and enemy
data (task 1), the area and enemy pointer tables (task 2), each task in a
throwaway hack (removed; the `default` ledger's checksum unchanged).
deepseek-flash, blind, $0.15, 180 tool calls.

## Distribution (spec v8)

| Stage | Count |
|---|---|
| lines in scope | 3 |
| attempted | 3 |
| reached proof (ledgered write, reset, look) | 3 |
| recorded | 3 |
| derived | 0 by the grader's rule (no diff or search listed the bytes; the model found them by disassembling the area parser and the enemy spawner and following their pointers, which the grader cannot see) |
| promoted | 3 (1-1 as a `level` entry; the two tables as notes) |
| graded right | 3: 1-1 layout `$A690` (inside L_GroundArea6) and enemies `$9F01` (inside E_GroundArea6); the area-data pointer tables `$9D2C`/`$9D4E` (+ `$9D28` H-offsets); the enemy-data pointer tables `$9CE4`/`$9D06` (+ `$9CE0`) |
| graded wrong | 0 |
| cost (USD), tool calls, wall time | 0.15, 180, about 17 min |

The proofs, checked by Claude from the images: writing the parser's skip
marker `$FD` into 1-1's layout data removed the high ? block above the
brick row (`images/task-1/801dc28a1ac3.png` against the restored
`55d5fc8b9d0a.png`); writing the end-of-list `$FF` at the start of 1-1's
enemy list left Mario at the first pipe with no Goomba
(`e80df4990d58.png`).

Unproven duplicates: one summary note listed many origins at once (both
tables, loader and spawner code at `$94DE`, `$C147`, `$9C02`-`$9CC3`) with no
proof of its own; the claims it repeats are proven on their own rows.

## Grader change made because of this run

Spec v8: the area-pointer line excludes "enemy". Under v7 the
"area-enemy-data-pointer-table" claim tied both pointer lines on vocabulary
and landed on the area line as `disagrees`; it is right on the enemy line.

## Ledger

F5: three lines over two tasks, none dropped. F12: no reset errors. F1: no
provider errors. F10: the copy held back nothing (no sheet-4 entries
existed). No new failure.

## The change this run argues for

None to the worker. The grader's `derived` misses "found by reading the
code that walks the data" (disassemble, then follow a pointer); worth a
rule if more sheet-4/5 lines are found that way.
