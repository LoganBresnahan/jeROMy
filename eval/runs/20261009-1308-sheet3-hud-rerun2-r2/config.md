# Config: 20261009-1308-sheet3-hud-rerun2-r2

- commit: `295c806`
- game: Super Mario Bros. (World) (sha1 `33d23c2f2cfa4c9efec87f7bc1321ce3ce6c89bd`)
- spec: `eval/spec/smb.json` v3 · lines: C1.coins,C1.timer,C1.score
- model: deepseek-flash · blind: true (JEROMY_BLIND=1) · holdout: false
- re-run of: `20261009-1144-sheet3-hud-rerun` (eval/failures.md entries for these lines apply)
- caps: $1.00 per run · min tool calls per task 15 · trio timeout 900 s
- balance before: $8.06
- started: 2026-10-09T13:08:53-05:00

## Task 1

```
Mapping sheet 3 (the RAM a hacker reaches for), scene World 1-1 of Super Mario Bros.: find the RAM addresses of three HUD values without any reference: the coin count, the level timer (TIME) and the player's score. Use the find-variable skill. Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again, and take a screenshot to confirm World 1-1 began. The HUD along the top shows MARIO with a six-digit score, a coin icon with a two-digit count, WORLD 1-1, and TIME counting down from 400 by one about every 0.4 seconds. Each play_input call is at most 600 frames; chain calls, and take a screenshot whenever you need to know where you are. In 1-1, holding Right for about two and a half seconds from the start brings Mario under the first ? block floating overhead; jumping (A) into it from below gives one coin and 200 points. Prove each address by write_memory and a screenshot in which the HUD shows the value you wrote (the HUD redraws a number when the game changes it, so make the game change it after your write if the display does not follow at once). Record each with record_mapping: mapping_type address, a plain name, notes with the encoding and the proof, length and format when the value spans several bytes, source 'differential search'. Call promote_mappings once at the end. Report each address, its encoding and what the proof screenshot showed.
```

[eval-mapping-in] held back addresses.0x07ED, addresses.0x07F8, addresses.0x07DE
- balance after: $8.02 · ended: 2026-10-09T13:12:07-05:00
