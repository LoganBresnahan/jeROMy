# Grades: 20261009-1135-sheet3-hud-position

Reference: smbdis (doppelganger), ca65 port by threecreepio. Spec: Super Mario Bros. (World) v2. One row per claim (eval/README.md); `final` is the reference verdict held to the proof step.

| line | claim | at | evidence (proof) | reference | final | grader | image |
|---|---|---|---|---|---|---|---|
| C2.player_x | player_x_position (Mario horizontal position in the level) — Encoding: one byte, the level x-coordinate modulo 256; it is the coordinate the engine scrolls the level in, so it wraps | $0086 | write+look, derived by diff, promoted | agrees (expected Player_X_Position $0086; here: Player_X_Position \| SprObject_X_Position) | agrees | reference | |
| C2.player_y | player_y_position (Mario vertical position) — Encoding: one byte, the screen y of the top of Mario's sprite box; on the ground in 1-1 it reads 176, and it decreases a | $00CE | write+look, derived by diff, promoted | agrees (expected Player_Y_Position $00CE; here: Player_Y_Position \| SprObject_Y_Position) | agrees | reference | |
| C1.world | world_number — Encoding: the current world number, 0 = World 1, so World 1-1 holds 0. Proof (write + screenshot of the death card): in  | $075F | write+look, not in any diff, promoted | agrees (expected WorldNumber $075F; here: WorldNumber) | agrees | reference | |
| C1.level | level_number — Encoding: the level number within the current world, 0 = the first level of the world, so World 1-1 holds 0. Proof (writ | $075C | write+look, not in any diff, promoted | agrees (expected LevelNumber $075C; here: LevelNumber) | agrees | reference | |
| C4.scroll_x | screen_scroll_x (level's left edge, mod 256) — Supporting variable found while chasing the horizontal position. $03AD (Mario's on-screen x) is computed as $0086 - $071 | $071C | watch, derived by diff, promoted | agrees (expected HorizontalScroll $073F \| ScreenLeft_X_Pos $071C; here: ScreenEdge_X_Pos \| ScreenLeft_X_Pos) | agrees | reference | |
| C2.player_screen_x | player_screen_x (derived on-screen x of Mario) — Derived copy: ROM routine at CPU $F171 does LDA $0086,X / SEC / SBC $071C / STA $03AD,Y, so $03AD = player_x ($0086) - s | $03AD | write+look, derived by diff, promoted | agrees (expected Player_Rel_XPos $03AD; here: Player_Rel_XPos \| SprObject_Rel_XPos) | agrees | reference | |
