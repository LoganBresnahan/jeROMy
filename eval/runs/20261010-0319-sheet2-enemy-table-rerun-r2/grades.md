# Grades: 20261010-0319-sheet2-enemy-table-rerun-r2

Reference: smbdis (doppelganger), ca65 port by threecreepio. Spec: Super Mario Bros. (World) v21. One row per claim (eval/README.md); `final` is the reference verdict held to the proof step.

| line | claim | at | evidence (proof) | reference | final | grader | image |
|---|---|---|---|---|---|---|---|
| (none) | enemy sprite layout table — Super Mario Bros. (World) PRG ROM table of 6-byte sprite/metasprite layouts: each entry lists the CHR tile ids the game  | enemy sprite layout table | look, promoted | needs-judge | confirmed | claude | task-1/2dad6bba715d.png: the note's content matches its graded origins (EnemyGraphicsTable, the Goomba's FC FC 70 71 72 73 entry at 0x6792) and the proof write of tile $61 at 0x6794 drawn as the Goomba's top-right quarter after a reset (this screenshot; a3c15bc3c077.png shows the normal Goomba) |
| B3.enemy_sprites | enemy sprite layout table — Super Mario Bros. (World) PRG ROM table of 6-byte sprite/metasprite layouts: each entry lists the CHR tile ids the game  | $E792-$E797 | write+reset+look, derived by diff, promoted | agrees (expected EnemyGraphicsTable $E73E+258; here: EnemyGraphicsTable) | agrees | reference |  |
| B3.enemy_sprites | enemy sprite layout table — Super Mario Bros. (World) PRG ROM table of 6-byte sprite/metasprite layouts: each entry lists the CHR tile ids the game  | $E750-$E83D | write+reset+look, derived by diff, promoted | agrees (expected EnemyGraphicsTable $E73E+258; here: EnemyGraphicsTable) | agrees | reference |  |
