# Report: 20261009-2310-sheet1-objects-palettes

Second first-run of sheet 1 on SMB: three blind tasks in World 1-1 (the
question block, the warp pipe and the cloud; what each slot of background
palettes 0-3 paints; the Goomba and the coin that pops out of a question
block). 9 lines. deepseek-flash, $0.09, 254 tool calls, about 9 minutes.
Before it ran, every mapping entry that could answer a line was tied to it
(the old ? block, pipe, cloud, Goomba and palette entries; the bush's
promoted tiles, which are the cloud's; every tile and scene whose notes
name background palette 0-3); `config.md` lists what was held back.

## Distribution

| Stage | Count |
|---|---|
| lines in scope | 9 |
| recorded | 9 (31 claims) |
| reached proof | 9 |
| graded right (Claude) | 9 |
| graded wrong | 0 |
| promoted | 9 |
| cost (USD), tool calls, wall time | 0.09, 254, 535 s |

Judging, from the images and the tiles rendered from the ROM's CHR:

- **Question block** `$153-$156` (bevel, rivets, the ? glyph); **pipe**
  `$160-$167` (rim, two rows) and `$168 $169 $126 $16A` (shaft), against
  the pipe in `task-1/4bf841930ed4.png`; **cloud** `$135-$138` (the
  bush's top tiles), `$139-$13C` (its bottom) and `$125`.
- **Palettes:** the task asked for one write per slot and the worker did
  them all; each screenshot shows one region recolored: sky red (slot 0,
  backdrop), bush pink (bg0 slot 1), hill pink (bg0 slot 2), ground
  highlight pink (bg1 slot 1), cloud and every HUD letter pink together
  (bg2 slot 1: the status bar shares the cloud's palette), the HUD coin
  cyan (bg3 slot 1; the ? block uses it later in the level).
- **Goomba:** `$70-$73` in sprite palette 7 under two `$FC` fillers;
  **block coin:** `$61` twice, the second v-flipped, palette 6, caught in
  the air above the used block (`task-3/f239ddd1dcd4.png`, coins x01).

## Grader changes made because of this run

- Palette claims are placed by their id (0-3 → `bgN`, 4-7 → `spN`) before
  their name: the names said "World 1-1 ground bricks", not "background
  palette 1", so all four were unplaced at first.
- A line's `holds` (other lines' entries it is held back with) are never
  replaced by promotion; only its `entry`/`entries` are. The first dry run
  would have deleted the hill, bush and scene entries when promoting the
  palettes.

## The change this run argues for

None to the worker: 9 of 9 at the first attempt, the third sheet-1 run in a
row with no wrong line except the base slip of F15. Sheet 1 now stands at
20 of 31; what remains needs other scenes (underground, water, castle, the
WORLD card), the end of 1-1 (flagpole, Koopa) or power-ups (big Mario,
mushroom, fire flower, star, fireball). The mapping knows where world and
level live (sheet 3, promoted), so a task can say to reach a level by
writing them and losing a life.
