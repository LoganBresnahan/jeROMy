---
name: identify-click
description: Tell the user what they clicked in the emulator view (which object, which tile, which palette and color) and verify the tool readout against the rendered pixels before trusting it. Use whenever a context line beginning "[emulator view] The user clicked pixel" arrives, or the user says "what is this" about something on screen.
whenToUse: A "[emulator view] The user clicked pixel (x, y)" context line is present, or the user asks what something at a screen position is.
user-invocable: true
---

# Identify a click

The picker hands you tile and palette for a screen pixel, computed from the
nametable and the PPU scroll. On games with a fixed status bar and a
scrolling playfield (Super Mario Bros. is one) the scroll the tool reads is
the status bar's, so the readout can name a sky tile when the user clicked a
pipe. The rendered frame is ground truth; the readout is a hypothesis.
Procedure from Logan's click session, 2026-10-05 (draft: step 3 relies on a
pixel-color tool that is still a carry-in in docs/issues.md).

## Steps

1. **Freeze the frame first.** `pause_emulator`, then `screenshot`. Nothing
   you measure is comparable if the game moves between calls.
2. **Re-query at the same pixel.** `get_tile_at_pixel` with the clicked `x`,
   `y`. Note `scroll_x`/`scroll_y`: a zero scroll during gameplay on a
   side-scroller is the warning sign that the readout is off.
3. **Check the readout against the pixels.** Look at the screenshot around
   (x, y). Read the palette the tool named with `get_palette`, and
   `get_all_palettes` once. If the colors at the click do not belong to the
   named palette's four entries, the readout is wrong; find the palette whose
   ramp matches what you see (SMB: `$22 $29 $1A $0F` is sky / light green /
   dark green / black, the pipe-bush-hill ramp). When `get_pixel_color`
   exists, use it; until then say which palette the visible colors imply and
   how confident you are.
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
