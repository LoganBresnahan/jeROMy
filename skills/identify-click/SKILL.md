---
name: identify-click
description: Tell the user what they clicked in the emulator view (which object, which tile, which palette and color) and verify the tool readout against the rendered pixels before trusting it. Use whenever a context line beginning "[emulator view] The user clicked pixel" arrives, or the user says "what is this" about something on screen.
whenToUse: A "[emulator view] The user clicked pixel (x, y)" context line is present, or the user asks what something at a screen position is.
user-invocable: true
---

# Identify a click

The picker hands you the background tile and palette for a screen pixel,
computed from the nametable and the scroll in effect at that pixel's
scanline (the picker and `get_tile_at_pixel` read the last completed frame's
PPU scroll writes to get it, ADR-0010/ADR-0013), and, when a sprite draws
that pixel, the sprite itself (OAM index, CHR tile, sprite palette). Neither
the picker nor the lookup ever advances the emulator; a click pauses a
running game on that frame (ADR-0015), and the line's last sentence says
whether it is still paused. Several click lines may arrive with one
prompt: the user ticked them in the view's history; answer each, newest
last. The rendered color is still the ground
truth: a `legacy` readout can disagree with the tile.
Procedure from Logan's click sessions, 2026-10-05; `get_pixel_color` added
the same night (ADR-0010), sprite awareness and `list_sprites` the next day
(ADR-0013) after a click on Mario's hat cost 84 calls to identify.

## Steps

1. **Freeze the frame first.** If the click line says the emulator is
   paused on that frame, it already is; otherwise `pause_emulator`. Then
   `screenshot`. Nothing you measure is comparable if the game moves
   between calls.
2. **Read the selected region first (ADR-0014).** The line usually ends
   with "Selected region (color mode): N pixels of slot S of <palette>
   across <tiles/OAM> ...". That is what the user pointed at, down to a
   button on Mario's overalls, with its blast radius already computed: how
   many other pixels in view share the slot (a palette edit recolors them
   too) and whether the palette has a free slot (whether a tile edit could
   give the region its own color). Quote both facts when the user asks
   "can I change just this". `get_region` with `mode: "object"` gives the
   whole character or object; `truncated: true` means it continues past the
   64x64 window.
3. **If the context line names a sprite, that is the answer.** "A sprite
   is drawn at this pixel: OAM #n ... CHR tile 0x.., sprite palette p"
   means the user pointed at a character or object, not the background.
   `list_sprites` (no arguments) shows the whole OAM so you can name the
   object from its neighbours (SMB small Mario is two 8x16 sprites side by
   side; the hat is the top half of each). Read the sprite's tiles with
   `read_tile` on `chr_tile`/`hit_tile`, never on the raw OAM tile byte.
   Skip step 4's palette check: the line already compared the color with
   the sprite palette.
4. **Re-query only what the line could not settle.** A line that says "the
   readout is consistent" and ends "paused on this frame" is already
   verified: use its tile, palette, color and region as facts and spend
   no calls on it (session `d8b747b1` spent 11 `get_pixel_color` and 4
   `get_tile_at_pixel` calls confirming four lines that were all
   consistent). Re-query when the line says NOT consistent, `legacy`, or
   that rendering was off: `get_tile_at_pixel` with the clicked `x`, `y`.
   Read `scroll_source`: `scanline` means the scroll
   written at `scroll_scanline` governs this pixel (a fixed status bar above
   a scrolling playfield looks exactly like this); `vblank` means no
   mid-frame change; `legacy` means the capture could not run and the
   scroll is the request-time PPU state, so treat the tile as unverified.
   `scroll_ambiguous: true` means more than one scroll update landed above
   the pixel's line (raster effects); the answer uses the last one. Use
   `chr_tile` (not `tile_id`) with `read_tile`: SMB's background pattern
   table is `$1000`, so nametable `$24` is CHR `$124`.
   Then check the readout against the pixels: `get_pixel_color` at the
   clicked (x, y) and at one or two neighbors: its `nes_color` must be one
   of the named palette's four entries or the backdrop, else the readout is
   wrong. `get_all_palettes` once and find the palette whose entries contain
   the sampled colors (SMB: `$22 $29 $1A $0F` is periwinkle / lime green /
   green / black, the pipe-bush-hill ramp). Name hues from the prompt's
   master-palette table, never from the index alone.
5. **Name the object.** Describe it as a thing in the game (pipe rim, cloud,
   brick platform), then its tile position and palette. `read_nametable`
   around the position shows the neighboring tile ids, which tells you the
   object's extent.
6. **Say so when the tool was wrong.** Report both the readout and what the
   frame shows, and why they differ. Do not pass a wrong tile id along as
   fact.
7. **Record what you learned.** `record_mapping` for a palette's role
   (`mapping_type: "palette"`, `name` like `pipe_bush_hill_green`) or a tile's
   identity, with `confidence: 1` only when you saw it on screen. Offer to
   map the object's tiles so future clicks resolve by tile id.
8. **Resume.** `resume_emulator`, and say that you did.

## Traps seen

- Zero scroll on a scrolling level: the lookup used the status-bar scroll.
- Two different frames: comparing a readout taken running with a screenshot taken later.
- Naming hue from a palette index number. Compare colors, read the table.
- Hand-decoding OAM from `read_memory` and sampling 50 pixels to find
  Mario (session `2c572b4f`): `list_sprites` does it in one call, and the
  context line already names the sprite under the click.
- `read_tile 36` after a click on sky showed a sloped shape: that was
  sprite-table `$24`; the background tile was CHR `$124`. Use `chr_tile`.

## Report shape

Clicked (x, y): <object>. Tile <id> at (tx, ty) per readout, palette <n> [<colors>]; frame shows <palette m, color $..>. Readout <agrees | disagrees because ...>. Recorded: <entries>. Emulator resumed.
