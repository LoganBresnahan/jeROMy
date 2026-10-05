---
name: palette-swap
description: Recolor one on-screen object (ground, logo, pipe, an enemy) by changing one entry of one NES palette, without recoloring everything else that shares it. Use when the user asks to change the color of something they can see, or asks which palette something uses.
whenToUse: The user asks for a color change on something visible ("make the sky purple", "turn the bricks blue"), or wants to know what a palette entry controls.
user-invocable: true
---

# Palette swap

A palette entry is one of 32 colors (8 palettes x 4 slots). Many tiles share
a palette and a slot, so the trap is recoloring more than you meant to, and
the second trap is judging the result from a frame that had not repainted yet.
Verified procedure from the 2026-10-05 session on Super Mario Bros. (World).

## Steps

1. **Find the palette and slot.** If the user clicked in the emulator view,
   the context line already carries `tile_id`, `palette_id`, the four
   colors and, in color mode, the "Selected region" sentence with the slot
   and its blast radius (ADR-0014); use it and skip to step 4. Without a
   click, `get_region` at a pixel on the object answers the same way.
   Otherwise call `get_tile_at_pixel` with an `x` (0-255)
   and `y` (0-239) on the object. The answer's `palette_id` is the palette
   (it uses the scroll in effect at that scanline, `scroll_source`); you
   still need the slot. Before trusting it, `get_pixel_color` at the same
   point: the rendered `nes_color` must be one of that palette's four
   entries or the shared backdrop. If it is not, a sprite is drawn over the
   pixel or the readout is wrong; pick a pixel on the object's flat color
   and look again.
2. **Decide the slot.** `get_palette` with that `palette_id` returns
   `colors: [c0, c1, c2, c3]` as NES master-palette indices. Slot 0 of a
   background palette is the shared backdrop (changing it recolors the sky
   everywhere). For an 8x8 tile, `read_tile` shows which of slots 1-3 the
   object's pixels use. If the user named a color ("the orange part"), pick
   the slot whose master-palette index matches; do not guess hue from the
   index number.
3. **Check who else shares it.** The region sentence (or `get_region`)
   already counts the pixels in view that share the slot and names the
   tiles and OAM entries that draw them; when the user wants only part of
   an object recolored (the button, not the face) and the palette has no
   free slot, say that a palette edit cannot do it and a tile edit would
   need a slot taken from elsewhere. Then `get_all_palettes` once and look
   at the neighbors: `read_nametable` over the region around the object (tile ids
   and `palette_id` per cell) tells you which other tiles use the same
   palette. Say up front what else will change. On SMB 1-1, background
   palette 1 slot 1 (`$36`) is the title-logo box fill, not the ground
   bricks, which use slots 2-3 of the same palette.
4. **Take the before screenshot.** `screenshot`.
5. **Write.** `write_palette` with `palette_id`, `color_index` (the slot),
   `nes_color` (master-palette index, 0-63). The result carries `old_color`;
   keep it, you need it to undo. The write is an override the bridge
   re-applies every frame (`frozen: true`), so the game cannot paint over
   it.
6. **Force a repaint before judging.** If the emulator is running, the next
   frame already shows it. If it is paused (or you paused it to compare
   cleanly), `step_frame` with `count: 1` first; a paused Mesen does not
   repaint and returns no new screenshot.
7. **Take the after screenshot and compare.** Name exactly what changed. If
   the game was running between the two shots, scenery will have moved; do
   not attribute gameplay differences to the edit. For a clean comparison:
   `pause_emulator`, write, `step_frame` 1, screenshot, write the old color
   back, `step_frame` 1, screenshot. Two frames, one variable.
8. **Leave it the way the user wants.** To keep: nothing more, the
   override stays frozen for the session. To undo: `clear_palette_overrides`
   for that palette and slot, which unfreezes and writes the pre-override
   color back (`restore: false` only unfreezes). `resume_emulator` if you
   paused. To make it permanent, switch to the `persist-edit` skill.
9. **Record.** If you learned what a palette or slot controls, call
   `record_mapping` with `mapping_type: "palette"`, `id` the palette number,
   a `name` like `title_logo_box`, and `notes` naming the slot and the
   objects. `confidence: 1` only if you saw it change on screen; otherwise
   give the confidence you actually have. Offer `promote_mappings` when the
   user confirms.

## Traps seen

- Slot 0 of any background palette is the universal backdrop.
- Sprite palettes (4-7) use slot 0 as transparent; recoloring it does nothing visible.
- "It didn't change" after a write while paused is a missing `step_frame`, not a failed write.
- A master-palette index is not a hue you can name from memory: `$36` is
  peach, `$27` is orange, `$12` is bright blue, `$0F` is black. Name colors
  from the master-palette table in the prompt, and confirm with
  `get_pixel_color`; do not describe `$36` as "a duplicate of black".

## Report shape

Palette N slot S: `$old` → `$new`. Changed: <objects>. Also affected: <shared tiles or "none seen">. Screenshots: before / after. Recorded: <mapping entry or none>.
