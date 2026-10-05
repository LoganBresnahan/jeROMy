# ADR-0014: The picker selects regions by palette slot, and every selection names its two edit paths

**Status:** Accepted (2026-10-05, Logan's call in the click session that followed ADR-0013; this is the "region select and label" item from the roadmap's Later list)
**Date:** 2026-10-05

## Context

After ADR-0013 a click on Mario's hat names the right sprite and outlines
its 8x8 cell. Logan's reaction: the box "encompasses part of the sky",
because the hat fills only part of the tile and the rest is transparent.
He then asked for a selector that wraps the "object", possibly across
tiles, and one that wraps something smaller than a tile, such as the
button on Mario's overalls, "surrounded by red overalls but the user might
want just the button color".

What a person sees (a hat, a button, a pipe) does not exist in the
hardware. The NES stores 8x8 tiles of 2-bit values; a tile's values pick
slots from one four-color palette at draw time; sprites take value 0 as
transparent and background tiles render slot 0 as the shared backdrop;
objects are compositions the game's code assembles. There are therefore
exactly two ways to change what a pixel looks like: change the palette
slot it uses (every pixel of every tile drawn with that slot and palette
changes with it), or change the tile's value at that pixel (every place
that tile is drawn changes, and the target slot must already hold the
wanted color). Mario's button is value 2 of sprite palette 4, the same
slot as his face; palette 4 has no unused slot. "Only the button, a new
color" is not available on this console, and a selector that cannot say so
sends the model into an impossible edit.

The bridge already has everything a faithful selection needs: OAM with
pattern bytes through PPU address space (`get_sprites`, ADR-0013), the
nametable and attribute bytes, and the per-scanline scroll from the
standing ring (ADR-0013). The view has an overlay canvas and a context
line that reaches the model as a logged event (ADR-0003, ADR-0004).

## Decision

1. **Four selection modes, in the view and as a tool.** `pixel` (what is
   here), `tile` (the 8x8 cell, today's box), `color` (the connected run of
   pixels with the same layer, palette and slot), `object` (the connected
   run of opaque pixels with the same layer and palette). Connectivity is
   4-neighbour. For sprites, value 0 is transparent and never part of a
   region; for the background, slot 0 is the backdrop and is treated as
   empty in `object` mode but selectable in `color` mode (it is a real slot
   a person may want to recolor). The view's default mode is `color`, with
   the enclosing tile cell always drawn dashed so the editing unit stays
   visible. The model gets the same through a `get_region {x, y, mode}`
   tool.
2. **Regions are computed from a PPU-faithful pixel map, never from
   rendered colors.** A new bridge handler `read_region` renders a window of
   at most 64x64 screen pixels around the point into per-pixel `layer`
   (none, background, sprite), `palette`, `slot`, `tile` (pattern-space
   index) and `oam` (sprite index or -1), using OAM order and the
   behind-background flag for sprites and, for the background, the
   per-row scroll that the TypeScript side supplies from the ring
   reconstruction. The flood fill runs in TypeScript on that map. Two
   different slots that render the same color are different regions; the
   same slot drawn with two palettes is two regions. The slot is what can
   be edited, so the slot is what is selected.
3. **Every region answer names both edit paths and their blast radius.**
   The result carries the region's palette and slot, its bounding box and
   pixel count, the tiles it touches (pattern-space indices, and the OAM
   entries or nametable addresses that draw them), how many pixels outside
   the region but inside the window use the same palette and slot (and
   through which tiles), and whether the palette has a slot no pixel in the
   window uses. The context line states, in words, what a palette edit
   would also recolor and whether a tile edit has a free slot to move to.
   `truncated: true` says the fill reached the window's edge and the object
   continues beyond it.
4. **The view shows the region, not a box.** The overlay tints the region's
   pixels translucent blue with a 1 px outline, draws the enclosing tile
   cell dashed, and persists until the next click (no timer). The toolbar
   gets the four modes as toggles; the chosen mode is sent with the pick
   and named in the context line.

## Consequences

- A click on the hat lights up the hat; a click on the button lights up
  the button and the context line says "slot 2 of sprite palette 4, shared
  with 31 other pixels of this sprite (face, hands); palette 4 has no free
  slot, so only a palette edit is possible and it recolors the face too".
  The model can answer "can I change just this" without a single tool call.
- One more bridge request per click, bounded: 4096 pixels with per-tile
  caching of nametable, attribute and pattern reads, well inside the
  codeBreak budget while paused; the response is about 60 KB on the wire,
  which the line-mode receive handles but which rules out a larger window
  without a binary channel (ADR-0007).
- Regions larger than the window (the ground, the sky) come back
  truncated. That is accepted: such regions are palette edits in practice,
  and the slot sharing count already tells the story.
- The `identify-click` and `palette-swap` skills gain the region vocabulary;
  the picker's context line grows by one sentence.
- The sprite-overflow rule (eight per scanline) is not modelled; a window
  over a crowded row may show a sprite the PPU dropped.

## Alternatives

- **Flood fill on rendered colors in the browser.** What Logan first
  described, and zero bridge cost. Rejected: the sky and a sprite's
  transparent pixels share a color, two slots can hold the same color, and
  the result would not know which slot to edit.
- **Tile-only selection with a better outline.** Rejected: the button.
- **Object detection by mapping metadata only.** Needs a labelled mapping
  first; the point of selection is to produce those labels. Rejected as the
  only path; `object` mode will prefer a mapping group when one exists
  (carry-in).
- **Compute the fill in Lua.** Keeps the response small, but puts the
  scroll reconstruction (TypeScript, tested against fixtures) on the Lua
  side as well. Rejected; the map is the contract.

## Revisit triggers

- A real click where the 64x64 window truncates something a person would
  call one object and the slot-sharing count is not enough; then raise the
  cap behind ADR-0007's binary channel.
- A game with mid-frame palette writes; then the map needs the palette per
  scanline, as the scroll already is.
- Users asking for a lasso or rectangle drag; then selection becomes a
  gesture, and the modes here become the snap rules for it.
