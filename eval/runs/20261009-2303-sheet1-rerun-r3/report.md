# Report: sheet1-rerun, three repeats (r1-r3)

The clean re-run of the five sheet-1 lines that
`20261009-2240-sheet1-overworld-title` got right with their answers in the
prompt (ledger F10): the bush, small Mario, his palette, the HUD layout and
the font. Same task wording, split into two tasks (Mario, palette and bush;
HUD and font). Runs `20261009-2253-…-r1`, `2258-…-r2`, `2303-…-r3`; $0.20
for the series; 124, 130, 111 tool calls; each repeat about 5 minutes.
Each `config.md` lists the held-back entries (the old sprite, palette 4,
the cloud tiles, font digit 0, the blank, the HUD tiles and the seven notes
that name the status bar); no transcript names `mario_small_standing` or
`statusbar_text_table`.

## Distribution

| line | first run (leaked) | r1 | r2 | r3 | decided |
|---|---|---|---|---|---|
| A3.bush | right | right | right | right | 3/3, promoted |
| A4.small_mario | right | right | right | right | 3/3, promoted |
| A5.overworld.sp0 | right | right | right | right | 3/3, promoted |
| A6.hud | right | **wrong** | right | right | 2/3, promoted (r2's note) |
| A7.font | right | right, one tile wrong | right | right | 3/3, promoted (r3, 23 tiles) |

`comparison.md` in r1 says `worse` for A6.hud; the majority decides
(eval/README.md, re-runs), and the replay explains it, below.

## What went wrong in r1

Both errors are misreadings of the same `read_nametable` result. The
nametable gives `WORLD`'s W as 32 (`$20`); r1 wrote it as `$14` (20
decimal), and recorded a font tile `$114` "W" that renders from the ROM as
a K. Its HUD note also called the coin icon a sprite (`$FF`, palette 7): the
icon is background tile `$2E`, and the `$FF` sprite sits behind it, hidden.
r2 and r3 read the same table right and placed the icon as background with
palette 3. One in three is the rate to watch: a decimal/hex slip in a tool
result read by the worker (not a tool error).

## Judging

Each claim checked against the screenshot it rests on and, for tiles, the
tile rendered from the ROM's CHR. The palette proofs carry their own
evidence: in each repeat's recolor screenshot the red pixels of Mario's
cap and body are cyan (`$2C`) and nothing else in his box changed.
`judged.json` in each run holds the verdicts.

## Process changes made during this series

- `eval-promote.mjs`: a note claim enters the mapping only if judged
  right, once, from the repeat that decided its line, never for a skipped
  line (r1's rejected HUD note and three copies of the right one nearly went
  in; the first run's HUD note had gone in through the same gap and was
  removed). A multi-entry line takes the repeat with the most right
  entries.
- `eval-grade.mjs`: the comparison applies the earlier run's judgments.
- Before the next run (question block, pipe, cloud, the four background
  palettes, Goomba, block coin): the bush's promoted tiles are the cloud's
  (tied to A3.cloud), and every entry whose notes name background palette
  0-3 is tied to that palette's line; the dry run of its starting mapping
  names none of the answers.

## Ledger

F10 (seen once more, as a near miss: promoted notes and shared tiles),
F4 (r2 and r3 name `game_mode $0770` from recall; harmless here). New F15:
a decimal/hex slip in reading a tool result (r1).
