# ADR-0013: A click never advances the emulator, and a pick knows which sprite it landed on

**Status:** Accepted (2026-10-05, from Logan's first click session after the overnight run). Supersedes the paused clause of ADR-0010 decision 3.
**Date:** 2026-10-05

## Context

ADR-0010 made `get_tile_at_pixel` and the picker capture one frame of
$2000/$2005/$2006 writes per lookup. While paused no frame runs, so the
bridge stepped two frames to fill the capture. Logan's 2026-10-05 session
(`2c572b4f`) showed what that costs: each click on a paused game moved it,
the box the view drew no longer matched what he had clicked, and the model,
following the skill's "pause, then re-query", stepped the game further with
every `get_tile_at_pixel` and concluded "the scene is changing even though I
paused". Logan: "the step forward when clicking really messes up the picked
tile location."

Two more defects surfaced in the same session. The view drew its box at the
nametable tile's coordinates (`tile_x * 8`), which is only the screen
position when the scroll is zero; at scroll 173 the box landed a tile and a
half away from the click. And the picker was background-only: a click on
Mario's hat resolved to the sky tile under him, the context line said "a
sprite over the pixel, trust the color", and the model spent 50
`get_pixel_color` calls and a hand-decoded OAM dump to work out which sprite
it was.

Mesen's write callbacks are cheap enough to leave installed: Super Mario
Bros. writes the three scroll registers about ten times a frame, and the
callback only calls `emu.getState()` for those. OAM is 256 bytes through
`nesSpriteRam`; `emu.getState()` exposes `ppu.control.largeSprites`,
`spritePatternAddr` and `backgroundPatternAddr`; pattern bytes read through
`nesPpuDebug` go through the mapper, so CHR banking is honoured.

## Decision

1. **A standing scroll-write ring in `bridge.lua`.** One write callback on
   $2000-$3FFF is installed when the script loads and never removed. It
   records every $2000/$2005/$2006 write with the pre-write loopy state into
   the frame in progress; `endFrame` seals that list as the last completed
   frame. `capture_scroll_writes` with `frames: 1` (the only form the
   lookups use) answers from the sealed frame immediately, paused or
   running, with `stepped_frames: 0` and `source: "ring"`. Multi-frame
   captures keep the live two-phase hook and are refused while paused.
   **No lookup, pick or read-only tool may ever step the emulator.** Only
   `step_frame`, `reset_emulator`, `save_state`/`load_state` and the view's
   Step button advance frames, and each says so in its result.
   *Amended 2026-10-05 (ADR-0019):* `play_input` joins that list. It runs a
   bounded button script in real time, at most 600 frames per call, reports
   `frames_run`, and restores the pause it found.
2. **Picks and `get_tile_at_pixel` are sprite-aware.** A new bridge handler
   `get_sprites {x?, y?}` decodes OAM through the current sprite size and
   pattern table and, given a pixel, returns only the sprites whose box
   covers it, each hit-tested against its pattern bytes (`opaque`,
   `pixel_value`, `hit_tile`, the 8x8 screen `cell`). The lookup carries
   `sprites`, `sprite_hit` (the first opaque one in OAM order, which is the
   one the hardware shows), `chr_tile` (the nametable id resolved through
   the background pattern table, the number `read_tile` wants) and
   `screen_box` (the background tile's cell with the scroll applied). The
   model gets the same through a `list_sprites` tool.
3. **The context line names the sprite.** When a sprite draws the clicked
   pixel, the line says so (OAM index, position, size, CHR tile and half,
   sprite palette with its colors, flips, priority) and states that the
   click most likely means the sprite, with the background tile as what
   lies under it. When sprites cover the pixel but are transparent there,
   it says that too. The consistency check compares the rendered color with
   the sprite's palette in the first case and the background palette in the
   second.
4. **The view draws in screen space.** The solid box is the sprite's 8x8
   cell when a sprite draws the pixel, else the background tile's screen
   cell; a dashed outline shows the whole 8x16 sprite when there is one.

## Consequences

- Clicking a paused game leaves it on that frame. The skill's "pause, then
  click, then re-query" is now sound; the "stepped two frames" sentences
  come out of the skill, the tool description and the prompt.
- One write callback runs for the life of the script, with an
  `emu.getState()` call per scroll-register write. On SMB that is about ten
  calls per frame. If a game writes the scroll registers hundreds of times
  a frame (raster effects), the cap of 256 records per frame bounds the
  cost and the capture reports only the first 256.
- Picks cost one more bridge request (`get_sprites`, under 2 ms paused)
  and, when a sprite is hit, one `get_palette`.
- A click on a character stops costing the model dozens of pixel samples;
  "what did I click" on Mario is answered from the context line alone.
- `stepped_frames` stays in the result as a constant 0 so trio criteria
  and old readers keep working; `source` tells the two capture paths apart.

## Alternatives

- **Save state, step, capture, load state.** Hides the stepping instead of
  removing it, needs an exec callback for the load, and risks a visible
  frame change if the load does not restore the frame buffer. Rejected.
- **Capture on demand but only while running; refuse while paused.** The
  picker would then be wrong exactly when the person is being careful
  (paused before clicking). Rejected.
- **Hit-test sprites in TypeScript from `read_memory oam` and `read_tile`.**
  Four to six round trips per pick and wrong under CHR banking, because
  `read_tile` reads the CHR ROM array, not PPU address space. Rejected in
  favour of one Lua handler reading through `nesPpuDebug`.
- **Leave sprites to the model with a skill step.** That is what happened in
  session `2c572b4f`: 84 calls for one question. Rejected.

## Revisit triggers

- A game where the ring's 256-record cap is hit in normal play (the
  capture's `writes` length is 256): record only completed pairs, or keep
  the hook's own counter per register.
- Mesen's frame-end callback moving relative to the vblank writes, which
  would put a frame's top-of-frame scroll in the wrong sealed frame; the
  `smb-title-*` fixtures and `trio.sh click` catch it.
- A sprite-heavy game where more than eight sprites cover one pixel
  (overflow); then `sprite_hit` should follow the hardware's eight-per-line
  rule.
