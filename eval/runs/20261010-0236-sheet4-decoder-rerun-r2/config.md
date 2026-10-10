# Config: 20261010-0236-sheet4-decoder-rerun-r2

- commit: `c101d5e`
- game: Super Mario Bros. (World) (sha1 `33d23c2f2cfa4c9efec87f7bc1321ce3ce6c89bd`)
- spec: `eval/spec/smb.json` v19 · lines: D1.area_format
- model: deepseek-flash · blind: true (JEROMY_BLIND=1) · holdout: false
- re-run of: `20261010-0201-sheet4-level2-timer-decoder` (eval/failures.md entries for these lines apply)
- caps: $1.00 per run · min tool calls per task 8 · trio timeout 900 s
- balance before: $2.06
- started: 2026-10-10T02:36:29-05:00

## Task 1

```
Mapping sheet 4 (the level data), Super Mario Bros.: find the routine that reads a level's layout records and builds the level from them (the area object decoder). Use trace_writes in read mode on the layout data of World 1-1 while the level loads and scrolls to get the reading PC, then disassemble back to the routine's entry; prove it by a ledgered write_memory to prgRom of one layout byte (with a reason), reset_emulator, and a screenshot of 1-1 showing the object changed as the routine would read it. Before any ROM write: new_hack named eval-sheet4-c with description 'eval run', then use_hack eval-sheet4-c, so every write goes into that throwaway hack; undo_edit each write once proven. At the very end, after promote_mappings, use_hack default. Record the routine with record_mapping mapping_type routine, id the entry address, name 'area object decoder', notes saying how it reads the records and how you found it. Use the find-routine skill. Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again. World 1-1 starts with TIME 400. World 1-2 is underground. The mapping you start from names the RAM byte that selects which area the game loads (write it on the title screen, before Start) and the PRG pointer tables of each area's layout and enemy data. Each play_input call is at most 600 frames; chain calls. No reference is available. Call promote_mappings once at the end.
```

[eval-mapping-in] held back levels.1-1 (hold), levels.1-2 (hold), 2 note(s) (D1.area_format, /950[0-9a-f]|951[0-9a-f]|\$95xx|parser|9508/)
- balance after: $1.95 · ended: 2026-10-10T02:45:43-05:00
