# Report: 20261009-1428-sheet2-text-tiles

First run of sheet 2 (where the pictures come from) on SMB: the status
bar's fixed text and the WORLD card's text (task 1), the ? block's tile
ids and small Mario's standing-frame tile ids (task 2). Each task worked in
a throwaway hack (removed after; the `default` ledger's checksum unchanged).
deepseek-flash, blind, $0.09, 134 tool calls.

## Distribution (spec v6)

| Stage | Count |
|---|---|
| lines in scope | 4 |
| attempted | 4 |
| reached proof (ledgered write, reset, look) | 2 (the text lines) |
| recorded | 4 |
| derived (a search hit inside the claimed bytes before the record) | 4 |
| promoted | 2 as lines (the text, as notes); the tile and sprite entries as gap fills |
| graded right | 2: the status bar text `$8752` (TopStatusBarLine), the WORLD card text `$8783` (inside WorldLivesDisplay) |
| graded wrong | 0 |
| unproven | 2: the ? block entry `$8C8C` (Palette3_MTiles) and Mario's frame `$EED3` (inside PlayerGraphicsTable); both at the right bytes by the reference, both proven by write and look, but the reset step timed out (F12) |
| cost (USD), tool calls, wall time | 0.09, 134, about 10 min |

Judged by Claude: the ? block write (`images/task-2/7a1c07766013.png`: two
? blocks with sky in their top-left quadrant, the power-up ? whole) and the
Mario write (`5c0317dde66c.png`: his top-left 8x8 gone), both `confirmed`.

## Why lines landed where they did

- **The WORLD card text graded wrong under v5.** The line accepted only
  `GameText`, whose span ends where `WorldLivesDisplay` (the card's string)
  begins; the game's text table has nine labelled strings indexed from
  `GameText`. The claim was right; spec v6 accepts every string (ledger F9).
- **Unproven ? block and Mario frame.** The model wrote, called
  `reset_emulator`, and got "timed out after 6000ms" both times, then
  checked the CPU state, saw the reset had happened, and looked. The Lua
  log shows each paused reset completing after exactly 6 s, the adapter's
  budget for 30 frames: paused, the frames are stepped through the
  keep-alive, slower than real time under a live session. New ledger F12.

## Grader changes made because of this run

`eval-promote` promotes an origin line through the entry that carries the
origin (a tile, sprite, palette or note); a claim takes its key from the
tool's result (`chr:0x153`, not the typed `0x53`). Tests added.

## The change this run argues for

`reset_emulator`'s timeout covers paused stepping (`frames × 400 ms + 5 s`,
was `frames ÷ 60 s + 5 s`); checked live with a paused reset through dsh.
Next: re-run the ? block and Mario lines, three repeats.
