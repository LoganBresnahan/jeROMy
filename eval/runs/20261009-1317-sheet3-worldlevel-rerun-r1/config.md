# Config: 20261009-1317-sheet3-worldlevel-rerun-r1

- commit: `4b24e40`
- game: Super Mario Bros. (World) (sha1 `33d23c2f2cfa4c9efec87f7bc1321ce3ce6c89bd`)
- spec: `eval/spec/smb.json` v3 · lines: C1.world,C1.level
- model: deepseek-flash · blind: true (JEROMY_BLIND=1) · holdout: false
- re-run of: `20261009-1135-sheet3-hud-position` (eval/failures.md entries for these lines apply)
- caps: $1.00 per run · min tool calls per task 10 · trio timeout 900 s
- balance before: $7.98
- started: 2026-10-09T13:17:20-05:00

## Task 1

```
Mapping sheet 3 (the RAM a hacker reaches for), scene World 1-1 of Super Mario Bros.: find the RAM addresses of the world number and the level number (shown as WORLD 1-1). No reference is available; use the find-variable skill and your own judgement for values that do not change by playing. Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again, and take a screenshot to confirm World 1-1 began. The HUD along the top shows MARIO with a six-digit score, a coin icon with a two-digit count, WORLD 1-1, and TIME counting down from 400 by one about every 0.4 seconds. Each play_input call is at most 600 frames; chain calls, and take a screenshot whenever you need to know where you are. Holding Right for about four seconds from the start of 1-1 runs into the first enemy and loses a life, and a black card 'WORLD 1-1' is shown about three seconds later. Prove world and level by write_memory and a screenshot of the HUD or the WORLD card showing your value. Record each with record_mapping: mapping_type address, a plain name, notes with the encoding and the proof, source 'differential search'. Call promote_mappings once at the end. Report each address, its encoding and what the proof screenshot showed.
```

[eval-mapping-in] held back addresses.0x075F, addresses.0x075C
- task 1: turn ended on an error ("code":"MALFORMED_RESPONSE"); resumed once with "continue"
- balance after: $7.98 · ended: 2026-10-09T13:18:11-05:00
