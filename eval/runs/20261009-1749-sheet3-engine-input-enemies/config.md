# Config: 20261009-1749-sheet3-engine-input-enemies

- commit: `4c77f5c`
- game: Super Mario Bros. (World) (sha1 `33d23c2f2cfa4c9efec87f7bc1321ce3ce6c89bd`)
- spec: `eval/spec/smb.json` v8 · lines: C4.frame_counter,C4.game_mode,C4.pause,C4.joypad,C4.rng,C3.enemy_id,C3.enemy_x,C3.enemy_y
- model: deepseek-flash · blind: true (JEROMY_BLIND=1) · holdout: false
- caps: $1.00 per run · min tool calls per task 10 · trio timeout 900 s
- balance before: $5.89
- started: 2026-10-09T17:49:01-05:00

## Task 1

```
Mapping sheet 3 (the RAM a hacker reaches for), Super Mario Bros.: find the RAM addresses of the frame counter (counts every frame), the game mode (title or attract demo versus playing a level), and the pause flag (set while the game is paused with Start). Use the find-variable skill; no reference is available. Prove each address by write_memory and a screenshot showing the predicted effect, or, for a value the game rewrites every frame, by a play_input watch whose samples follow the action exactly. Record each with record_mapping: mapping_type address, a plain name, notes with the encoding and the proof, length or stride and count when it is an array, source 'differential search'. Call promote_mappings once at the end. Report each address, its encoding and the evidence. Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again, and take a screenshot to confirm World 1-1 began. During a level, Start pauses and unpauses the game. Holding Right for about four seconds from the start of 1-1 runs into the first enemy, a Goomba walking left. Each play_input call is at most 600 frames; chain calls, and play_input's watch samples addresses while it plays.
```

## Task 2

```
Mapping sheet 3 (the RAM a hacker reaches for), Super Mario Bros.: find the RAM address where the game keeps controller 1's buttons for the current frame, and the address of the game's pseudo-random number generator state. Use the find-variable skill; no reference is available. Prove each address by write_memory and a screenshot showing the predicted effect, or, for a value the game rewrites every frame, by a play_input watch whose samples follow the action exactly. Record each with record_mapping: mapping_type address, a plain name, notes with the encoding and the proof, length or stride and count when it is an array, source 'differential search'. Call promote_mappings once at the end. Report each address, its encoding and the evidence. Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again, and take a screenshot to confirm World 1-1 began. During a level, Start pauses and unpauses the game. Holding Right for about four seconds from the start of 1-1 runs into the first enemy, a Goomba walking left. Each play_input call is at most 600 frames; chain calls, and play_input's watch samples addresses while it plays.
```

## Task 3

```
Mapping sheet 3 (the RAM a hacker reaches for), Super Mario Bros., World 1-1: find the RAM arrays that hold the enemies on screen: each enemy slot's type, horizontal position and vertical position (the game keeps several enemy slots side by side). Use the find-variable skill; no reference is available. Prove each address by write_memory and a screenshot showing the predicted effect, or, for a value the game rewrites every frame, by a play_input watch whose samples follow the action exactly. Record each with record_mapping: mapping_type address, a plain name, notes with the encoding and the proof, length or stride and count when it is an array, source 'differential search'. Call promote_mappings once at the end. Report each address, its encoding and the evidence. Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again, and take a screenshot to confirm World 1-1 began. During a level, Start pauses and unpauses the game. Holding Right for about four seconds from the start of 1-1 runs into the first enemy, a Goomba walking left. Each play_input call is at most 600 frames; chain calls, and play_input's watch samples addresses while it plays.
```

[eval-mapping-in] no in-scope entries to hold back
- balance after: $5.66 · ended: 2026-10-09T18:11:52-05:00
