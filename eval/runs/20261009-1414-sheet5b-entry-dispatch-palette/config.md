# Config: 20261009-1414-sheet5b-entry-dispatch-palette

- commit: `a1ffaef`
- game: Super Mario Bros. (World) (sha1 `33d23c2f2cfa4c9efec87f7bc1321ce3ce6c89bd`)
- spec: `eval/spec/smb.json` v3 · lines: E1.reset,E1.nmi,E2.mode_dispatch,E3.palette_loader
- model: deepseek-flash · blind: true (JEROMY_BLIND=1) · holdout: false
- caps: $1.00 per run · min tool calls per task 8 · trio timeout 900 s
- balance before: $7.52
- started: 2026-10-09T14:14:08-05:00

## Task 1

```
Mapping sheet 5 (the routines), Super Mario Bros.: find the entry points of the reset routine (what the CPU runs at power-on) and of the frame interrupt (NMI) handler. On the NES the 6502 reads its interrupt vectors from the last six bytes of the CPU address space. No reference is available. Use read_memory, disassemble, trace_writes (mode write or read) and search_memory. A routine's entry is where it begins (the target of the vector, jsr or jmp that reaches it), not an instruction inside it; record the entry. Prove each routine by showing its code with disassemble and saying which instructions do the job. Record each with record_mapping: mapping_type routine, id the entry address in hex (CPU address), a plain name, notes with how it was found and the instructions that do the job, length if known, source 'trace and disassembly'. Call promote_mappings once at the end. Report each routine's entry, what it does, and the evidence. Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again, and take a screenshot to confirm World 1-1 began. Holding Right for about four seconds from the start of 1-1 runs into the first enemy and loses a life; the level reloads after a black WORLD card. trace_writes needs the game running, not paused. Each play_input call is at most 600 frames; chain calls.
```

## Task 2

```
Mapping sheet 5 (the routines), Super Mario Bros.: find the routine that decides what the game runs each frame depending on whether it is on the title screen, in a level, or at game over (the game-mode dispatch), and the routine that loads an area's background and sprite colors when a level starts (the colors come from a table in PRG; the hardware palette is written through $2006/$2007, possibly from a RAM buffer that the frame interrupt copies). No reference is available. Use read_memory, disassemble, trace_writes (mode write or read) and search_memory. A routine's entry is where it begins (the target of the vector, jsr or jmp that reaches it), not an instruction inside it; record the entry. Prove each routine by showing its code with disassemble and saying which instructions do the job. Record each with record_mapping: mapping_type routine, id the entry address in hex (CPU address), a plain name, notes with how it was found and the instructions that do the job, length if known, source 'trace and disassembly'. Call promote_mappings once at the end. Report each routine's entry, what it does, and the evidence. Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again, and take a screenshot to confirm World 1-1 began. Holding Right for about four seconds from the start of 1-1 runs into the first enemy and loses a life; the level reloads after a black WORLD card. trace_writes needs the game running, not paused. Each play_input call is at most 600 frames; chain calls.
```

[eval-mapping-in] no in-scope entries to hold back
- task 2: turn ended on an error ("code":"MALFORMED_RESPONSE"); resume 1 with "continue"
- balance after: $7.41 · ended: 2026-10-09T14:23:31-05:00
