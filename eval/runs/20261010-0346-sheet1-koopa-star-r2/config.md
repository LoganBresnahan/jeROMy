# Config: 20261010-0346-sheet1-koopa-star-r2

- commit: `0544349`
- game: Super Mario Bros. (World) (sha1 `33d23c2f2cfa4c9efec87f7bc1321ce3ce6c89bd`)
- spec: `eval/spec/smb.json` v21 · lines: A4.koopa,A4.star
- model: deepseek-flash · blind: true (JEROMY_BLIND=1) · holdout: false
- re-run of: `20261010-0114-sheet1-koopa-flag-rerun-r3` (eval/failures.md entries for these lines apply)
- caps: $1.00 per run · min tool calls per task 8 · trio timeout 900 s
- balance before: $0.93
- started: 2026-10-10T03:46:26-05:00

## Task 1

```
Mapping sheet 1 (what the pictures are), Super Mario Bros., World 1-1: name two metasprites, the Koopa Troopa and the starman (the star power-up). For the Koopa: play to it (the play-to-reach skill), pause while it is on screen, and list_sprites on it (the proof), then record_mapping mapping_type sprite, id as given, a plain name, notes giving each OAM tile id with its x/y offset, flips and sprite palette. Id 'koopa'. For the starman: make one appear (for example by finding where the game keeps the emerging item's type and changing it before the item comes out), pause while it is on screen, and list_sprites on it (the proof), then record_mapping mapping_type sprite, id as given, a plain name, notes giving each OAM tile id with its x/y offset, flips and sprite palette. Id 'starman'. Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again. 1-1 has one Koopa Troopa; an earlier session found it at about level x 1650 (page 6), and it appears as the camera nears it; the mapping names Mario's position and the star timer, and a nonzero star timer makes Mario invincible, which makes the walk safe. The item a ? block gives is decided by the game when the block is hit and kept in RAM while it emerges; in 1-1 the left ? block of the brick row gives a mushroom. Each play_input call is at most 600 frames; chain calls; save_state when a useful state is reached and load_state to retry. pause_emulator before you inspect a frame so it holds still. No reference is available. Call promote_mappings once at the end.
```

[eval-mapping-in] held back addresses.0x0016 (hold)
- balance after: $0.78 · ended: 2026-10-10T03:56:23-05:00
