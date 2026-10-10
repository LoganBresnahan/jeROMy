# Grades: 20261010-0319-sheet2-enemy-table-rerun-r2

Reference: smbdis (doppelganger), ca65 port by threecreepio. Spec: Super Mario Bros. (World) v21. One row per claim (eval/README.md); `final` is the reference verdict held to the proof step.

| line | claim | at | evidence (proof) | reference | final | grader | image |
|---|---|---|---|---|---|---|---|
| (none) | enemy sprite layout table — Super Mario Bros. (World) PRG ROM table of 6-byte sprite/metasprite layouts: each entry lists the CHR tile ids the game  | enemy sprite layout table | look, promoted | needs-judge | pending | claude |  |
| B3.enemy_sprites | enemy sprite layout table — Super Mario Bros. (World) PRG ROM table of 6-byte sprite/metasprite layouts: each entry lists the CHR tile ids the game  | $E792-$E797 | write+reset+look, derived by diff, promoted | agrees (expected EnemyGraphicsTable $E73E+258; here: EnemyGraphicsTable) | agrees | reference |  |
| B3.enemy_sprites | enemy sprite layout table — Super Mario Bros. (World) PRG ROM table of 6-byte sprite/metasprite layouts: each entry lists the CHR tile ids the game  | $E750-$E83D | write+reset+look, derived by diff, promoted | agrees (expected EnemyGraphicsTable $E73E+258; here: EnemyGraphicsTable) | agrees | reference |  |
