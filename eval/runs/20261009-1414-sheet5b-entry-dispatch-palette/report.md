# Report: 20261009-1414-sheet5b-entry-dispatch-palette

First run of the sheet-5 lines a trace on a mapped address cannot reach:
the reset and NMI entries (task 1), the game-mode dispatch and the area
palette loader (task 2). deepseek-flash, blind, $0.11, 112 tool calls.

## Distribution

| Stage | Count |
|---|---|
| lines in scope | 4 |
| attempted | 4 |
| reached proof (disassembly shown) | 4 |
| recorded | 4 |
| derived | 3 (the reset entry came from reading the vector at `$FFFC`, which no diff or trace lists; the grader cannot see a vector read) |
| promoted (eval-promote) | 4 |
| graded right | 4: `$8000` Start, `$8082` NonMaskableInterrupt, `$8212` OperModeExecutionTree, `$85BF` GetAreaPalette |
| graded wrong | 0 |
| cost (USD), tool calls, wall time | 0.11, 112, about 9 min |

Side discoveries, all right and promoted as gap fills: `$8EDD` UpdateScreen
(the NMI's VRAM-buffer writer, now its own spec line E3.vram_writer, v4),
`$074E` AreaType (the palette selector index), `$0773` the VRAM buffer
selector. A note tracing the level-start palette chain is `not graded`
(code, no picture; each address in it is graded on its own row).

## How (from the replay)

Reset and NMI: `read_memory` of the vectors, `disassemble` at each target.
Dispatch: from the NMI's `JSR $8212`, the jump table after it. Palette
loader: from the `$2006/$2007` writer (`$8EDD`) back to the RAM buffer,
then a write trace on the buffer during an area load, to the routine that
fills it and its entry `$85BF`, with the selector table `$85BB`.

## Ledger

- **F1 root cause found.** Task 2 ended on `MALFORMED_RESPONSE` after 3
  calls; the debug line in the dsh checkout logged the provider's tool
  input: `disassemble "{\"address\": 0x8182, \"length\": 80}"`. The model
  writes hex literals in JSON tool arguments, which is invalid JSON. The
  prompt asks for hex in prose (`0x29`, roadmap item 13), and the model
  carried it into JSON. One resume carried this task through.
- **F7, F11:** `disassemble` no errors; one `trace_writes` refusal while
  paused (F11, minor).

## Grader fixes made because of this run

Four: a routine's own `rom_origins` no longer become origin claims (they had
landed on palette and level lines); line assignment never reads a claim's
notes (a VRAM selector had landed on the level line); a name's head stops
at a ` - ` separator; acronyms split in camelCase (`WriteVRAMBuffer`).
`eval-grade` no longer overwrites a judged `grades.md` (its check read the
columns in the wrong order and had lost `20261009-1144`'s judge row,
restored from `7ec93e5`); `eval-promote` never adds a side entry its own
run graded wrong. Every run was regraded after each change; every run's
stages came out the same as before.

## The change this run argues for

**A prompt line** under "Writing hex": tool arguments are JSON with decimal
numbers, never `0x…` (ledger F1). Checked live: asked to restate the rule
and then disassemble `$8082`, the model wrote `{"address":32898}`.
