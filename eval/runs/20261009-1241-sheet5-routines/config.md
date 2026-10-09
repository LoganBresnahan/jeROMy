# Config: 20261009-1241-sheet5-routines

- commit: `c58660a`
- game: Super Mario Bros. (World) (sha1 `33d23c2f2cfa4c9efec87f7bc1321ce3ce6c89bd`)
- spec: `eval/spec/smb.json` v3 · lines: E5.coin,E5.digits,E5.lose_life,E5.timer
- model: deepseek-flash · blind: true (JEROMY_BLIND=1) · holdout: false
- caps: $1.00 per run · min tool calls per task 10 · trio timeout 900 s
- balance before: $8.25
- started: 2026-10-09T12:41:00-05:00

## Task 1

```
Mapping sheet 5 (the routines), Super Mario Bros.: find the routine that adds a coin when Mario takes one, and, if the coin digits are updated by a helper shared with other counters, that helper too. No reference is available. The RAM addresses of the coin count, the lives counter and the timer digits are already in this game's mapping (see Known Addresses); start from them. trace_writes on an address while the event happens gives the program counters that write it; disassemble around a PC to read the code. A write found this way may sit in the middle of a routine, so find the routine's entry point (where it begins: the instruction after the previous rts or jmp, or the target of the jsr that calls it) and record the entry. A write may also happen in a small helper shared by several counters; then the routine that does the job named here is the helper's caller, and the helper is worth recording separately as what it is. Prove each routine by showing its code with disassemble and saying which instruction does the job. Record each with record_mapping: mapping_type routine, id the entry address in hex (CPU address), a plain name, notes with how it was found, the instruction that does the job and its caller if known, length if known, source 'trace and disassembly'. Call promote_mappings once at the end. Report each routine's entry, what it does, and the evidence. Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again, and take a screenshot to confirm World 1-1 began. In 1-1, holding Right for about two and a half seconds from the start brings Mario under the first ? block floating overhead; jumping (A) into it from below gives one coin. Holding Right for about four seconds from the start runs into the first enemy and loses a life. The TIME counter ticks down by itself. trace_writes needs the game running, not paused. Each play_input call is at most 600 frames; chain calls.
```

## Task 2

```
Mapping sheet 5 (the routines), Super Mario Bros.: find the routine that takes a life away when Mario dies, and the routine that counts the level timer down. No reference is available. The RAM addresses of the coin count, the lives counter and the timer digits are already in this game's mapping (see Known Addresses); start from them. trace_writes on an address while the event happens gives the program counters that write it; disassemble around a PC to read the code. A write found this way may sit in the middle of a routine, so find the routine's entry point (where it begins: the instruction after the previous rts or jmp, or the target of the jsr that calls it) and record the entry. A write may also happen in a small helper shared by several counters; then the routine that does the job named here is the helper's caller, and the helper is worth recording separately as what it is. Prove each routine by showing its code with disassemble and saying which instruction does the job. Record each with record_mapping: mapping_type routine, id the entry address in hex (CPU address), a plain name, notes with how it was found, the instruction that does the job and its caller if known, length if known, source 'trace and disassembly'. Call promote_mappings once at the end. Report each routine's entry, what it does, and the evidence. Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again, and take a screenshot to confirm World 1-1 began. In 1-1, holding Right for about two and a half seconds from the start brings Mario under the first ? block floating overhead; jumping (A) into it from below gives one coin. Holding Right for about four seconds from the start runs into the first enemy and loses a life. The TIME counter ticks down by itself. trace_writes needs the game running, not paused. Each play_input call is at most 600 frames; chain calls.
```

- task 2: turn ended on an error ("code":"MALFORMED_RESPONSE"); resumed once with "continue"
- balance after: $8.11 · ended: 2026-10-09T12:59:14-05:00
