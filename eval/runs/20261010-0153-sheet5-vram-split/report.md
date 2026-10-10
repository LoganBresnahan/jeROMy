# Report: 20261010-0153-sheet5-vram-split

Sheet 5's last two lines on SMB: the routine that copies queued writes to
the PPU during the NMI, and how the status bar stays still while the level
scrolls. Two blind tasks; web tools off (no `web_` call). deepseek-flash,
$0.08, 73 tool calls, about 6 minutes. Held back: the writer's routine entry
(an earlier side discovery), and as holds the NMI and palette routines, the
VRAM selector and the notes that named the writer or the split.

## Distribution

| Stage | Count |
|---|---|
| lines in scope | 2 |
| recorded / reached proof | 2 / 2 |
| graded right | 2 (one reference, one Claude) |
| graded wrong | 0 |
| promoted | 2 |
| cost (USD), tool calls, wall time | 0.08, 73, 355 s |

- **E3.vram_writer:** `$8E92-$8EEC`, found by `trace_writes` on `$2007`
  and disassembly (derived); the reference agrees (the range holds
  WriteBufferToScreen `$8E92` and the entry UpdateScreen `$8EDD`, both of
  the line's labels).
- **E3.scroll_split** (a note, judged): sprite-0 timed at scanline 31. The
  NMI polls `$2002` bit 6 at `$8150` (the reference's Sprite0Hit), sprite 0
  is the hidden HUD coin sprite `$FF` at (88,25) whose only pixels are on
  scanlines 30-31, then after a short delay it writes `$073F`/`$0740` to
  `$2005` and switches the nametable in `$2000`. The before and after
  screenshots (`task-2/9d2d3ee7792a.png`, `f034309d5e2c.png`) show the HUD
  identical while the level moved.

Spec v18: "Status-bar scroll split" tied the HUD layout line; the HUD line
excludes split and scroll.

Sheet 5 is complete: 12 of 12.
