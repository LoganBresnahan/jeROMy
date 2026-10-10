## Distribution

| Stage | Count |
|---|---|
| lines in scope | 8 |
| attempted (from the replay) | see below |
| reached proof | 8 |
| recorded | 8 |
| derived (the address was in a diff before it was recorded) | 2 |
| promoted | 8 |
| graded right | 8 |
| graded wrong | 0 |
| unproven | 0 |
| cost (USD), tool calls, wall time | 0.37, 557, 1947 s |

| line | recorded | proof | derived | promoted | final | claim |
|---|---|---|---|---|---|---|
| C1.area | yes | write+look | no | yes | agrees | area_number (which area of the world the level loader loads) @ $0760 |
| C2.player_y_high | yes | watch | no | yes | agrees | player_y_page (high byte / screen page of Mario's vertical position) @ $00B5 |
| C2.power | yes | write+look | no | yes | agrees | player_power_state (small/big/fire) @ $0756 |
| C2.star | yes | write+look | no | yes | agrees | star_invincibility_timer @ $079F |
| C2.crouch | yes | watch | yes | yes | agrees | player_crouching_flag (big Mario ducking) @ $0714 |
| C2.swim | yes | watch | no | yes | agrees | player_swimming_flag (water-area flag) @ $0704 |
| C3.enemy_flag | yes | write+look | no | yes | agrees | enemy_active_flag (Enemy_Flag) @ $000F-$0014 |
| C3.enemy_state | yes | write+look | yes | yes | agrees | enemy_state (Enemy_State) @ $001E-$0023 |

Tokens in 41285090, out 287067, steps 277. Claims outside the lines in scope: 0.
