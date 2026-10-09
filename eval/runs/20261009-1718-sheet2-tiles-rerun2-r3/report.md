# Report: sheet2-tiles-rerun2, three repeats (r1-r3)

The clean re-run of `20261009-1428-sheet2-text-tiles` task 2 (the ? block's
metatile entry, small Mario's standing frame), replacing the contaminated
`sheet2-tiles-rerun` series. Same task text, a throwaway hack per repeat
(removed; the `default` ledger's checksum unchanged). Each repeat started
without the two entries and without the three notes that named their PRG
locations (ledger F10, the broader hold-back including ROM origins). Runs
`20261009-1704-…-r1`, `20261009-1709-…-r2`, `20261009-1718-…-r3`; $0.05,
$0.11, $0.09.

## Against 20261009-1428

| line | before | r1 | r2 | r3 | series |
|---|---|---|---|---|---|
| B2.metatiles | unproven, derived | agrees, derived | agrees, derived | agrees, derived | **better (3/3)** |
| B3.player_sprites | unproven, derived | agrees, derived | agrees, derived | agrees, derived | **better (3/3)** |

## Ledger checks

- **F12 (paused reset timed out): passed again, 3/3** (no reset error;
  both lines `write+reset+look` in every repeat).
- **F10: passed, 3/3** (each `config.md` lists what was held back).
- **F1:** no provider error.

Seven picture rows judged `confirmed` (each names its image): the coin ?
blocks change their top-left quadrant (another glyph in r1, the digit 0 in
r2, which wrote tile `$00`, sky in r3) while the power-up ? stays whole;
small Mario loses his top-left 8x8. r2 also wrote a neighbouring frame
entry (PRG `0x6E7B`) as a control: his standing pose stayed whole.

## Promoted (ADR-0022)

`tiles.chr:0x153` (r2's, the pattern-space key) replaces `tiles.0x53-0x56`;
`sprites.mario_small_standing` (r1's) replaces the earlier entry.

## The change this run argues for

None.
