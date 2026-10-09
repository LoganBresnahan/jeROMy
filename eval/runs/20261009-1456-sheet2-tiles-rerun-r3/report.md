# Report: sheet2-tiles-rerun, three repeats (r1-r3)

> **Contaminated (found after the series, ledger F10):** the mapping copy these repeats started from held back the lines' own entries but not other entries naming the same addresses; the answers were in the prompt. The verdicts stand as recorded; they are not evidence the method found the answers. The series is re-run with the broader hold-back.

A re-run of `20261009-1428-sheet2-text-tiles` task 2 (the ? block's
metatile entry, small Mario's standing frame) after `reset_emulator`'s
timeout was widened for paused resets (ledger F12). Same task text; each
repeat in the throwaway hack `eval-sheet2-tiles`, removed after it; each
started without the two entries (held back: `tiles.chr:0x153`,
`sprites.small_mario_standing`). Runs `20261009-1442-…-r1`,
`20261009-1450-…-r2`, `20261009-1456-…-r3`; $0.05, $0.06, $0.07; 89, 85, 56
tool calls. The `default` hack's ledger checksum is unchanged.

## Against 20261009-1428

| line | before | r1 | r2 | r3 | series |
|---|---|---|---|---|---|
| B2.metatiles | unproven, derived | agrees, derived | agrees, derived | agrees, derived | **better (3/3)** |
| B3.player_sprites | unproven, derived | agrees, derived | agrees, derived | agrees, derived | **better (3/3)** |

## Ledger checks

- **F12 (paused reset timed out): passed, 3/3.** No `reset_emulator`
  error in any stream; both lines reached `write+reset+look` in every
  repeat.
- **F10 (start from its own answer): passed.** Each `config.md` lists the
  two entries held back.
- **F1 (provider error):** none in these three tasks (the prompt line about
  decimal JSON is in force).

Judged by Claude, seven picture rows, all `confirmed` (`grades.md` in each
repeat names its image): the coin ? blocks lose their top-left quadrant,
the power-up ? stays whole; small Mario loses his top-left 8x8 (r1 wrote a
leg tile there instead, and his legs show at the top-left).

## Promoted (ADR-0022)

Both lines 3/3 right. `tiles.0x53-0x56` (r2's entry, with the PRG origin)
replaces the line's earlier gap fill `tiles.chr:0x153`; it also replaces the
2026-10-05 picture-only entry of the same key, whose nametable notes it
does not repeat. `sprites.small_mario_standing` (r1's) replaces the gap fill.
`eval-promote` learned two rules on the way: a real entry beats a note, and
a decided line's other candidates are not side entries.

## The change this run argues for

None. The change under test (the reset timeout) held in all three.
