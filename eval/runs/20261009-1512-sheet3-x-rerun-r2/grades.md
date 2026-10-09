# Grades: 20261009-1512-sheet3-x-rerun-r2

Reference: smbdis (doppelganger), ca65 port by threecreepio. Spec: Super Mario Bros. (World) v6. One row per claim (eval/README.md); `final` is the reference verdict held to the proof step.

| line | claim | at | evidence (proof) | reference | final | grader | image |
|---|---|---|---|---|---|---|---|
| C2.player_x | player_x_position_low (position within the page) — Mario's horizontal position in the level, LOW byte (0-255, position within the current 256-pixel page). The absolute lev | $0086 | write+look, derived by diff, promoted | agrees (expected Player_X_Position $0086; here: Player_X_Position \| SprObject_X_Position) | agrees | reference | |
| C2.player_x_page | player_x_position_page (high byte of Mario's level x) — Mario's horizontal position in the level, HIGH (page) byte: the 16-bit level x is $006D*256 + $0086, i.e. $006D counts h | $006D | write+look, not in any diff, promoted | agrees (expected Player_PageLoc $006D; here: Player_PageLoc \| SprObject_PageLoc) | agrees | reference | |
