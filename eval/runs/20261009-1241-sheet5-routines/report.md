# Report: 20261009-1241-sheet5-routines

First run of sheet 5 (the routines) on SMB, built on the sheet-3 addresses
already in the mapping: the coin, lives and timer routines and the helper
they share. Two tasks, two lines each (ledger F5). deepseek-flash, blind,
$0.14, 231 tool calls, about 17 minutes.

## Distribution

| Stage | Count |
|---|---|
| lines in scope | 4 (coin, shared digit helper, lose a life, timer) |
| attempted | 4 |
| reached proof (disassembly shown) | 4 |
| recorded | 4 |
| derived (a trace writer PC or a caller search hit inside the routine, before the record) | 4 |
| promoted (ADR-0022: by eval-promote, graded right) | 4 |
| graded right | 4: `$BBFE` GiveOneCoin, `$8F5F` DigitsMathRoutine, `$91CD` PlayerLoseLife, `$B74F` RunGameTimer |
| graded wrong | 0 |
| unproven | 0 |
| cost (USD), tool calls, wall time | 0.14, 231, about 1000 s |

One side discovery, right: `$075E`, the binary coin tally behind 1-ups,
found by reading the coin routine's `INC $075E` (graded on C1.coins,
`CoinTally`); promoted as a gap fill.

## How the method got there (from the replay)

- **Lives:** `trace_writes` on `$075A` across a death gave the writer PC,
  six instructions into the routine; the model disassembled backwards and
  recorded the entry `$91CD`, not the writing instruction.
- **Timer and the shared helper:** tracing the timer digits landed in a
  digit adder shared by score, coins and timer (`$8F5F`); the model
  recorded it as the helper and found its caller for the timer by tracing
  the helper's operand byte, `$B74F`.
- **Coin:** the coin digits have no direct operand anywhere in PRG, so the
  model searched PRG for `JSR $8F5F` (`20 5F 8F`), found five callers, and
  disassembled the one at `$BC09` back to its entry `$BBFE`. A real
  reverse-engineering step, done blind.

Recall (F4) looked weak here: the reasoning never names a routine address
before finding it, and every routine is `derived`.

## Ledger checks (eval/failures.md)

- **F1, provider error:** passed. Task 2 ended on `MALFORMED_RESPONSE`
  after 5 calls; the runner resumed the session, and the resumed stream
  found and recorded both of task 2's routines.
- **F7, broken tool:** passed. 19 `disassemble` calls, no errors.
- **F5, too many lines per task:** two per task; none dropped.
- **New, F11:** `trace_writes` refused once because the game was paused
  (also seen in `20261009-1135`). One wasted call each time; the refusal
  is by design (ADR-0013: only named tools run frames), and the message
  says what to do. Recorded, no change.

## Grader changes made because of this run

`derived` was defined only for addresses and origins, so every routine
read "not derived". It now counts a `trace_writes` writer PC inside the
routine, or a PRG `search_memory` hit inside it (a caller search), before
the record. Tests added; the grades above are after the change.

## The change this run argues for

None to the worker: four of four, derived, at the first attempt. The run
is the baseline for sheet 5; the next sheet-5 run should take lines where
the routine is not the direct writer of a mapped address (the level
loader, the palette loader, the NMI's frame structure), where a trace has
nothing to start from.
