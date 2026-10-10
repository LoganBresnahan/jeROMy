# Config: 20261009-2322-sheet1-scenes

- commit: `01b0362`
- game: Super Mario Bros. (World) (sha1 `33d23c2f2cfa4c9efec87f7bc1321ce3ce6c89bd`)
- spec: `eval/spec/smb.json` v13 · lines: A1.card,A1.underground,A1.water,A1.castle
- model: deepseek-flash · blind: true (JEROMY_BLIND=1) · holdout: false
- caps: $1.00 per run · min tool calls per task 8 · trio timeout 900 s
- balance before: $4.46
- started: 2026-10-09T23:22:47-05:00

## Task 1

```
Mapping sheet 1 (what the pictures are), Super Mario Bros., scenes: the 'WORLD x-y' card shown between lives, and World 1-2 (underground). For each, get there, take the screenshot, and record it with record_mapping mapping_type scene, id as given, a plain name, reach saying exactly how you got there (the writes and inputs, so it can be repeated), and notes naming its background pattern table and which palette paints what. The proof is a screenshot taken in the scene. Ids: 'card' and 'underground'. Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again, and take a screenshot to confirm World 1-1 began. Holding Right for about four seconds from the start of 1-1 runs into the first enemy and loses a life; the game then shows a black card 'WORLD x-y' with the lives left and reloads the level. World 1-2 is underground, World 2-2 is under water and World 1-4 is a castle. The mapping you start from already names the RAM that holds the world and level numbers; how the game picks the area it loads is not mapped. Each play_input call is at most 600 frames; chain calls; save_state once a level begins and load_state to retry. pause_emulator before you inspect a frame so it holds still. No reference is available. Call promote_mappings once at the end.
```

## Task 2

```
Mapping sheet 1 (what the pictures are), Super Mario Bros., scenes: World 2-2 (under water) and World 1-4 (a castle). For each, get there, take the screenshot, and record it with record_mapping mapping_type scene, id as given, a plain name, reach saying exactly how you got there (the writes and inputs, so it can be repeated), and notes naming its background pattern table and which palette paints what. The proof is a screenshot taken in the scene. Ids: 'water' and 'castle'. Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again, and take a screenshot to confirm World 1-1 began. Holding Right for about four seconds from the start of 1-1 runs into the first enemy and loses a life; the game then shows a black card 'WORLD x-y' with the lives left and reloads the level. World 1-2 is underground, World 2-2 is under water and World 1-4 is a castle. The mapping you start from already names the RAM that holds the world and level numbers; how the game picks the area it loads is not mapped. Each play_input call is at most 600 frames; chain calls; save_state once a level begins and load_state to retry. pause_emulator before you inspect a frame so it holds still. No reference is available. Call promote_mappings once at the end.
```

[eval-mapping-in] held back 2 note(s) (A1.card)
- task 2: turn ended on an error ("code":"MALFORMED_RESPONSE"); resume 1 with "continue"
- balance after: $4.33 · ended: 2026-10-09T23:37:25-05:00
