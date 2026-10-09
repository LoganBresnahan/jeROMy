# Grades: 20261009-1318-sheet3-worldlevel-rerun-r2

Reference: smbdis (doppelganger), ca65 port by threecreepio. Spec: Super Mario Bros. (World) v4. One row per claim (eval/README.md); `final` is the reference verdict held to the proof step.

| line | claim | at | evidence (proof) | reference | final | grader | image |
|---|---|---|---|---|---|---|---|
| C1.world | world_number (first digit of the HUD WORLD display) — Encoding: one byte, 0-based (0 = World 1). The HUD/card prints value+1 as the first digit of WORLD. In World 1-1 this by | $075F | write+look, not in any diff, promoted | agrees (expected WorldNumber $075F; here: WorldNumber) | agrees | reference | |
| C1.level | level_number (second digit of the HUD WORLD display) — Encoding: one byte, 0-based (0 = 1st level, e.g. 1-1; 4 = 5th level). The HUD/card prints value+1 as the second digit of | $075C | write+look, not in any diff, promoted | agrees (expected LevelNumber $075C; here: LevelNumber) | agrees | reference | |
