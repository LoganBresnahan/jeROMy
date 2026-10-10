## Distribution

| Stage | Count |
|---|---|
| lines in scope | 5 |
| attempted (from the replay) | see below |
| reached proof | 5 |
| recorded | 5 |
| derived (the address was in a diff before it was recorded) | 0 |
| promoted | 5 |
| graded right | 4 |
| graded wrong | 1 |
| unproven | 0 |
| cost (USD), tool calls, wall time | 0.03, 124, 294 s |

| line | recorded | proof | derived | promoted | final | claim |
|---|---|---|---|---|---|---|
| A3.bush | yes | look | no | yes | confirmed | bush body fill (solid middle of the base) @ chr:0x125 |
| A4.small_mario | yes | look | no | yes | confirmed | Small Mario - standing/facing right, 2x2 CHR metasprite (blank-padded 16x32 OAM form), sprite palette 4 @ small_mario |
| A5.overworld.sp0 | yes | look | no | yes | confirmed | small_mario sprite palette (slot1 $16 red hat+shirt, slot2 $27 orange skin, slot3 $18 olive hair/eyes/shoes) @ 4 |
| A6.hud | yes | look | no | yes | rejected | Status-bar layout (MARIO/score, coin, WORLD, TIME) in nametable 0 rows 2-3 @ HUD layout |
| A7.font | yes | look | no | yes | confirmed | font digit 0 @ chr:0x100 |

Tokens in 3841479, out 49031, steps 44. Claims outside the lines in scope: 0.
