# Grades: 20261009-1521-sheet3-x-rerun-r3

Reference: smbdis (doppelganger), ca65 port by threecreepio. Spec: Super Mario Bros. (World) v6. One row per claim (eval/README.md); `final` is the reference verdict held to the proof step.

| line | claim | at | evidence (proof) | reference | final | grader | image |
|---|---|---|---|---|---|---|---|
| C2.player_x | player_x_position (Mario horizontal position within the level page) — Encoding: one byte, Mario's horizontal position in the level measured inside the current 256-pixel page; the page number | $0086 | write+look, derived by diff, promoted | agrees (expected Player_X_Position $0086; here: Player_X_Position \| SprObject_X_Position) | agrees | reference | |
| C2.player_x_page | player_x_page (page number of Mario's horizontal position) — Encoding: one byte, the 256-pixel page of Mario's horizontal position; the within-page position is $0086, so the absolut | $006D | write+look, derived by diff, promoted | agrees (expected Player_PageLoc $006D; here: Player_PageLoc \| SprObject_PageLoc) | agrees | reference | |
