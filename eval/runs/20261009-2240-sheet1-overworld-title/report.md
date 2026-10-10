# Report: 20261009-2240-sheet1-overworld-title

First run of sheet 1 (what the pictures are) on SMB: three blind tasks
(World 1-1's first screen and its ground, hill and bush; small Mario, his
palette and the brick block; the title screen, the logo, the status bar and
the font). 11 lines. deepseek-flash, $0.10, 188 tool calls, about 6
minutes. Spec smb v13 (v12 vocabulary, v13 kinds and group-first, made
after this run's first grade; every row regraded).

## Distribution

| Stage | Count |
|---|---|
| lines in scope | 11 |
| attempted | 11 |
| reached proof (get_region / list_sprites / write_palette / read_nametable / read_tile, then a look) | 11 |
| recorded | 11 (45 claims) |
| graded right (Claude, from images and the CHR) | 11 |
| graded wrong | 0 |
| promoted | 6: overworld scene, ground, hill, brick, title scene, title logo |
| held back (leak, re-run) | 5: bush, small Mario, Mario's palette, HUD, font |
| cost (USD), tool calls, wall time | 0.10, 188, 356 s |

Judged rows are in `judged.json` (one verdict per claim, the image and what
in it supports the verdict); `grades.md` shows them. For tiles the judge
also rendered each claimed tile from the ROM's CHR (read only) and compared
it with the screenshot: ground `$1B4-$1B7` is the cracked-stone block,
hill `$130-$134`/`$126`, bush `$135-$138`/`$125`, brick `$145`/`$147`,
digits `$100-$109` and letters `$10A..$120` (an A=`$0A` alphabet), blank
`$124`, dash `$128`. Small Mario is `$3A $37 / $4F $4F(h)` under four `$FC`
padding entries; the palette proof screenshot shows his cap and body cyan
after slot 1 was written. One slip, in the title-logo note: `$38` is a
bush edge, not a board fill; the rest of that note (letters `$1D0-$1E8`,
board edges `$142-$14A`, table `$1000`) is right.

## The leak (ledger F10, third time)

The mapping held hand-made entries from 2026-10-05 that no spec line named:
sprite `mario_small_standing` (its tile ids), sprite palette 4 with its
roles, the cloud tiles `$35-$3C` and `$25` (the bush is the cloud in green),
font digit 0 and the blank, and the `statusbar_text_table` note giving the
HUD layout and every letter's tile id. Task 2's reasoning quotes the sprite
entry. The five lines those answer are graded right but not promoted
(`eval-promote.mjs --skip`); the entries are now tied to the lines so the
re-run holds them back, and a dry run of its starting mapping names none of
them. Two small hints remain in this run's promoted scene notes (the HUD is
the top four rows; palette 0 paints the bush); neither gives a tile or the
layout.

## How the method got there

Every object went through `get_region` in object mode before its tiles
were recorded (21 calls in task 1), with `read_nametable` and
`get_tile_at_pixel` cross-checks; Mario through `list_sprites`; the palette
through one `write_palette`, a screenshot and `clear_palette_overrides`.
No task needed a scripted route: sheet 1 is what the tools already do.

## Grader changes made because of this run

- Picture verdicts are data: `judged.json`, applied by `eval-grade.mjs`,
  read by `eval-promote.mjs` (commit `92a2d36`).
- A picture line can own several entries (`entries`: a bush is five
  tiles); promotion takes all of a run's right tiles for the line and a
  re-run holds them all back.
- Line assignment: a tile's `group` decides first, and picture lines take
  only their `kinds` (spec v13; F9).
- `eval-promote.mjs --skip` for a leaked line.

## The change this run argues for

None to the worker: 11 of 11 right at the first attempt. The process
change is the one above (tie a sheet's hand-made entries to its lines
before its first run). Next: the five held-back lines, clean, three
repeats; then the remaining sheet-1 lines (underground, water and castle
scenes, the card, cloud and flagpole, the enemy and item metasprites, the
other background palettes).
