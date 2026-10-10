## Distribution

| Stage | Count |
|---|---|
| lines in scope | 5 |
| attempted (from the replay) | see below |
| reached proof | 5 |
| recorded | 5 |
| derived (the address was in a diff before it was recorded) | 4 |
| promoted | 5 |
| graded right | 4 |
| graded wrong | 1 |
| unproven | 0 |
| cost (USD), tool calls, wall time | 0.06, 138, 450 s |

| line | recorded | proof | derived | promoted | final | claim |
|---|---|---|---|---|---|---|
| C2.link_dir | yes | write+look | yes | yes | agrees | link_facing_direction @ $0098 |
| C4.frame_counter | yes | watch | yes | yes | agrees | frame_counter @ $0015 |
| C4.game_mode | yes | watch | yes | yes | disagrees | game_mode @ $00E1 |
| C4.pause | yes | watch | yes | yes | agrees | pause_flag @ $00E0 |
| C4.joypad | yes | watch | no | yes | agrees | controller1_buttons @ $00FA |

Tokens in 6202844, out 50228, steps 103. Claims outside the lines in scope: 0.
