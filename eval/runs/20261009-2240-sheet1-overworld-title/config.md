# Config: 20261009-2240-sheet1-overworld-title

- commit: `f1c9512+dirty`
- game: Super Mario Bros. (World) (sha1 `33d23c2f2cfa4c9efec87f7bc1321ce3ce6c89bd`)
- spec: `eval/spec/smb.json` v12 · lines: A1.overworld,A3.ground,A3.hill,A3.bush,A4.small_mario,A5.overworld.sp0,A3.brick,A1.title,A3.title_logo,A6.hud,A7.font
- model: deepseek-flash · blind: true (JEROMY_BLIND=1) · holdout: false
- caps: $1.00 per run · min tool calls per task 8 · trio timeout 900 s
- balance before: $4.97
- started: 2026-10-09T22:40:17-05:00

## Task 1

```
Mapping sheet 1 (what the pictures are), Super Mario Bros., scene: the first screen of World 1-1. Name the scene and the background objects on that screen: the ground, the hill and the bush. Record the scene with record_mapping mapping_type scene, id 'overworld', a plain name, reach saying how you got there, and notes naming its background pattern table and which background palette paints what. For each object, get_region in object mode on it (that is the proof), then record each of its CHR tiles with record_mapping mapping_type tile, the tile id, table (the pattern table it is drawn from), a plain name naming the object and the part ('hill top-left'), and group naming the object. Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again, and take a screenshot to confirm World 1-1 began. Holding Right for about four seconds from the start of 1-1 runs into the first enemy and loses a life. Each play_input call is at most 600 frames; chain calls. pause_emulator before you inspect a frame so it holds still. No reference is available. Call promote_mappings once at the end.
```

## Task 2

```
Mapping sheet 1 (what the pictures are), Super Mario Bros., scene: World 1-1. Name small Mario as a metasprite and the colors he is painted with, and the brick block (walk right until bricks are on screen). For Mario: list_sprites on him (the proof), then record_mapping mapping_type sprite, id 'small_mario', a plain name, notes giving each OAM tile id with its x/y offset and flips. For his colors: write_palette one slot of the sprite palette he uses to a clearly different color, screenshot to see what changed, then clear_palette_overrides; record_mapping mapping_type palette with the palette's id and notes saying what each of its slots paints. For the brick: get_region in object mode on one brick block (the proof), then record each of its CHR tiles with record_mapping mapping_type tile, the tile id, table, a plain name ('brick top-left') and group 'brick'. Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again, and take a screenshot to confirm World 1-1 began. Holding Right for about four seconds from the start of 1-1 runs into the first enemy and loses a life. Each play_input call is at most 600 frames; chain calls. pause_emulator before you inspect a frame so it holds still. No reference is available. Call promote_mappings once at the end.
```

## Task 3

```
Mapping sheet 1 (what the pictures are), Super Mario Bros., scenes: the title screen and the status bar along the top. Before pressing anything, screenshot the title screen. Record the title screen with record_mapping mapping_type scene, id 'title', a plain name, reach, and notes naming its pattern table. The title logo (the big SUPER MARIO BROS. sign): get_region in object mode on it (the proof), and record it with record_mapping mapping_type note, id 'title logo', naming its tile range and pattern table. The status bar (MARIO, the score, the coins, WORLD, TIME): read_nametable over its rows and compare with the screenshot (the proof); record it with record_mapping mapping_type note, id 'HUD layout', saying which nametable rows and columns hold each label and number. The font: read_tile on the digit tiles and on the letters the status bar uses (the proof), then record each with record_mapping mapping_type tile, the tile id, table, a plain name ('font digit 0', 'font letter M') and group 'font'. Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again, and take a screenshot to confirm World 1-1 began. Holding Right for about four seconds from the start of 1-1 runs into the first enemy and loses a life. Each play_input call is at most 600 frames; chain calls. pause_emulator before you inspect a frame so it holds still. No reference is available. Call promote_mappings once at the end.
```

[eval-mapping-in] no in-scope entries to hold back
- balance after: $4.87 · ended: 2026-10-09T22:46:29-05:00
