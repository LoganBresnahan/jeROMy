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
| cost (USD), tool calls, wall time | 0.15, 180, 1050 s |

| line | recorded | proof | derived | promoted | final | claim |
|---|---|---|---|---|---|---|
| D2.area_pointers | yes | write+reset+look | yes | yes | agrees | PRG table of each area's layout-data start address (low $9D2C / high $9D4E, base $9D28) @ $9D2C-$9D4D |
| D2.enemy_pointers | yes | write+reset+look | no | yes | agrees | PRG table of each area's enemy-data start address (low $9CE4 / high $9D06, base $9CE0) @ $9CE4-$9D05 |
| D3.1-1 | yes | write+reset+look | no | yes | agrees | 1-1 World 1-1 layout objects and enemy placements @ $A690-$A6F1 |

Tokens in 13615512, out 176077, steps 107. Claims outside the lines in scope: 3.
