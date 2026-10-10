# Grades: 20261010-0303-sheet2-enemy-table-chr

Reference: smbdis (doppelganger), ca65 port by threecreepio. Spec: Super Mario Bros. (World) v21. One row per claim (eval/README.md); `final` is the reference verdict held to the proof step.

| line | claim | at | evidence (proof) | reference | final | grader | image |
|---|---|---|---|---|---|---|---|
| (none) | enemy sprite layout table — PRG ROM table of 8x8 sprite tile ids (sprite pattern table $0000) used to compose each enemy's/sprite's metasprite. It i | enemy sprite layout table | look, promoted | needs-judge | pending | claude |  |
| B3.enemy_sprites | enemy sprite layout table — PRG ROM table of 8x8 sprite tile ids (sprite pattern table $0000) used to compose each enemy's/sprite's metasprite. It i | $E73E-$E841 | write+reset+look, derived by diff, promoted | disagrees (expected EnemyGraphicsTable $E73E+258; here: EnemyGraphicsTable) | disagrees | reference |  |
| B5.chr | CHR origin of the Goomba top-left tile — The Goomba metasprite's top-left body tile is CHR $70 (tile 112) in the SPRITE pattern table $0000, so its 16 pixel-byte | chr:0x070 | look, promoted | needs-judge | confirmed | claude | task-2/30ac7435bc3d.png: after the ledgered write_tile to CHR ROM $700 (sprite table 0, tile $70) and a reset, the Goomba beside Mario shows the written pattern in its right top quarter, where a left-walking (h-flipped) Goomba draws $70; rom_origins chrRom 0x700, 16 bytes = table 0 * $1000 + $70 * 16 |
| (none) | CHR origin of the Goomba top-left tile — The Goomba metasprite's top-left body tile is CHR $70 (tile 112) in the SPRITE pattern table $0000, so its 16 pixel-byte | chr:0x070 | none, not in any diff, promoted | unplaced | unplaced | reference |  |
