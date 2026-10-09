## Distribution

| Stage | Count |
|---|---|
| lines in scope | 4 |
| attempted (from the replay) | see below |
| reached proof | 4 |
| recorded | 4 |
| derived (the address was in a diff before it was recorded) | 3 |
| promoted | 4 |
| graded right | 3 |
| graded wrong | 1 |
| unproven | 0 |
| cost (USD), tool calls, wall time | 0.13, 240, 1023 s |

| line | recorded | proof | derived | promoted | final | claim |
|---|---|---|---|---|---|---|
| C1.coins | yes | write+look | no | yes | agrees | coin_count @ $07ED-$07EE |
| C1.timer | yes | write+look | yes | yes | agrees | level_timer @ $07F8-$07FA |
| C1.score | yes | write+look | yes | yes | disagrees | player_score @ $07DE-$07E3 |
| C2.player_x_page | yes | write+look | yes | yes | agrees | player_x_page @ $006D |

Tokens in 13590256, out 146175, steps 153. Claims outside the lines in scope: 1.
