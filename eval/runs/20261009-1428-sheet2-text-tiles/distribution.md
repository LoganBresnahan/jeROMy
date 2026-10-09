## Distribution

| Stage | Count |
|---|---|
| lines in scope | 4 |
| attempted (from the replay) | see below |
| reached proof | 2 |
| recorded | 4 |
| derived (the address was in a diff before it was recorded) | 4 |
| promoted | 4 |
| graded right | 2 |
| graded wrong | 0 |
| unproven | 2 |
| cost (USD), tool calls, wall time | 0.09, 134, 584 s |

| line | recorded | proof | derived | promoted | final | claim |
|---|---|---|---|---|---|---|
| B2.metatiles | yes | write-no-reset | yes | yes | unproven | ? block 16x16 metatile tile-id table entry (TL/TR/BL/BR = $53/$54/$55/$56) @ $8C8C-$8C8F |
| B3.player_sprites | yes | write-no-reset | yes | yes | unproven | small Mario standing-frame tile-id table entry (TL/TR/BL/BR = $3A/$37/$4F/$4F) @ $EED3-$EED6 |
| B4.game_text | yes | write+reset+look | yes | yes | agrees | WORLD-card text record ('WORLD 1-1' intro/death card) @ $8783-$878E |
| B4.status_bar | yes | write+reset+look | yes | yes | agrees | Top status bar fixed-text VRAM-buffer table (MARIO, WORLD, TIME) @ $8752-$876B |

Tokens in 8551096, out 92854, steps 79. Claims outside the lines in scope: 4.
