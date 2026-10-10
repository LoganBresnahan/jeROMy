## Distribution

| Stage | Count |
|---|---|
| lines in scope | 2 |
| attempted (from the replay) | see below |
| reached proof | 2 |
| recorded | 2 |
| derived (the address was in a diff before it was recorded) | 1 |
| promoted | 2 |
| graded right | 2 |
| graded wrong | 0 |
| unproven | 0 |
| cost (USD), tool calls, wall time | 0.08, 73, 355 s |

| line | recorded | proof | derived | promoted | final | claim |
|---|---|---|---|---|---|---|
| E3.vram_writer | yes | disassemble | yes | yes | agrees | WriteVRAMBuffer - NMI routine that copies the queued VRAM buffer to the PPU @ $8E92-$8EEC |
| E3.scroll_split | yes | look | no | yes | confirmed | Status-bar scroll split (sprite-0 timed, scanline 31) @ scroll split |

Tokens in 2830892, out 61039, steps 34. Claims outside the lines in scope: 0.
