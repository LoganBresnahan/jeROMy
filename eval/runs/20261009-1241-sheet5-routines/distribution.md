## Distribution

| Stage | Count |
|---|---|
| lines in scope | 4 |
| attempted (from the replay) | see below |
| reached proof | 4 |
| recorded | 4 |
| derived (the address was in a diff before it was recorded) | 4 |
| promoted | 4 |
| graded right | 4 |
| graded wrong | 0 |
| unproven | 0 |
| cost (USD), tool calls, wall time | 0.14, 231, 1094 s |

| line | recorded | proof | derived | promoted | final | claim |
|---|---|---|---|---|---|---|
| E5.lose_life | yes | disassemble | yes | yes | agrees | LoseLife - take a life away when Mario dies @ $91CD-$91E8 |
| E5.coin | yes | disassemble | yes | yes | agrees | AddCoin - collect a coin (coin count + coin digits, +200 score, 1-UP at 100) @ $BBFE-$BC48 |
| E5.timer | yes | disassemble | yes | yes | agrees | DecrementTimer - count the level TIME down @ $B74F-$B7A3 |
| E5.digits | yes | disassemble | yes | yes | agrees | AddBCD - shared signed-digit adder for the HUD counters (coin/timer/score) @ $8F5F-$8F86 |

Tokens in 10669169, out 183170, steps 100. Claims outside the lines in scope: 1.
