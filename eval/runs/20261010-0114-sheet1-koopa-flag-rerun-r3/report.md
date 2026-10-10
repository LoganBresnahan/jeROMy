# Report: sheet1-koopa-flag-rerun, three repeats (r1-r3)

The re-run of `20261010-0016-sheet1-powerups-koopa-flag` task 3 (the Koopa
Troopa and the flagpole, both far into 1-1) after one change: the
`play-to-reach` skill (ledger F16), named in the task. Runs
`20261010-0047-…-r1`, `0059-…-r2`, `0114-…-r3`; $0.53 for the series; 111,
157, 292 tool calls; r1 finished in 724 s, r2 and r3 hit the 900 s cap.

## Distribution

| line | before | r1 | r2 | r3 | decided |
|---|---|---|---|---|---|
| A3.flagpole | not recorded | right | right | right | 3/3, promoted |
| A4.koopa | not recorded | right | not recorded | not recorded | 1/3, not promoted |

Judged from the screenshots and the CHR: the shaft is `$1A2`/`$1A3`, two
one-pixel lines at the tile edges that meet in a 2-pixel pole; the ball is
`$12F`/`$13D`; the flag is a sprite, `$7E`/`$7F` in palette 5 (spec v16
lets the flagpole line take a sprite). r1's Koopa is `$A5` with a `$FC`
filler over `$A7 $A6 / $A9 $A8`, all h-flipped (facing left), the green
Koopa at the screen's edge in `task-1/4a52f4d4a807.png`.

## Did the change work?

For distance, yes: every repeat reached the flagpole by play with save
states (15, 15, 26 `load_state` calls), where the first run reached page 4
and stopped. r1 also made the run safe by writing the star timer
(`$079F`, promoted on sheet 3) so the Goombas could not kill Mario, and
recorded that as a note. The Koopa is the harder target: it spawns only as
the camera reaches it and walks on; r2 and r3 passed its stretch while
looking for it by enemy-slot reads, and spent the rest of the cap there.

## Two findings outside the worker

- **F17, web tools in blind runs.** r2 and r3 (and three tasks of earlier
  runs tonight) called `web_search`/`web_fetch`. Here every record came
  before the first web call, so the flagpole grades are clean; the fix and
  the audit are in the ledger.
- **Promotion side door.** A 1-of-3 Koopa claim entered the mapping as a
  side discovery on the first promote; side discoveries now skip any claim
  on an in-scope line (the vote decides those), and the mapping was
  restored before the re-promote.

## The change the Koopa argues for

A task fact, not a skill change: where the Koopa is on 1-1 (it is the only
Koopa in the level, near the stairs after the last ? blocks), or a route
that spawns one: the enemy-type entry (sheet 3) turns a Goomba into a
Koopa when written, which is how the old hand-made session drew one. The
Koopa line stays open for the next sheet-1 run with the star.
