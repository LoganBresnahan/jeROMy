# Config: 20261010-0930-holdout-engine

- commit: `533a2c1`
- game: Legend of Zelda, The (USA) (sha1 `799459548f9636dd263200da494f04058f5540e2`)
- spec: `eval/spec/zelda.json` v2 · lines: C2.link_dir,C4.game_mode,C4.frame_counter,C4.pause,C4.joypad
- model: deepseek-flash · blind: true (JEROMY_BLIND=1) · holdout: true
- caps: $1.00 per run · min tool calls per task 8 · trio timeout 900 s
- balance before: $5.21
- started: 2026-10-10T09:30:44-05:00

## Task 1

```
Mapping sheet 3 (the RAM a hacker reaches for), The Legend of Zelda, first overworld screen: find the RAM byte of the direction Link faces, the game-mode byte (it changes when the item subscreen opens), and the frame counter. Prove the direction by writing it and a screenshot of Link facing the new way (or by watching it while turning with the D-pad); the game mode by watching it across opening and closing the subscreen; the frame counter by watching it go up by one each frame. Facts about this game you may rely on: first call load_state with file "Legend of Zelda, The (USA)_1.mss"; it puts Link on the first overworld screen of a new game (file A), and you can load it again whenever you need a clean start. Start opens the item subscreen and Start again closes it; Select pauses the game and Select again resumes. Link walks with the D-pad. Each play_input call is at most 600 frames; chain calls; take a screenshot whenever you need to know where you are. No reference is available. Use the find-variable skill. Record each address with record_mapping: mapping_type address, a plain name, format, notes with the encoding and the proof, source 'differential search'. Call promote_mappings once at the end.
```

## Task 2

```
Mapping sheet 3 (the RAM a hacker reaches for), The Legend of Zelda, first overworld screen: find the pause flag and the RAM byte that holds controller 1's buttons as the game reads them. Prove the pause flag by watching it across Select (pause) and Select (resume); the controller byte by watching it with play_input while holding different buttons. Facts about this game you may rely on: first call load_state with file "Legend of Zelda, The (USA)_1.mss"; it puts Link on the first overworld screen of a new game (file A), and you can load it again whenever you need a clean start. Start opens the item subscreen and Start again closes it; Select pauses the game and Select again resumes. Link walks with the D-pad. Each play_input call is at most 600 frames; chain calls; take a screenshot whenever you need to know where you are. No reference is available. Use the find-variable skill. Record each address with record_mapping: mapping_type address, a plain name, format, notes with the encoding and the proof, source 'differential search'. Call promote_mappings once at the end.
```

[eval-mapping-in] no in-scope entries to hold back
- balance after: $5.15 · ended: 2026-10-10T09:38:14-05:00
