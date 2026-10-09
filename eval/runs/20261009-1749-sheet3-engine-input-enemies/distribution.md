## Distribution

| Stage | Count |
|---|---|
| lines in scope | 8 |
| attempted (from the replay) | see below |
| reached proof | 8 |
| recorded | 8 |
| derived (the address was in a diff before it was recorded) | 5 |
| promoted | 8 |
| graded right | 8 |
| graded wrong | 0 |
| unproven | 0 |
| cost (USD), tool calls, wall time | 0.23, 384, 1371 s |

| line | recorded | proof | derived | promoted | final | claim |
|---|---|---|---|---|---|---|
| C3.enemy_id | yes | write+look | no | yes | agrees | enemy_type @ $0016-$001B |
| C3.enemy_x | yes | write+look | yes | yes | agrees | enemy_x_position @ $0087-$008C |
| C3.enemy_y | yes | write+look | no | yes | agrees | enemy_y_position @ $00CF-$00D4 |
| C4.frame_counter | yes | watch | yes | yes | agrees | frame_counter @ $0009 |
| C4.game_mode | yes | write+look | yes | yes | agrees | game_mode @ $0770 |
| C4.pause | yes | write+look | yes | yes | agrees | pause_flag @ $0776 |
| C4.joypad | yes | watch | no | yes | agrees | player1_buttons @ $06FC |
| C4.rng | yes | watch | yes | yes | agrees | rng_state @ $07A7-$07AD |

Tokens in 26442742, out 208537, steps 210. Claims outside the lines in scope: 1.
