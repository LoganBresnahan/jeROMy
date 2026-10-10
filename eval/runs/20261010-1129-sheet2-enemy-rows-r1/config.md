# Config: 20261010-1129-sheet2-enemy-rows-r1

- commit: `225ee29`
- game: Super Mario Bros. (World) (sha1 `33d23c2f2cfa4c9efec87f7bc1321ce3ce6c89bd`)
- spec: `eval/spec/smb.json` v22 · lines: B3.enemy_rows
- model: deepseek-flash · blind: true (JEROMY_BLIND=1) · holdout: false
- caps: $1.00 per run · min tool calls per task 8 · trio timeout 900 s
- balance before: $4.90
- started: 2026-10-10T11:29:59-05:00

## Task 1

```
Mapping sheet 2 (where the pictures come from), Super Mario Bros.: the mapping you start from has a note on the enemy sprite layout table, a PRG ROM table of 6-byte rows; each row is the tile ids of one enemy frame in drawing order (top left, top right, middle left, middle right, bottom left, bottom right; $FC is a blank tile). Name what every row draws. read_memory the table, including a few rows before and after the bounds the note gives, since those bounds may be off. For each row call view_tiles with tiles = that row's six ids and columns 2, colored with the sprite palette that enemy uses (try 5, 6 or 7 when 4 looks wrong), and name the enemy and the frame. The table's first and last rows are where the rows stop making sense as enemy frames. Record with record_mapping mapping_type note, id 'enemy sprite layout rows', name 'enemy sprite layout rows', notes listing every row as 'prgRom 0x.... = six bytes = enemy, frame', then the first and last row, and rom_origins giving mem prgRom, offset and length of the whole table. Record as soon as the rows are named, before the proof; record again with the proof added if time allows. The proof: before any ROM write, new_hack named eval-sheet2-rows-a with description 'eval run', then use_hack eval-sheet2-rows-a; write the Goomba's row with another enemy's six bytes (ledgered write_memory to prgRom, with a reason), reset_emulator, start 1-1, and take a screenshot in which the first Goomba is drawn as that other enemy; then undo_edit and use_hack default. Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again. The first Goomba of 1-1 reaches Mario within a few seconds of the start; pause_emulator to inspect it. Each play_input call is at most 600 frames. No reference is available. Call promote_mappings once at the end.
```

[eval-mapping-in] no in-scope entries to hold back
- balance after: $4.79 · ended: 2026-10-10T11:41:17-05:00
