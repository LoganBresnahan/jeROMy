# Report: 20261010-0201-sheet4-level2-timer-decoder

Sheet 4's last three lines on SMB, in two blind tasks: World 1-2's layout
and enemy data and the per-level timer table; the area object decoder.
deepseek-flash, $0.26, 263 tool calls, about 25 minutes; web tools off (no
`web_` call). Held back as holds: the 1-1 level entry and two notes (they
name the parser at `$9508`) and the underground scene (it names 1-2's
layout pointer).

## Distribution

| line | claim | reference | proof | verdict |
|---|---|---|---|---|
| D3.1-2 | layout `$AC35-$ACD7`, enemies `$A0D8-$A104` | L_UndergroundArea1, E_UndergroundArea1 | write+reset+look | right |
| D4.timer_header | `$912D-$9130` (`20 04 03 02`) | GameTimerData | write+reset+look (1-2 started at TIME 300) | right |
| D1.area_format | routine `$950A` | ProcessAreaData `$9508` | disassemble | **wrong** |

Cost $0.26, 263 tool calls. Spec v19: the timer table first landed on the
pointer-table line ("level ... table"); the pointer line excludes timer.
Hack hygiene: every write in `eval-sheet4-b`, undone (removed after the
run); the `default` ledger's checksum unchanged.

## Why D1 is wrong

The worker traced the decoder's read of 1-1's records (PC `$9514`) and
walked back by disassembly. The listing from `$9505` started mid-
instruction; it read the entry's `A2 02` (LDX #$02 at `$9508`) as data and
took the loop head `$950A` (ProcADLoop) for the entry. A caller search for
`20 08 95` would have shown the real entry. Ledger F18.

## The change this run argues for

A skill: `skills/find-routine/SKILL.md` (trace for a PC inside, disassemble
until the PC is an instruction boundary, walk back to the previous RTS/JMP,
and settle the entry by a JSR/JMP or table caller, never by a loop head).
The re-run of D1, three repeats, measures it. Sheet 4 is at 5 of 6.
