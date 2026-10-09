## Distribution

| Stage | Count |
|---|---|
| lines in scope | 3 |
| attempted (from the replay) | see below |
| reached proof | 3 |
| recorded | 3 |
| derived (the address was in a diff before it was recorded) | 1 |
| promoted | 3 |
| graded right | 3 |
| graded wrong | 0 |
| unproven | 0 |
| cost (USD), tool calls, wall time | 0.1, 195, 719 s |

| line | recorded | proof | derived | promoted | final | claim |
|---|---|---|---|---|---|---|
| C1.coins | yes | write+look | no | yes | agrees | coin_count (two decimal digits: tens 0x07ED, ones 0x07EE) @ $07ED-$07EE |
| C1.timer | yes | write+look | yes | yes | agrees | level_timer_TIME (3-digit BCD countdown) @ $07F8-$07FA |
| C1.score | yes | write+look | no | yes | agrees | score (6 decimal digits, most significant first) @ $07DD-$07E2 |

Tokens in 15953094, out 95967, steps 113. Claims outside the lines in scope: 0.
