## Distribution

| Stage | Count |
|---|---|
| lines in scope | 3 |
| attempted (from the replay) | see below |
| reached proof | 3 |
| recorded | 3 |
| derived (the address was in a diff before it was recorded) | 1 |
| promoted | 3 |
| graded right | 2 |
| graded wrong | 1 |
| unproven | 0 |
| cost (USD), tool calls, wall time | 0.33, 263, 1468 s |

| line | recorded | proof | derived | promoted | final | claim |
|---|---|---|---|---|---|---|
| D1.area_format | yes | disassemble | yes | yes | disagrees | area object decoder @ $950A-$9588 |
| D3.1-2 | yes | write+reset+look | no | yes | agrees | 1-2 World 1-2 underground area (layout data and enemy data) @ $AC35-$ACD7 |
| D4.timer_header | yes | write+reset+look | no | yes | agrees | per-level timer setting table @ $912D-$9130 |

Tokens in 38945913, out 216648, steps 132. Claims outside the lines in scope: 1.
