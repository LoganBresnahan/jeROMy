---
name: identify-click
description: Tell the user what they clicked in the emulator view (which object, which tile, which palette and color) and verify the tool readout against the rendered pixels before trusting it. Use whenever a context line beginning "[emulator view] The user clicked pixel" arrives, or the user says "what is this" about something on screen.
whenToUse: A "[emulator view] The user clicked pixel (x, y)" context line is present, or the user asks what something at a screen position is.
user-invocable: true
---

# Identify a click

The picker hands you tile and palette for a screen pixel, computed from the
nametable and the scroll in effect at that pixel's scanline (the picker and
`get_tile_at_pixel` capture one frame of PPU scroll writes to get it, ADR-0010).
The rendered color is still the ground truth: a sprite drawn over the pixel,
or a `legacy` readout, can disagree with the tile.
Procedure from Logan's click session, 2026-10-05; `get_pixel_color` added
the same night (ADR-0010) and the picker's context line now ends with the
rendered color and whether it fits the named palette.

## Steps

1. **Freeze the frame first.** `pause_emulator`, then `screenshot`. Nothing
   you measure is comparable if the game moves between calls.
2. **Re-query at the same pixel.** `get_tile_at_pixel` with the clicked `x`,
   `y`. Read `scroll_source`: `scanline` means the scroll written at
   `scroll_scanline` governs this pixel (a fixed status bar above a scrolling
   playfield looks exactly like this); `vblank` means no mid-frame change;
   `legacy` means the capture could not run and the scroll is the
   request-time PPU state, so treat the tile as unverified. While paused the
   tool steps two frames to capture (`stepped_frames: 2`) and stays paused.
   `scroll_ambiguous: true` means more than one scroll update landed above
   the pixel's line (raster effects); the answer uses the last one.
3. **Check the readout against the pixels.** `get_pixel_color` at the
   clicked (x, y) and at one or two neighbors: its `nes_color` must be one
   of the named palette's four entries, else the readout is wrong. Then
   `get_all_palettes` once and find the palette whose entries contain the
   sampled colors (SMB: `$22 $29 $1A $0F` is periwinkle / lime green /
   green / black, the pipe-bush-hill ramp). Name hues from the prompt's
   master-palette table, never from the index alone.
4. **Name the object.** Describe it as a thing in the game (pipe rim, cloud,
   brick platform), then its tile position and palette. `read_nametable`
   around the position shows the neighboring tile ids, which tells you the
   object's extent.
5. **Say so when the tool was wrong.** Report both the readout and what the
   frame shows, and why they differ. Do not pass a wrong tile id along as
   fact.
6. **Record what you learned.** `record_mapping` for a palette's role
   (`mapping_type: "palette"`, `name` like `pipe_bush_hill_green`) or a tile's
   identity, with `confidence: 1` only when you saw it on screen. Offer to
   map the object's tiles so future clicks resolve by tile id.
7. **Resume.** `resume_emulator`, and say that you did.

## Traps seen

- Zero scroll on a scrolling level: the lookup used the status-bar scroll.
- Two different frames: comparing a readout taken running with a screenshot taken later.
- Naming hue from a palette index number. Compare colors, read the table.

## Report shape

Clicked (x, y): <object>. Tile <id> at (tx, ty) per readout, palette <n> [<colors>]; frame shows <palette m, color $..>. Readout <agrees | disagrees because ...>. Recorded: <entries>. Emulator resumed.
