# Grades: 20261010-1152-sheet2-enemy-rows-r3

Reference: smbdis (doppelganger), ca65 port by threecreepio. Spec: Super Mario Bros. (World) v22. One row per claim (eval/README.md); `final` is the reference verdict held to the proof step.

| line | claim | at | evidence (proof) | reference | final | grader | image |
|---|---|---|---|---|---|---|---|
| B3.enemy_rows | enemy sprite layout rows — ENEMY SPRITE LAYOUT ROWS (prgRom). Re-read with read_memory prgRom and rendered every row with view_tiles(tiles=<6 ids>, | enemy sprite layout rows | look, promoted | needs-judge | rejected | claude | task-1/0d876fed2ccc.png: bounds right; 12 of 43 rows named right (Buzzy Beetle x2, Koopa x2, Paratroopa x2, Spiny x2, Cheep Cheep x2, Goomba, flat form), the rest described without a name ('curved-shell creature' for Bowser's four rows, 'small walker' for the Koopa shell): honest, but not named |
| (none) | enemy sprite layout rows — ENEMY SPRITE LAYOUT ROWS (prgRom). Re-read with read_memory prgRom and rendered every row with view_tiles(tiles=<6 ids>, | $E73E-$E83F | none, not in any diff, promoted | agrees | unproven | reference |  |
| B3.enemy_rows | enemy sprite layout rows — ENEMY SPRITE LAYOUT ROWS (prgRom) - every 6-byte row named, plus the proof that the table really is the enemy sprite lay | enemy sprite layout rows | look, promoted | needs-judge | rejected | claude | task-1/0d876fed2ccc.png: bounds right; 12 of 43 rows named right (Buzzy Beetle x2, Koopa x2, Paratroopa x2, Spiny x2, Cheep Cheep x2, Goomba, flat form), the rest described without a name ('curved-shell creature' for Bowser's four rows, 'small walker' for the Koopa shell): honest, but not named |
| (none) | enemy sprite layout rows — ENEMY SPRITE LAYOUT ROWS (prgRom) - every 6-byte row named, plus the proof that the table really is the enemy sprite lay | $E73E-$E83F | write+reset+look, not in any diff, promoted | agrees | agrees | reference |  |
