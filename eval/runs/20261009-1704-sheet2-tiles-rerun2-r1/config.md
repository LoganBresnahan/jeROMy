# Config: 20261009-1704-sheet2-tiles-rerun2-r1

- commit: `a0a87fb`
- game: Super Mario Bros. (World) (sha1 `33d23c2f2cfa4c9efec87f7bc1321ce3ce6c89bd`)
- spec: `eval/spec/smb.json` v6 · lines: B2.metatiles,B3.player_sprites
- model: deepseek-flash · blind: true (JEROMY_BLIND=1) · holdout: false
- re-run of: `20261009-1428-sheet2-text-tiles` (eval/failures.md entries for these lines apply)
- caps: $1.00 per run · min tool calls per task 10 · trio timeout 900 s
- balance before: $6.35
- started: 2026-10-09T17:04:10-05:00

## Task 1

```
Mapping sheet 2 (where the pictures come from), Super Mario Bros.: find where in PRG ROM the tile ids of the ? block come from (the table that says which four 8x8 tiles make the 16x16 block), and where the tile ids of small Mario's sprite come from (the table that says which tiles make his standing frame). Before any ROM write: new_hack named eval-sheet2-tiles with description 'eval run', then use_hack eval-sheet2-tiles, so every write goes into that throwaway hack. At the very end, after promote_mappings, use_hack default. No reference is available; use the persist-edit skill. What the screen shows is drawn from tile ids (read_nametable, list_sprites, get_tile_at_pixel give them); search_memory in prgRom finds where a run of those bytes lives. Prove each origin by a ledgered write_memory to prgRom of one byte there (with a reason), reset_emulator, and a screenshot showing the predicted change; then undo_edit it. Record each with record_mapping (mapping_type tile, sprite or note as fits) with rom_origins giving mem prgRom, offset and length of the table or string, a plain name saying what the bytes are, notes with the proof, source 'search and ledgered write'. Call promote_mappings once at the end. Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again, and take a screenshot to confirm World 1-1 began. Holding Right for about two and a half seconds from the start of 1-1 brings Mario under the first ? block. Each play_input call is at most 600 frames; chain calls.
```

[eval-mapping-in] held back tiles.0x53-0x56, sprites.small_mario_standing, 3 note(s) (name it)
- balance after: $6.30 · ended: 2026-10-09T17:09:28-05:00
