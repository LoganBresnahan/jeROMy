---
name: find-routine
description: Find the entry address of the code that does something (writes a counter, reads level data, copies to the PPU) with no disassembly to lean on: trace the access to get a PC inside the routine, disassemble around it, and settle the entry by who calls it (a JSR/JMP or a pointer-table target), not by where a loop starts. Use when asked which routine does X, before recording a routine, or when a persistent edit needs the code rather than the data.
whenToUse: The user asks what code writes or reads an address, which routine handles a game event, or where a routine starts; a mapping session needs a routine entry for a record.
user-invocable: true
---

# Find a routine's entry

A routine is recorded by its entry: the address its callers jump to.
`trace_writes` gives a PC somewhere inside; walking back to the entry by
eye goes wrong when the disassembly starts mid-instruction. In
eval/runs/20261010-0201-sheet4-level2-timer-decoder the worker read the
entry's own `A2 02` (LDX #$02) as data and recorded the loop head two bytes
later. Callers decide it.

## Steps

1. **Get a PC inside.** `trace_writes` on the address the routine touches
   (`mode: "read"` for data it reads, such as a level's records), across
   the event that runs it (a level load, a coin). The game must be running:
   `resume_emulator` first if paused. Note each PC and its prgRom offset.
2. **Disassemble around it.** `disassemble` from about 0x60 bytes before the
   PC. A listing that turns to nonsense (invalid opcodes, branches into the
   middle of instructions) started mid-instruction: start again one or two
   bytes later until the PC itself appears as an instruction boundary.
3. **Find the top.** Walk back to the previous `RTS` (60), `RTI` (40) or
   `JMP` (4C) that ends the routine before it; the candidate entry is the
   first instruction after it. Do not take a loop head (a branch target
   inside the routine) for the entry.
4. **Confirm by callers.** `search_memory` in prgRom for `20 lo hi` (JSR)
   and `4C lo hi` (JMP) with the candidate's address, and for the address
   as a little-endian word (a pointer or jump table). A hit decides it. No
   hit: try the next instruction boundaries up to the PC; a game that jumps
   through a table (`JSR` into a dispatcher) names the entry only in that
   table. Disassemble one caller to see it call in.
5. **Record.** `record_mapping` with `mapping_type: "routine"`, `id` the
   entry, a plain name, `notes` with what it does, the traced PC, and the
   caller that confirmed the entry; `source: "trace and disassembly"`.

## Report shape

Give the entry, the traced PC inside it, the caller (or table) that proves
the entry, and two or three lines of the disassembly at the entry, so the
person can check the boundary.

## When it fails

- The trace shows only a shared helper (a digit adder, a copy loop): the
  routine you want is that helper's caller; repeat step 4 for the helper's
  address and pick the caller that runs during the event.
- No caller anywhere: the code is reached by an RTS trick or an
  interrupt vector (`read_memory` $FFFA-$FFFF for NMI, reset and IRQ).
