# Config: 20261009-2310-sheet1-objects-palettes

- commit: `4550b87`
- game: Super Mario Bros. (World) (sha1 `33d23c2f2cfa4c9efec87f7bc1321ce3ce6c89bd`)
- spec: `eval/spec/smb.json` v13 · lines: A3.question,A3.pipe,A3.cloud,A5.overworld.bg0,A5.overworld.bg1,A5.overworld.bg2,A5.overworld.bg3,A4.goomba,A4.coin
- model: deepseek-flash · blind: true (JEROMY_BLIND=1) · holdout: false
- caps: $1.00 per run · min tool calls per task 8 · trio timeout 900 s
- balance before: $4.59
- started: 2026-10-09T23:10:22-05:00

## Task 1

```
Mapping sheet 1 (what the pictures are), Super Mario Bros., scene: World 1-1. Name three background objects: the question block, the warp pipe and the cloud (walk right until each is on screen). For each: get_region in object mode on it (the proof), then record each of its CHR tiles with record_mapping mapping_type tile, the tile id, table (the pattern table it is drawn from), a plain name naming the object and the part ('pipe top-left'), and group naming the object. Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again, and take a screenshot to confirm World 1-1 began. Holding Right for about four seconds from the start of 1-1 runs into the first enemy and loses a life. Each play_input call is at most 600 frames; chain calls; save_state once 1-1 begins and load_state to retry. pause_emulator before you inspect a frame so it holds still. No reference is available. Call promote_mappings once at the end.
```

## Task 2

```
Mapping sheet 1 (what the pictures are), Super Mario Bros., scene: the first screen of World 1-1. Say what each slot of each of the four background palettes paints there. For each background palette 0-3: write_palette one of its slots to a clearly different color, screenshot to see what changed, clear_palette_overrides, and repeat for its other slots as needed; then record_mapping mapping_type palette, id the palette number, a plain name, notes saying what each slot paints on this screen (and that slot 0 is the shared backdrop). Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again, and take a screenshot to confirm World 1-1 began. Holding Right for about four seconds from the start of 1-1 runs into the first enemy and loses a life. Each play_input call is at most 600 frames; chain calls; save_state once 1-1 begins and load_state to retry. pause_emulator before you inspect a frame so it holds still. No reference is available. Call promote_mappings once at the end.
```

## Task 3

```
Mapping sheet 1 (what the pictures are), Super Mario Bros., scene: World 1-1. Name two metasprites: the Goomba (walk right until the first one is on screen) and the coin that pops out of a question block (jump up into the first question block from below and pause while the coin is in the air). For each: list_sprites on it (the proof), then record_mapping mapping_type sprite, id 'goomba' or 'block_coin', a plain name, notes giving each OAM tile id with its x/y offset, flips and sprite palette. Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again, and take a screenshot to confirm World 1-1 began. Holding Right for about four seconds from the start of 1-1 runs into the first enemy and loses a life. Each play_input call is at most 600 frames; chain calls; save_state once 1-1 begins and load_state to retry. pause_emulator before you inspect a frame so it holds still. No reference is available. Call promote_mappings once at the end.
```

[eval-mapping-in] held back tiles.chr:0x153, 3 note(s) (A3.question), tiles.0x60-0x6A, tiles.0x69, tiles.chr:0x135, tiles.chr:0x136, tiles.chr:0x137, tiles.chr:0x138, tiles.chr:0x125, tiles.0x70-0x73, palettes.7 (sprite), palettes.0, palettes.0 (background), scenes.overworld, tiles.chr:0x130, tiles.chr:0x131, tiles.chr:0x132, tiles.chr:0x133, tiles.chr:0x126, tiles.chr:0x134, 3 note(s) (A5.overworld.bg0), palettes.1, tiles.chr:0x145, tiles.chr:0x147, tiles.chr:0x1B4, tiles.chr:0x1B5, tiles.chr:0x1B6, tiles.chr:0x1B7, palettes.2 (background), palettes.3 (background), tiles.0x2E, tiles.chr:0x12E, 2 note(s) (name it)
- balance after: $4.50 · ended: 2026-10-09T23:19:17-05:00
