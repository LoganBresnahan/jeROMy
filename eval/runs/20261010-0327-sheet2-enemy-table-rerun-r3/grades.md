# Grades: 20261010-0327-sheet2-enemy-table-rerun-r3

Reference: smbdis (doppelganger), ca65 port by threecreepio. Spec: Super Mario Bros. (World) v21. One row per claim (eval/README.md); `final` is the reference verdict held to the proof step.

| line | claim | at | evidence (proof) | reference | final | grader | image |
|---|---|---|---|---|---|---|---|
| (none) | enemy sprite layout table — WHAT THE BYTES ARE: the PRG ROM table that says which sprite (CHR) tile ids make up each enemy's metasprite, i.e. the pe | enemy sprite layout table | look, promoted | needs-judge | pending | claude |  |
| B3.enemy_sprites | enemy sprite layout table — WHAT THE BYTES ARE: the PRG ROM table that says which sprite (CHR) tile ids make up each enemy's metasprite, i.e. the pe | $E73E-$E7CD | write+reset+look, derived by diff, promoted | agrees (expected EnemyGraphicsTable $E73E+258; here: EnemyGraphicsTable) | agrees | reference |  |
