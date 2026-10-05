# ADR-0010: Pixel lookups answer from the framebuffer and the scroll in effect at that scanline

**Status:** Accepted (2026-10-05, for the overnight run Logan authorized; it was Proposed the same day and is built right after roadmap item 8 because every click depends on it). The paused clause of decision 3 (step one frame to capture) is superseded by ADR-0013: the capture now answers from a standing ring and never steps.
**Date:** 2026-10-05

## Context

`get_tile_at_pixel` converts a screen pixel to a nametable tile using the
PPU scroll read from `emu.getState()` at request time. Games with a fixed
status bar and a scrolling playfield change the scroll mid-frame: Super
Mario Bros. zeroes it in NMI for the status bar and sets the playfield
scroll after the sprite-0 hit. A request serviced in vblank, or while
paused, therefore sees 0 and names a sky tile for a pixel on a pipe. Logan's
2026-10-05 click session hit this twice; the agent caught it only by
sampling the rendered frame with an ad-hoc Python crop. The pixel picker,
`identify-click`, `palette-swap` and every "what is this" question route
through this lookup, so it has to be right on the most common NES layout.

Mesen's Lua API exposes `emu.getPixel(x, y)` (rendered ARGB at a screen
position) and `emu.addMemoryCallback` (per-access hooks by address and
memory type) with `emu.getState()` reporting the current scanline. The
bridge protocol today is strictly one request, one response, answered
inside the next `endFrame`.

## Decision

1. **`get_pixel_color(x, y)`: the rendered color is ground truth.** Lua
   returns the ARGB from `emu.getPixel`; the server maps it to the nearest
   NES master-palette index using `nes-palette.ts` and reports both. Tools
   and skills compare any tile/palette claim against this before asserting
   it. The picker's context line includes it.
2. **Per-scanline scroll capture for the tile lookup.** `get_tile_at_pixel`
   gains a `precise: true` mode (default on): Lua installs write callbacks
   on $2000, $2005 and $2006 for exactly one frame, records
   `(scanline, register, value)`, removes the callbacks, reconstructs the
   coarse/fine scroll and nametable select in effect at the clicked pixel's
   scanline, and answers with that. Writes in vblank (scanline 241+) apply
   to the top of the next frame; a write at scanline N applies from N+1.
   The response reports `scroll_source: "scanline"` with the scanline it
   used, or `"vblank"` when no mid-frame write was seen.
3. **A two-phase request in the bridge protocol.** A handler may return
   `{ pending: true }`; the Lua loop keeps the request id and answers it from
   a later `endFrame` when the handler's completion fires. The TypeScript
   side already matches responses by id, so only the Lua dispatcher and the
   per-request timeout change. `docs/bridge.md` documents it in the same
   commit. While paused, the capture cannot complete (no frames run), so the
   tool steps one frame when paused and reports that it did.
4. **The picker is honest in the meantime.** Until (2) ships, the context
   line says the tile readout assumes no mid-frame scroll change, and the
   `identify-click` skill tells the model to verify against (1).

## Consequences

- Clicks on SMB-style layouts resolve to the right tile; the model stops
  spending a dozen steps proving the tool wrong.
- Three callbacks for one frame per lookup: negligible, and bounded by
  design (installed and removed inside the same request).
- `read_nametable` keeps nametable coordinates, not screen coordinates;
  the lookup is the only tool that maps screen to nametable, and it now
  says which scroll it used.
- The two-phase mechanism is reusable by `trace_writes` (ADR-0009), which
  has the same install-wait-collect shape.

## Alternatives

- **Read the scroll at a fixed scanline every frame and cache it.** Cheap,
  but picks one split point; games with two or more splits (status bar plus
  a parallax band) still break. Rejected in favor of capturing the actual
  writes.
- **Framebuffer only, no tile lookup.** Answers color, not tile id or
  palette index, which the editing tools need. Rejected as the sole path;
  kept as decision 1.
- **Ask the model to sample pixels itself with Bash.** That is what it did,
  at 85 seconds and a dozen steps. Rejected.

## Revisit triggers

- A game that changes scroll more often than once per scanline region
  (raster effects); then the capture needs the dot position too.
- Mesen exposes per-scanline scroll directly; then drop the callbacks.
