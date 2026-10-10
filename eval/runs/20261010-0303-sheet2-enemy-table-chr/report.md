# Report: 20261010-0303-sheet2-enemy-table-chr

Sheet 2's last two lines on SMB: the PRG table of enemy metasprite tiles
and the CHR origin of a tile. Two blind tasks; web tools off; ROM writes in
the throwaway hack `eval-sheet2-c`, all undone (removed after the run; the
`default` ledger's checksum unchanged; the active hack `default`).
deepseek-flash, $0.11, 97 tool calls, about 8 minutes.

## Distribution

| line | claim | reference | proof | verdict |
|---|---|---|---|---|
| B3.enemy_sprites | `$E73E-$E841` (260 bytes; the Goomba's entry `FC FC 70 71 72 73` at prgRom `0x6794`) | EnemyGraphicsTable `$E73E`, 258 bytes | write+reset+look | **wrong** (extent) |
| B5.chr | the Goomba's top-left tile `$70`, CHR ROM `0x700`, 16 bytes | (judged) | ledgered write_tile, reset, look | right |

B5 is judged from `task-2/30ac7435bc3d.png`: after the CHR write the
Goomba shows the written pattern in its right top quarter, where a
left-walking (h-flipped) Goomba draws `$70`, as the claim's notes predict.

Spec v21: "enemy sprite layout table" tied the player-sprites line on
"sprite layout"; that line excludes enemy.

## Why B3 is wrong

The start is exact and the Goomba's entry and its proof are right, but the
claimed length runs two bytes past the table into EnemyGfxTableOffsets
(`$E840`). The task said "as far as you can bound it", and the worker
bounded it by eye. An edit trusting that length would land in the offsets
table. Ledger F20.

## The change this run argues for

A step in `persist-edit`: a table's length is a claim, settled by the code
that indexes it (its largest index or loop bound) or by where the next
table starts. The re-run of B3, three repeats, measures it. Sheet 2 is at
9 of 10.
