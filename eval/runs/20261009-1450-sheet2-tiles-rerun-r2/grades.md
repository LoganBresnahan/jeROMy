# Grades: 20261009-1450-sheet2-tiles-rerun-r2

Reference: smbdis (doppelganger), ca65 port by threecreepio. Spec: Super Mario Bros. (World) v6. One row per claim (eval/README.md); `final` is the reference verdict held to the proof step.

| line | claim | at | evidence (proof) | reference | final | grader | image |
|---|---|---|---|---|---|---|---|
| (none) | question_block_2x2 tile table (? block 16x16 quadrants) — PRG source of the four 8x8 tile ids that make up the 16x16 ? block. On a World 1-1 ? block the nametable shows TL=$53, T | 0x53-0x56 | look, promoted | needs-judge | confirmed | claude | images/task-1/549378d662c7.png: after $24 and a reset, the coin ? blocks show sky in their top-left quadrant; the power-up ? is whole |
| B2.metatiles | question_block_2x2 tile table (? block 16x16 quadrants) — PRG source of the four 8x8 tile ids that make up the 16x16 ? block. On a World 1-1 ? block the nametable shows TL=$53, T | $8C8C-$8C8F | write+reset+look, derived by diff, promoted | agrees (expected Palette0_MTiles $8B10+156 \| Palette1_MTiles $8BAC+184 \| Palette2_MTiles $8C64+40 \| Palette3_MTiles $8C8C+24; here: Palette3_MTiles) | agrees | reference | |
| (none) | small Mario standing-frame tile table — PRG source of the tile ids that make small Mario's standing frame. Small Mario on screen is a 2x2 sprite: list_sprites s | small_mario_standing | look, promoted | needs-judge | confirmed | claude | images/task-1/e17a8a2cfff5.png: after the blank $FC and a reset, small Mario lacks his top-left 8x8; the hill's green shows there |
| B3.player_sprites | small Mario standing-frame tile table — PRG source of the tile ids that make small Mario's standing frame. Small Mario on screen is a 2x2 sprite: list_sprites s | $EED3-$EED6 | write+reset+look, derived by diff, promoted | agrees (expected PlayerGraphicsTable $EE17+208; here: PlayerGraphicsTable) | agrees | reference | |
