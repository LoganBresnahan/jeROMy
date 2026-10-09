## Distribution

| Stage | Count |
|---|---|
| lines in scope | 3 |
| attempted (from the replay) | see below |
| reached proof | 3 |
| recorded | 3 |
| derived (the address was in a diff before it was recorded) | 3 |
| promoted | 3 |
| graded right | 3 |
| graded wrong | 0 |
| unproven | 0 |
| cost (USD), tool calls, wall time | 0.03, 54, 215 s |

| line | recorded | proof | derived | promoted | final | claim |
|---|---|---|---|---|---|---|
| C1.coins | yes | write+look | yes | yes | agrees | hud_coin_count (displayed two-digit coin counter) @ $07ED-$07EE |
| C1.timer | yes | write+look | yes | yes | agrees | level_timer (HUD TIME, counts down) @ $07F8-$07FA |
| C1.score | yes | write+look | yes | yes | agrees | score (HUD MARIO score digits) @ $07DD-$07E2 |

Tokens in 1431925, out 30061, steps 33. Claims outside the lines in scope: 0.
