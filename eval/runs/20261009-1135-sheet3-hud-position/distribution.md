## Distribution

| Stage | Count |
|---|---|
| lines in scope | 8 |
| attempted (from the replay) | see below |
| reached proof | 4 |
| recorded | 4 |
| derived (the address was in a diff before it was recorded) | 2 |
| promoted | 4 |
| graded right | 4 |
| graded wrong | 0 |
| unproven | 0 |
| cost (USD), tool calls, wall time | 0.04, 97, 410 s |

| line | recorded | proof | derived | promoted | final | claim |
|---|---|---|---|---|---|---|
| C1.coins | no | — | no | no | — | — |
| C1.timer | no | — | no | no | — | — |
| C1.score | no | — | no | no | — | — |
| C1.world | yes | write+look | no | yes | agrees | world_number @ $075F |
| C1.level | yes | write+look | no | yes | agrees | level_number @ $075C |
| C2.player_x | yes | write+look | yes | yes | agrees | player_x_position (Mario horizontal position in the level) @ $0086 |
| C2.player_x_page | no | — | no | no | — | — |
| C2.player_y | yes | write+look | yes | yes | agrees | player_y_position (Mario vertical position) @ $00CE |

Tokens in 4060416, out 59276, steps 57. Claims outside the lines in scope: 2.
