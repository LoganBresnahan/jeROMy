# Grades: 20261010-0153-sheet5-vram-split

Reference: smbdis (doppelganger), ca65 port by threecreepio. Spec: Super Mario Bros. (World) v18. One row per claim (eval/README.md); `final` is the reference verdict held to the proof step.

| line | claim | at | evidence (proof) | reference | final | grader | image |
|---|---|---|---|---|---|---|---|
| E3.vram_writer | WriteVRAMBuffer - NMI routine that copies the queued VRAM buffer to the PPU — The per-frame routine that drains the game's queued PPU writes (nametable/attribute/palette) during NMI. Code span $8E92 | $8E92-$8EEC | disassemble, derived by diff, promoted | agrees (expected UpdateScreen $8EDD+3 \| WriteBufferToScreen $8E92+23; here: WriteBufferToScreen) | agrees | reference |  |
| E3.scroll_split | Status-bar scroll split (sprite-0 timed, scanline 31) — How SMB keeps the top status bar still while World 1-1 scrolls.  SCANLINE: the split is at scanline 31. Screen scanlines | scroll split | look, promoted | needs-judge | confirmed | claude | task-2/f034309d5e2c.png: before (9d2d3ee7792a.png) and after (this one) scrolling, the HUD rows are identical while the level below moved; the note's mechanism matches the code: the wait loop at $8150 (the reference's Sprite0Hit) polls $2002 bit 6, sprite 0 is the hidden HUD coin sprite $FF at (88,25) whose pixels sit on scanlines 30-31, then $2005 gets $073F/$0740 and $2000 switches nametable: the split at scanline 31 |
