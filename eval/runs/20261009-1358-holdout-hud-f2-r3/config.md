# Config: 20261009-1358-holdout-hud-f2-r3

- commit: `ebdde61`
- game: Legend of Zelda, The (USA) (sha1 `799459548f9636dd263200da494f04058f5540e2`)
- spec: `eval/spec/zelda.json` v1 · lines: C1.rupees,C1.bombs,C1.keys,C1.hearts
- model: deepseek-flash · blind: true (JEROMY_BLIND=1) · holdout: true
- re-run of: `20261009-1209-holdout-sheet3` (eval/failures.md entries for these lines apply)
- caps: $1.00 per run · min tool calls per task 15 · trio timeout 900 s
- balance before: $7.65
- started: 2026-10-09T13:58:15-05:00

## Task 1

```
Mapping sheet 3 (the RAM a hacker reaches for), scene the first overworld screen of The Legend of Zelda: find the RAM addresses of the rupee count, the bomb count, the key count and Link's hearts (containers and how full they are), without any reference. Use the find-variable skill and your own judgement for values that do not change by playing. Facts about this game you may rely on: it starts on its title screen (a story scroll plays if you wait). Start on the title opens the file-select screen. To begin a new game there: press Select until the cursor is on REGISTER YOUR NAME and press Start; on the name screen press A once to enter a letter, then press Select until the cursor is on END and press Start; back on file select, press Select until the cursor is on the new file and press Start. Link then stands on the first overworld screen. The HUD along the top shows a minimap, a rupee count (X0), a key count, a bomb count, the B and A item boxes and the LIFE hearts (three at the start). Walking off an edge of the screen scrolls to the next screen. Each play_input call is at most 600 frames; chain calls, and take a screenshot whenever you need to know where you are. Prove each address by write_memory and a screenshot in which the HUD shows the value you wrote. Record each with record_mapping: mapping_type address, a plain name, notes with the encoding and the proof, source 'differential search'. Call promote_mappings once at the end. Report each address, its encoding and what the proof screenshot showed.
```

[eval-mapping-in] no in-scope entries to hold back
- balance after: $7.52 · ended: 2026-10-09T14:13:27-05:00
