# Grades: 20261009-1749-sheet3-engine-input-enemies

Reference: smbdis (doppelganger), ca65 port by threecreepio. Spec: Super Mario Bros. (World) v9. One row per claim (eval/README.md); `final` is the reference verdict held to the proof step.

| line | claim | at | evidence (proof) | reference | final | grader | image |
|---|---|---|---|---|---|---|---|
| C4.frame_counter | frame_counter — The global frame counter: it is incremented by exactly 1 every frame and wraps at 256. Writer: INC $0009 at CPU $8119 (p | $0009 | watch, derived by diff, promoted | agrees (expected FrameCounter $0009; here: FrameCounter \| TallEnemy) | agrees | reference | |
| C4.game_mode | game_mode — Game mode / which screen the game is running: 0 = title screen or attract demo, 1 = playing a level, 2 = victory (castle | $0770 | write+look, derived by diff, promoted | agrees (expected OperMode $0770; here: OperMode) | agrees | reference | |
| C4.pause | pause_flag — Pause flag: bit 0 is set (1) while the game is paused with Start and clear (0) while it runs. Proof (differential + writ | $0776 | write+look, derived by diff, promoted | agrees (expected GamePauseStatus $0776; here: GamePauseStatus) | agrees | reference | |
| C4.joypad | player1_buttons — Controller 1's buttons for the current frame, stored by the joypad routine ReadJoypads at CPU $8E5C. Encoding (bit field | $06FC | watch, not in any diff, promoted | agrees (expected SavedJoypad1Bits $06FC; here: SavedJoypad1Bits \| SavedJoypadBits) | agrees | reference | |
| C4.rng | rng_state — The game's pseudo-random number generator state: a 7-byte shift register at $07A7-$07AD (stride 1, count 7), updated exa | $07A7-$07AD | watch, derived by diff, promoted | agrees (expected PseudoRandomBitReg $07A7+7; here: PseudoRandomBitReg) | agrees | reference | |
| C3.enemy_id | enemy_type — Enemy object TYPE/ID array, one byte per slot: $0016-$001B = enemy slots 0-5 (stride 1, count 6; slot 0 is the first ene | $0016-$001B | write+look, not in any diff, promoted | agrees (expected Enemy_ID $0016+6; here: Enemy_ID \| Fireworks) | agrees | reference | |
| C3.enemy_x | enemy_x_position — Enemy object HORIZONTAL POSITION (low byte of level x), one byte per slot: $0087-$008C = enemy slots 0-5 (stride 1, coun | $0087-$008C | write+look, derived by diff, promoted | agrees (expected Enemy_X_Position $0087+6; here: Enemy_X_Position) | agrees | reference | |
| (none) | enemy_x_page — Enemy object level-x PAGE (high byte), one byte per slot: $006E-$0073 = enemy slots 0-5 (stride 1, count 6; the player's | $006E-$0073 | watch, not in any diff, promoted | agrees | agrees | reference | |
| C3.enemy_y | enemy_y_position — Enemy object VERTICAL POSITION, one byte per slot: $00CF-$00D4 = enemy slots 0-5 (stride 1, count 6). The array starts o | $00CF-$00D4 | write+look, not in any diff, promoted | agrees (expected Enemy_Y_Position $00CF+6; here: Enemy_Y_Position) | agrees | reference | |
