# Config: 20261009-2303-sheet1-rerun-r3

- commit: `ed2d9a4`
- game: Super Mario Bros. (World) (sha1 `33d23c2f2cfa4c9efec87f7bc1321ce3ce6c89bd`)
- spec: `eval/spec/smb.json` v13 · lines: A3.bush,A4.small_mario,A5.overworld.sp0,A6.hud,A7.font
- model: deepseek-flash · blind: true (JEROMY_BLIND=1) · holdout: false
- re-run of: `20261009-2240-sheet1-overworld-title` (eval/failures.md entries for these lines apply)
- caps: $1.00 per run · min tool calls per task 8 · trio timeout 900 s
- balance before: $4.70
- started: 2026-10-09T23:03:35-05:00

## Task 1

```
Mapping sheet 1 (what the pictures are), Super Mario Bros., scene: the first screen of World 1-1. Name small Mario as a metasprite and the colors he is painted with, and the bush. For Mario: list_sprites on him (the proof), then record_mapping mapping_type sprite, id 'small_mario', a plain name, notes giving each OAM tile id with its x/y offset and flips. For his colors: write_palette one slot of the sprite palette he uses to a clearly different color, screenshot to see what changed, then clear_palette_overrides; record_mapping mapping_type palette with the palette's id and notes saying what each of its slots paints. For the bush: get_region in object mode on it (the proof), then record each of its CHR tiles with record_mapping mapping_type tile, the tile id, table (the pattern table it is drawn from), a plain name naming the part ('bush top-left') and group 'bush'. Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again, and take a screenshot to confirm World 1-1 began. Holding Right for about four seconds from the start of 1-1 runs into the first enemy and loses a life. Each play_input call is at most 600 frames; chain calls. pause_emulator before you inspect a frame so it holds still. No reference is available. Call promote_mappings once at the end.
```

## Task 2

```
Mapping sheet 1 (what the pictures are), Super Mario Bros., scene: the status bar along the top (MARIO, the score, the coins, WORLD, TIME), on the title screen and in World 1-1. read_nametable over its rows and compare with a screenshot (the proof); record it with record_mapping mapping_type note, id 'HUD layout', saying which nametable rows and columns hold each label and number. The font: read_tile on the digit tiles and on the letters the status bar uses (the proof), then record each with record_mapping mapping_type tile, the tile id, table, a plain name ('font digit 0', 'font letter M') and group 'font'. Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again, and take a screenshot to confirm World 1-1 began. Holding Right for about four seconds from the start of 1-1 runs into the first enemy and loses a life. Each play_input call is at most 600 frames; chain calls. pause_emulator before you inspect a frame so it holds still. No reference is available. Call promote_mappings once at the end.
```

[eval-mapping-in] held back tiles.0x35-0x3C, tiles.0x25, sprites.mario_small_standing, tiles.0xFC, palettes.4 (sprite), 7 note(s) (A6.hud), tiles.0x2E, tiles.0x29, tiles.0xFF, tiles.0x00 (CHR 0x100), tiles.0x24, 1 note(s) (A7.font)
- balance after: $4.63 · ended: 2026-10-09T23:07:37-05:00
