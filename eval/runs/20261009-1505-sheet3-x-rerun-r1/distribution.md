## Distribution

| Stage | Count |
|---|---|
| lines in scope | 2 |
| attempted (from the replay) | see below |
| reached proof | 2 |
| recorded | 2 |
| derived (the address was in a diff before it was recorded) | 2 |
| promoted | 2 |
| graded right | 2 |
| graded wrong | 0 |
| unproven | 0 |
| cost (USD), tool calls, wall time | 0.05, 177, 440 s |

| line | recorded | proof | derived | promoted | final | claim |
|---|---|---|---|---|---|---|
| C2.player_x | yes | write+look | yes | yes | agrees | player_x_position (Mario's horizontal level position within the page, low byte) @ $0086 |
| C2.player_x_page | yes | write+look | yes | yes | agrees | player_x_page (page / high byte of Mario's horizontal level position) @ $006D |

Tokens in 10749194, out 55653, steps 90. Claims outside the lines in scope: 1.
