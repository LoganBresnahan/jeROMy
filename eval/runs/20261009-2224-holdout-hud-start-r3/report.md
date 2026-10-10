# Report: holdout-hud-start, three repeats (r1-r3), holdout

A re-run of `20261009-1358-holdout-hud-f2-r3` (rupees, bombs, keys,
hearts on Zelda's first screen) after Logan's answer to that report's
question: option (b), a start state made by hand (ADR-0023). Same task text
except the name-registration facts are replaced by "first call load_state
with file `Legend of Zelda, The (USA)_1.mss`". Runs
`20261009-2153-…-r1`, `20261009-2209-…-r2`, `20261009-2224-…-r3`; 900 s
cap, $0.38 for the series (balance $5.35 → $4.97); 240,
261, 254 tool calls.

A first attempt at this series ran under trio.sh's 420 s default because
the runner script left out the 900 s every earlier run had; its runs were
deleted, not graded, and `eval-run.sh` now defaults to 900 s.

## Distribution

| line | before (hud-f2 r1-r3) | r1 | r2 | r3 |
|---|---|---|---|---|
| C1.rupees | not recorded | not recorded | not recorded | not recorded |
| C1.bombs | not recorded | not recorded | not recorded | not recorded |
| C1.keys | not recorded | not recorded | not recorded | not recorded |
| C1.hearts | not recorded | not recorded | not recorded | not recorded |

Graded: 0 of 4 in every repeat. `comparison.md` in each run: `same`.

## What changed underneath (from the replays)

The start state did what it was for: no repeat spent a call on the title,
the file screen or name entry, and each reloaded it freely (28, 12, 19
`load_state` calls). The time went to the lines instead, and every repeat
worked on the right bytes without recording any (the reference labels,
read by the grader after the runs, not by the worker):

- **Hearts:** all three repeats wrote and decoded `$066F` (HeartValues) and
  `$0670` (HeartPartial) for most of their calls, and r2 and r3 had a model
  of the encoding fitting seven data points (high nibble containers, low
  nibble full hearts, `$0670` the partial heart). None recorded it.
- **Rupees and keys:** r2 and r3 wrote `$066D` (InvRupees) and `$066E`
  (InvKeys) and saw the HUD follow; r1 tested `$0664` for keys and rightly
  doubted it (a flag: InvMagicKey).
- **Bombs:** r3 reached `$0658` (InvBombs) by tracing the HUD code from
  PRG.
- **Reading the HUD:** 32 to 46 `get_pixel_color` calls a repeat, sampling
  single pixels of 8x8 digits to tell an 8 from a key glyph or a half heart
  from an empty one, where a screenshot read did not settle it.

Did the SMB gain carry? Partly: the F2 route ran (r1 bisected with writes;
`equals`/`unchanged` narrowing in r2 and r3) and found the right bytes, but
the proof-then-record step never came, so the holdout still shows no line.
Nothing is tuned from this (ADR-0020 §5); the pattern goes in the ledger as
F13, holdout-only until an SMB run shows it.

## Ledger

- **F2:** changed, now partly measured: the route reaches the right bytes
  on the holdout; no claim to grade.
- **F6:** fixed for the holdout by ADR-0023 (setup no longer spends calls).
- **F11:** seen once more (r3, `trace_writes` while paused).
- **New F13:** the worker holds every record until all four values are
  settled and the cap ends the session first. Holdout-only.
- **New F14:** `search_memory` on `cpuDebug` failed (`invalid memory type`,
  r2 and r3): Mesen sizes only backing memories. Fixed in `bridge.lua` (the
  bus width for the CPU/PPU address spaces); not holdout tuning, the tool
  advertises that type on every game.
