# Config: 20261010-0303-sheet2-enemy-table-chr

- commit: `4e31c77`
- game: Super Mario Bros. (World) (sha1 `33d23c2f2cfa4c9efec87f7bc1321ce3ce6c89bd`)
- spec: `eval/spec/smb.json` v20 · lines: B3.enemy_sprites,B5.chr
- model: deepseek-flash · blind: true (JEROMY_BLIND=1) · holdout: false
- caps: $1.00 per run · min tool calls per task 8 · trio timeout 900 s
- balance before: $1.75
- started: 2026-10-10T03:03:58-05:00

## Task 1

```
Mapping sheet 2 (where the pictures come from), Super Mario Bros.: find the PRG ROM table that says which sprite tiles make up each enemy's metasprite (the Goomba's entry in it). Search PRG for the Goomba's tile ids in the order the game draws them, check the hit, and prove it with a ledgered write_memory to prgRom of one of those bytes (with a reason), reset_emulator, starting 1-1 again, and a screenshot in which the Goomba is drawn with a different tile; then undo_edit. Before any ROM write: new_hack named eval-sheet2-c with description 'eval run', then use_hack eval-sheet2-c, so every write goes into that throwaway hack; undo_edit each write as soon as it is proven. At the very end, after promote_mappings, use_hack default. Record it with record_mapping mapping_type note, id 'enemy sprite layout table', name 'enemy sprite layout table', notes with what the bytes are, where the Goomba's entry is and the proof, and rom_origins giving mem prgRom, offset and length of the table as far as you can bound it. Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again. The first Goomba of 1-1 reaches Mario within a few seconds of the start; pause_emulator to inspect it. The mapping you start from names the Goomba's metasprite tiles. Each play_input call is at most 600 frames; chain calls. No reference is available. Call promote_mappings once at the end.
```

## Task 2

```
Mapping sheet 2 (where the pictures come from), Super Mario Bros. (a CHR-ROM game): find where in CHR ROM the pixels of the Goomba's top-left tile live. Prove it with a ledgered write_tile to chrRom of that tile (a visibly different pattern, with a reason), reset_emulator, starting 1-1 again, and a screenshot in which the Goomba's top-left looks changed; then undo_edit. Before any ROM write: new_hack named eval-sheet2-c with description 'eval run', then use_hack eval-sheet2-c, so every write goes into that throwaway hack; undo_edit each write as soon as it is proven. At the very end, after promote_mappings, use_hack default. Record it with record_mapping mapping_type tile, the tile id, table, name 'CHR origin of the Goomba top-left tile', group 'goomba', notes with the proof, and rom_origins giving mem chrRom, offset and length 16. Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again. The first Goomba of 1-1 reaches Mario within a few seconds of the start; pause_emulator to inspect it. The mapping you start from names the Goomba's metasprite tiles. Each play_input call is at most 600 frames; chain calls. No reference is available. Call promote_mappings once at the end.
```

[eval-mapping-in] no in-scope entries to hold back
- balance after: $1.64 · ended: 2026-10-10T03:11:42-05:00
