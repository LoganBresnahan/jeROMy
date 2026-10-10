# Config: 20261009-2340-sheet3-player-state

- commit: `89e25ed`
- game: Super Mario Bros. (World) (sha1 `33d23c2f2cfa4c9efec87f7bc1321ce3ce6c89bd`)
- spec: `eval/spec/smb.json` v13 · lines: C1.area,C2.player_y_high,C2.power,C2.star,C2.crouch,C2.swim,C3.enemy_flag,C3.enemy_state
- model: deepseek-flash · blind: true (JEROMY_BLIND=1) · holdout: false
- caps: $1.00 per run · min tool calls per task 8 · trio timeout 900 s
- balance before: $4.29
- started: 2026-10-09T23:40:43-05:00

## Task 1

```
Mapping sheet 3 (the RAM a hacker reaches for), Super Mario Bros.: find the RAM byte that selects which area of the world the game loads (so that a write followed by starting a game loads a different area), and the high byte (screen page) of Mario's vertical position. Prove the area byte by writing it, starting the game, and a screenshot of the different area; prove the vertical page byte by writing it and looking (or by watching it while Mario falls into a pit). Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again, and take a screenshot to confirm World 1-1 began. Holding Right for about four seconds from the start of 1-1 runs into the first enemy and loses a life. World 2-2 is under water. In 1-1 the first ? block gives a coin; in the row of bricks and ? blocks to its right, the left ? block gives a super mushroom that slides right, and touching it makes Mario big; big Mario can crouch by holding Down. Each play_input call is at most 600 frames; chain calls; save_state when a useful state is reached and load_state to retry. No reference is available. Use the find-variable skill. Prove each address as the task says, then record it with record_mapping: mapping_type address, a plain name, format, notes with the encoding and the proof, source 'differential search' (or 'disassembly' if you found it in code). Call promote_mappings once at the end. Report each address, its encoding and what the proof showed.
```

## Task 2

```
Mapping sheet 3 (the RAM a hacker reaches for), Super Mario Bros.: find Mario's power state (small, big, fire) and the star invincibility timer. Prove the power state by writing it and a screenshot in which Mario's size or colors changed as predicted; prove the star timer by writing it and screenshots in which Mario flashes. Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again, and take a screenshot to confirm World 1-1 began. Holding Right for about four seconds from the start of 1-1 runs into the first enemy and loses a life. World 2-2 is under water. In 1-1 the first ? block gives a coin; in the row of bricks and ? blocks to its right, the left ? block gives a super mushroom that slides right, and touching it makes Mario big; big Mario can crouch by holding Down. Each play_input call is at most 600 frames; chain calls; save_state when a useful state is reached and load_state to retry. No reference is available. Use the find-variable skill. Prove each address as the task says, then record it with record_mapping: mapping_type address, a plain name, format, notes with the encoding and the proof, source 'differential search' (or 'disassembly' if you found it in code). Call promote_mappings once at the end. Report each address, its encoding and what the proof showed.
```

## Task 3

```
Mapping sheet 3 (the RAM a hacker reaches for), Super Mario Bros.: find the flag that is set while big Mario crouches and the flag that is set while Mario swims. Prove each by watching it (play_input with watch on the candidate) while holding Down as big Mario, and while in a water level. Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again, and take a screenshot to confirm World 1-1 began. Holding Right for about four seconds from the start of 1-1 runs into the first enemy and loses a life. World 2-2 is under water. In 1-1 the first ? block gives a coin; in the row of bricks and ? blocks to its right, the left ? block gives a super mushroom that slides right, and touching it makes Mario big; big Mario can crouch by holding Down. Each play_input call is at most 600 frames; chain calls; save_state when a useful state is reached and load_state to retry. No reference is available. Use the find-variable skill. Prove each address as the task says, then record it with record_mapping: mapping_type address, a plain name, format, notes with the encoding and the proof, source 'differential search' (or 'disassembly' if you found it in code). Call promote_mappings once at the end. Report each address, its encoding and what the proof showed.
```

## Task 4

```
Mapping sheet 3 (the RAM a hacker reaches for), Super Mario Bros., World 1-1: find the per-slot array that says whether each enemy slot is active, and the per-slot array that holds each enemy's state (walking, stomped, and so on). Each is one byte per enemy slot. Prove each by writing the first Goomba's slot and looking (it disappears, or is drawn squashed). Record each with stride and count. Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again, and take a screenshot to confirm World 1-1 began. Holding Right for about four seconds from the start of 1-1 runs into the first enemy and loses a life. World 2-2 is under water. In 1-1 the first ? block gives a coin; in the row of bricks and ? blocks to its right, the left ? block gives a super mushroom that slides right, and touching it makes Mario big; big Mario can crouch by holding Down. Each play_input call is at most 600 frames; chain calls; save_state when a useful state is reached and load_state to retry. No reference is available. Use the find-variable skill. Prove each address as the task says, then record it with record_mapping: mapping_type address, a plain name, format, notes with the encoding and the proof, source 'differential search' (or 'disassembly' if you found it in code). Call promote_mappings once at the end. Report each address, its encoding and what the proof showed.
```

[eval-mapping-in] held back addresses.0x0760, routines.0xB74F (hold), addresses.0x0016 (hold), scenes.underground (names it), scenes.water (names it), scenes.castle (names it)
- balance after: $3.92 · ended: 2026-10-10T00:13:10-05:00
