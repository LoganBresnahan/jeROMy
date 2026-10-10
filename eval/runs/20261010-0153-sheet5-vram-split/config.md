# Config: 20261010-0153-sheet5-vram-split

- commit: `13dd10d`
- game: Super Mario Bros. (World) (sha1 `33d23c2f2cfa4c9efec87f7bc1321ce3ce6c89bd`)
- spec: `eval/spec/smb.json` v17 · lines: E3.vram_writer,E3.scroll_split
- model: deepseek-flash · blind: true (JEROMY_BLIND=1) · holdout: false
- caps: $1.00 per run · min tool calls per task 8 · trio timeout 900 s
- balance before: $2.59
- started: 2026-10-10T01:53:55-05:00

## Task 1

```
Mapping sheet 5 (the routines), Super Mario Bros., World 1-1: find the routine that copies queued writes into the PPU during the NMI (the code that writes $2006 and $2007 from a buffer). Prove it with trace_writes on $2007 (or $2006) to get the writing PC, then disassemble back to the routine's entry. Record it with record_mapping mapping_type routine, id the entry address, a plain name, notes saying what it does and how you found it, source 'trace and disassembly'. Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again. trace_writes runs frames, so resume_emulator before it if the game is paused. No reference is available. Call promote_mappings once at the end.
```

## Task 2

```
Mapping sheet 5 (the routines), Super Mario Bros., World 1-1: the status bar at the top stays still while the level below it scrolls. Find how the game does that: at which scanline the scroll changes, what the game waits for before changing it, and which code writes the new scroll. Prove it with trace_writes on $2005 (and on whatever the waiting code reads), disassemble of the code that waits and writes, and screenshots before and after scrolling. Record it with record_mapping mapping_type note, id 'scroll split', a plain name, notes giving the scanline, the method and the code addresses. Facts about this game you may rely on: it is on its title screen or attract demo; Start on the title begins a game, but Start during the attract demo only returns to the title, so press Start, wait a second, press Start again. trace_writes runs frames, so resume_emulator before it if the game is paused. No reference is available. Call promote_mappings once at the end.
```

[eval-mapping-in] held back routines.0x8EDD, addresses.0x0773 (hold), routines.0x8082 (hold), routines.0x85BF (hold), 1 note(s) (E3.vram_writer, /8edd|8e92/), 1 note(s) (E3.scroll_split, /scanline.?31|scroll split|sprite.?0|sprite.?zero/)
- balance after: $2.51 · ended: 2026-10-10T01:59:50-05:00
