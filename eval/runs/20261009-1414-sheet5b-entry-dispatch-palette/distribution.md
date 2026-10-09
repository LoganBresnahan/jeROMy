## Distribution

| Stage | Count |
|---|---|
| lines in scope | 4 |
| attempted (from the replay) | see below |
| reached proof | 4 |
| recorded | 4 |
| derived (the address was in a diff before it was recorded) | 3 |
| promoted | 4 |
| graded right | 4 |
| graded wrong | 0 |
| unproven | 0 |
| cost (USD), tool calls, wall time | 0.11, 115, 556 s |

| line | recorded | proof | derived | promoted | final | claim |
|---|---|---|---|---|---|---|
| E1.reset | yes | disassemble | no | yes | agrees | Reset - power-on / RESET entry (boot, init, then idle loop) @ $8000-$8056 |
| E1.nmi | yes | disassemble | yes | yes | agrees | NMI - per-frame interrupt handler (PPU setup, OAM DMA, game logic) @ $8082-$8181 |
| E2.mode_dispatch | yes | disassemble | yes | yes | agrees | GameEngine - per-frame dispatch on GameMode ($0770) @ $8212-$8217 |
| E3.palette_loader | yes | disassemble | yes | yes | agrees | LoadAreaPalette - pick the area's background+sprite palette when a level starts @ $85BF-$85CA |

Tokens in 6760094, out 93331, steps 60. Claims outside the lines in scope: 4.
