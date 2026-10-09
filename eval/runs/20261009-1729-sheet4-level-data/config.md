# Config: 20261009-1729-sheet4-level-data

- commit: `b78e7be`
- game: Super Mario Bros. (World) (sha1 `33d23c2f2cfa4c9efec87f7bc1321ce3ce6c89bd`)
- spec: `eval/spec/smb.json` v7 · lines: D3.1-1,D2.area_pointers,D2.enemy_pointers
- model: deepseek-flash · blind: true (JEROMY_BLIND=1) · holdout: false
- caps: $1.00 per run · min tool calls per task 10 · trio timeout 900 s
- balance before: $6.06
- started: 2026-10-09T17:29:37-05:00

## Task 1

```
Mapping sheet 4 (the level data), Super Mario Bros.: find where in PRG ROM World 1-1's layout data lives (the records that place its ground, blocks, pipes and so on) and, separately, where its enemy placements live. Before any ROM write: new_hack named eval-sheet4-data with description 'eval run', then use_hack eval-sheet4-data, so every write goes into that throwaway hack. At the very end, after promote_mappings, use_hack default. No reference is available. NES games usually store a level as compact object records read when the level loads, often with a pointer to them kept in RAM; snapshot_memory and diff_memory around a level load, read_memory and disassemble of the code that walks the data, trace_writes in read mode, and search_memory can lead to it. Prove each claim with a ledgered write_memory to prgRom of one byte (with a reason), reset_emulator, starting 1-1 again, and a screenshot showing the level changed as predicted; then undo_edit it. Record a level's data with record_mapping mapping_type level, id '1-1', a plain name, and rom_origins giving mem prgRom, offset and length of each part (the objects and, separately, the enemies); record a table with record_mapping mapping_type note and its rom_origins. Notes say what the bytes are and the proof, source 'trace and ledgered write'. Call promote_mappings once at the end. Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again, and take a screenshot to confirm World 1-1 began. Holding Right for about four seconds from the start of 1-1 runs into the first enemy and loses a life; the level then reloads from its data. Each play_input call is at most 600 frames; chain calls.
```

## Task 2

```
Mapping sheet 4 (the level data), Super Mario Bros.: find the tables in PRG ROM that tell the game where each area's layout data and each area's enemy data begin (the pointer tables). Before any ROM write: new_hack named eval-sheet4-ptrs with description 'eval run', then use_hack eval-sheet4-ptrs, so every write goes into that throwaway hack. At the very end, after promote_mappings, use_hack default. No reference is available. NES games usually store a level as compact object records read when the level loads, often with a pointer to them kept in RAM; snapshot_memory and diff_memory around a level load, read_memory and disassemble of the code that walks the data, trace_writes in read mode, and search_memory can lead to it. Prove each claim with a ledgered write_memory to prgRom of one byte (with a reason), reset_emulator, starting 1-1 again, and a screenshot showing the level changed as predicted; then undo_edit it. Record a level's data with record_mapping mapping_type level, id '1-1', a plain name, and rom_origins giving mem prgRom, offset and length of each part (the objects and, separately, the enemies); record a table with record_mapping mapping_type note and its rom_origins. Notes say what the bytes are and the proof, source 'trace and ledgered write'. Call promote_mappings once at the end. Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again, and take a screenshot to confirm World 1-1 began. Holding Right for about four seconds from the start of 1-1 runs into the first enemy and loses a life; the level then reloads from its data. Each play_input call is at most 600 frames; chain calls.
```

[eval-mapping-in] no in-scope entries to hold back
- balance after: $5.91 · ended: 2026-10-09T17:47:07-05:00
