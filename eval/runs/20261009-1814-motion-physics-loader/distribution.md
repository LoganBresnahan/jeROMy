## Distribution

| Stage | Count |
|---|---|
| lines in scope | 5 |
| attempted (from the replay) | see below |
| reached proof | 5 |
| recorded | 5 |
| derived (the address was in a diff before it was recorded) | 3 |
| promoted | 5 |
| graded right | 5 |
| graded wrong | 0 |
| unproven | 0 |
| cost (USD), tool calls, wall time | 0.19, 245, 982 s |

| line | recorded | proof | derived | promoted | final | claim |
|---|---|---|---|---|---|---|
| C2.player_x_speed | yes | watch | yes | yes | agrees | player_horizontal_speed (Mario X velocity) @ $0057 |
| C2.player_y_speed | yes | watch | yes | yes | agrees | player_vertical_speed (Mario Y velocity) @ $009F |
| C2.facing | yes | write+look | yes | yes | agrees | player_facing_direction @ $0033 |
| E4.area_loader | yes | disassemble | no | yes | agrees | LoadAreaData - build the level layout pointer $E7/$E8 and enemy pointer $E9/$EA from the area tables at level start @ $9C22-$9CB3 |
| E5.physics | yes | write+reset+look | no | yes | agrees | JumpMForceData - jump/rise force table (prgRom 0x3424, CPU $B424) @ $B424-$B42A |

Tokens in 26088640, out 145815, steps 157. Claims outside the lines in scope: 4.
