# Config: 20261010-0137-sheet2-area-palettes

- commit: `1f1b301`
- game: Super Mario Bros. (World) (sha1 `33d23c2f2cfa4c9efec87f7bc1321ce3ce6c89bd`)
- spec: `eval/spec/smb.json` v16 · lines: B1.underground_palette,B1.water_palette,B1.castle_palette
- model: deepseek-flash · blind: true (JEROMY_BLIND=1) · holdout: false
- caps: $1.00 per run · min tool calls per task 8 · trio timeout 900 s
- balance before: $2.85
- started: 2026-10-10T01:37:09-05:00

## Task 1

```
Mapping sheet 2 (where the pictures come from), Super Mario Bros.: find where in PRG ROM the palettes of three areas come from: World 1-2 (underground), World 2-2 (under water) and World 1-4 (a castle). Before any ROM write: new_hack named eval-sheet2-palettes with description 'eval run', then use_hack eval-sheet2-palettes, so every write goes into that throwaway hack. At the very end, after promote_mappings, use_hack default. No reference is available. The mapping you start from names the RAM byte that selects which area the game loads (write it on the title screen, before Start). For each area: read the palette RAM in that area (get_all_palettes), find the PRG bytes it is copied from (search_memory for the colors, then check), and prove it with a ledgered write_memory to prgRom of one of those bytes (with a reason), reset_emulator, reaching the area again, and a screenshot in which that color changed as predicted; then undo_edit it. Record each with record_mapping mapping_type palette, id naming the area ('underground', 'water', 'castle'), name '<area> palette table', notes with what the bytes are and the proof, and rom_origins giving mem prgRom, offset and length. Call promote_mappings once at the end. Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game. Each play_input call is at most 600 frames; chain calls. Report each table's offset and length and what the proof screenshot showed.
```

[eval-mapping-in] held back addresses.0x074E (hold), addresses.0x0773 (hold), routines.0x85BF (hold), scenes.underground (hold), scenes.water (hold), scenes.castle (hold), 3 note(s) (B1.underground_palette, /8ca4|8cc8|8cec|8d10|0xca4|0xcc8|0xcec|0xd10/)
- balance after: $2.63 · ended: 2026-10-10T01:51:59-05:00
