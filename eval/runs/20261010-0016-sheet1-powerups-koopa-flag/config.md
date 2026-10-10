# Config: 20261010-0016-sheet1-powerups-koopa-flag

- commit: `8b2d792`
- game: Super Mario Bros. (World) (sha1 `33d23c2f2cfa4c9efec87f7bc1321ce3ce6c89bd`)
- spec: `eval/spec/smb.json` v14 · lines: A4.mushroom,A4.big_mario,A4.fire_flower,A4.fireball,A4.koopa,A3.flagpole
- model: deepseek-flash · blind: true (JEROMY_BLIND=1) · holdout: false
- caps: $1.00 per run · min tool calls per task 8 · trio timeout 900 s
- balance before: $3.88
- started: 2026-10-10T00:16:32-05:00

## Task 1

```
Mapping sheet 1 (what the pictures are), Super Mario Bros., World 1-1: name two metasprites, the super mushroom (pause while it is on screen after it comes out of its block) and big Mario (after he takes it). For each: list_sprites on it (the proof), then record_mapping mapping_type sprite, id as given, a plain name, notes giving each OAM tile id with its x/y offset, flips and sprite palette. Ids: 'mushroom' and 'big_mario'. Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again, and take a screenshot to confirm World 1-1 began. In 1-1 the first ? block gives a coin; in the row of bricks and ? blocks to its right, the left ? block gives a super mushroom that slides right, and touching it makes Mario big. When Mario is already big, a ? block that would give a mushroom gives a fire flower; touching it makes him Fire Mario, who throws a fireball when B is pressed. Each play_input call is at most 600 frames; chain calls; save_state when a useful state is reached and load_state to retry. pause_emulator before you inspect a frame so it holds still. No reference is available. Call promote_mappings once at the end.
```

## Task 2

```
Mapping sheet 1 (what the pictures are), Super Mario Bros., World 1-1: name two metasprites, the fire flower (pause while it is on screen) and Fire Mario's fireball (pause while one is in flight). For each: list_sprites on it (the proof), then record_mapping mapping_type sprite, id as given, a plain name, notes giving each OAM tile id with its x/y offset, flips and sprite palette. Ids: 'fire_flower' and 'fireball'. Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again, and take a screenshot to confirm World 1-1 began. In 1-1 the first ? block gives a coin; in the row of bricks and ? blocks to its right, the left ? block gives a super mushroom that slides right, and touching it makes Mario big. When Mario is already big, a ? block that would give a mushroom gives a fire flower; touching it makes him Fire Mario, who throws a fireball when B is pressed. Each play_input call is at most 600 frames; chain calls; save_state when a useful state is reached and load_state to retry. pause_emulator before you inspect a frame so it holds still. No reference is available. Call promote_mappings once at the end.
```

## Task 3

```
Mapping sheet 1 (what the pictures are), Super Mario Bros.: name the Koopa Troopa (the turtle enemy; the first one in 1-1 is far to the right, past the pipes) as a metasprite, and the flagpole and its flag at the end of a level as a background object. For the Koopa: list_sprites on it (the proof), then record_mapping mapping_type sprite, id as given, a plain name, notes giving each OAM tile id with its x/y offset, flips and sprite palette. Id 'koopa'. For the flagpole: get_region in object mode on the pole and on the flag (the proof); record each CHR tile of the pole and its top ball with record_mapping mapping_type tile, the tile id, table, a plain name ('flagpole shaft', 'flagpole ball') and group 'flagpole', and the flag (it may be a sprite) as mapping_type sprite id 'flag' with its OAM tiles, or as tiles in group 'flagpole'. Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again, and take a screenshot to confirm World 1-1 began. In 1-1 the first ? block gives a coin; in the row of bricks and ? blocks to its right, the left ? block gives a super mushroom that slides right, and touching it makes Mario big. When Mario is already big, a ? block that would give a mushroom gives a fire flower; touching it makes him Fire Mario, who throws a fireball when B is pressed. Each play_input call is at most 600 frames; chain calls; save_state when a useful state is reached and load_state to retry. pause_emulator before you inspect a frame so it holds still. No reference is available. Call promote_mappings once at the end.
```

[eval-mapping-in] held back tiles.0x20-0x27, tiles.0x08-0x17, addresses.0x0754 (hold), addresses.0x0756 (hold), addresses.0x0016 (hold)
- balance after: $3.47 · ended: 2026-10-10T00:44:21-05:00
