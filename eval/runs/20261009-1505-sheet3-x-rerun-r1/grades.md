# Grades: 20261009-1505-sheet3-x-rerun-r1

Reference: smbdis (doppelganger), ca65 port by threecreepio. Spec: Super Mario Bros. (World) v6. One row per claim (eval/README.md); `final` is the reference verdict held to the proof step.

| line | claim | at | evidence (proof) | reference | final | grader | image |
|---|---|---|---|---|---|---|---|
| C2.player_x | player_x_position (Mario's horizontal level position within the page, low byte) — Encoding: one byte, Mario's horizontal position within the current 256-pixel page; absolute level x = 0x006D*256 + 0x008 | $0086 | write+look, derived by diff, promoted | agrees (expected Player_X_Position $0086; here: Player_X_Position \| SprObject_X_Position) | agrees | reference | |
| C2.player_x_page | player_x_page (page / high byte of Mario's horizontal level position) — Encoding: one byte, the page/high byte of Mario's horizontal level position; absolute level x = 0x006D*256 + 0x0086. Fou | $006D | write+look, derived by diff, promoted | agrees (expected Player_PageLoc $006D; here: Player_PageLoc \| SprObject_PageLoc) | agrees | reference | |
| (none) | Mario's horizontal position: absolute level x = $006D*256 + $0086 — World 1-1. The player's level x is a 16-bit-ish pair: page at 0x006D and within-page byte at 0x0086 (absolute x = 0x006D | player_horizontal_position_encoding | look, promoted | needs-judge | not graded | claude | a note restating the two address claims ($006D page, $0086 position), each graded on its own row |
