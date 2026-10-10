# Grades: 20261010-0314-sheet2-enemy-table-rerun-r1

Reference: smbdis (doppelganger), ca65 port by threecreepio. Spec: Super Mario Bros. (World) v21. One row per claim (eval/README.md); `final` is the reference verdict held to the proof step.

| line | claim | at | evidence (proof) | reference | final | grader | image |
|---|---|---|---|---|---|---|---|
| (none) | enemy sprite layout table — PRG ROM table that says which sprite-pattern-table (CHR $0000) tile ids make up each enemy's metasprite, one entry per e | enemy sprite layout table | look, promoted | needs-judge | pending | claude |  |
| B3.enemy_sprites | enemy sprite layout table — PRG ROM table that says which sprite-pattern-table (CHR $0000) tile ids make up each enemy's metasprite, one entry per e | $9A88-$9A8D | none, not in any diff, promoted | disagrees (expected EnemyGraphicsTable $E73E+258; here: none) | unproven | reference |  |
| B3.enemy_sprites | enemy sprite layout table — PRG ROM table that says which sprite-pattern-table (CHR $0000) tile ids make up each enemy's metasprite, one entry per e | $9A88-$9AD5 | none, not in any diff, promoted | disagrees (expected EnemyGraphicsTable $E73E+258; here: none) | unproven | reference |  |
