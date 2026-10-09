# Config: 20261009-1814-motion-physics-loader

- commit: `a86d898`
- game: Super Mario Bros. (World) (sha1 `33d23c2f2cfa4c9efec87f7bc1321ce3ce6c89bd`)
- spec: `eval/spec/smb.json` v10 · lines: C2.player_x_speed,C2.player_y_speed,C2.facing,E5.physics,E4.area_loader
- model: deepseek-flash · blind: true (JEROMY_BLIND=1) · holdout: false
- caps: $1.00 per run · min tool calls per task 10 · trio timeout 900 s
- balance before: $5.62
- started: 2026-10-09T18:14:07-05:00

## Task 1

```
Mapping sheet 3 (the RAM a hacker reaches for), Super Mario Bros., World 1-1: find the RAM addresses of Mario's horizontal speed, his vertical speed, and the direction he faces. Use the find-variable skill; no reference is available. Prove each by write_memory and a screenshot showing the predicted effect, or, for a value the game rewrites every frame, by a play_input watch whose samples follow the action exactly. Record each with record_mapping: mapping_type address, a plain name, notes with the encoding (signed, units) and the proof, source 'differential search'. Call promote_mappings once at the end. Report each address, its encoding and the evidence. Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again, and take a screenshot to confirm World 1-1 began. Holding Right walks Mario right, B with Right runs, A jumps (longer press, higher jump), Left turns him around. Holding Right for about four seconds from the start of 1-1 runs into the first enemy and loses a life; the level then reloads. Each play_input call is at most 600 frames; chain calls, and play_input's watch samples addresses while it plays.
```

## Task 2

```
Mapping sheet 5 (the routines), Super Mario Bros.: find the PRG ROM constants that set how hard Mario jumps and how fast he falls (the jump and gravity force tables) and his maximum walking speed, and find the routine that loads an area when a level starts (the code that reads the level's data pointers). No reference is available; read_memory, disassemble, trace_writes (write or read mode) and search_memory are your tools. Before any ROM write: new_hack named eval-motion with description 'eval run', then use_hack eval-motion; at the very end, after promote_mappings, use_hack default. Prove a constant by a ledgered write_memory to prgRom of one byte (with a reason), reset_emulator, playing, and a screenshot or play_input watch showing Mario jump or move differently; then undo_edit it. Prove a routine by showing its code with disassemble and saying which instructions do the job; record its entry (where it begins). Record constants with record_mapping mapping_type note and rom_origins (mem prgRom, offset, length), routines with mapping_type routine and the entry address in hex; notes with the evidence, source 'trace and ledgered write'. Call promote_mappings once at the end. Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again, and take a screenshot to confirm World 1-1 began. Holding Right walks Mario right, B with Right runs, A jumps (longer press, higher jump), Left turns him around. Holding Right for about four seconds from the start of 1-1 runs into the first enemy and loses a life; the level then reloads. Each play_input call is at most 600 frames; chain calls, and play_input's watch samples addresses while it plays.
```

[eval-mapping-in] no in-scope entries to hold back
- balance after: $5.43 · ended: 2026-10-09T18:30:29-05:00
