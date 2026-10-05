/**
 * Screen pixel → nametable tile, honest about scroll splits (ADR-0010).
 * Precise mode captures one frame of $2000/$2005/$2006 writes through the
 * bridge, reconstructs the scroll in effect at the pixel's scanline, and
 * reads the tile and attribute bytes at the resulting address. Shared by
 * the get_tile_at_pixel tool and the emulator view's pixel picker, so both
 * answer the same way.
 */

import type { MesenAdapter } from "../bridge/mesen/index.js";
import type { TileAtPixelResult } from "../bridge/mesen/protocol.js";
import { reconstructScrollAt, tileAddressAt } from "./scroll-reconstruct.js";

export interface PreciseTileResult extends TileAtPixelResult {
  /** "scanline": a mid-frame write governs this pixel's line. "vblank": only the frame-top scroll. "legacy": the request-time PPU state (precise off or capture unavailable). */
  scroll_source: "scanline" | "vblank" | "legacy";
  /** The visible scanline whose write applies, or -1. */
  scroll_scanline: number;
  /** Frames the bridge stepped to capture while paused (0 when running). */
  stepped_frames: number;
  /** More than one completed scroll update above this scanline: raster effects; the answer is the last one. */
  scroll_ambiguous: boolean;
  /** Set when precise mode was requested but could not run. */
  note?: string;
}

export interface LookupOptions {
  /** Default true. False uses the request-time PPU scroll, which is wrong on split-scroll frames. */
  precise?: boolean;
}

function legacy(r: TileAtPixelResult, note?: string): PreciseTileResult {
  return { ...r, scroll_source: "legacy", scroll_scanline: -1, stepped_frames: 0, scroll_ambiguous: false, ...(note ? { note } : {}) };
}

export async function lookupTileAtPixel(adapter: MesenAdapter, x: number, y: number, opts: LookupOptions = {}): Promise<PreciseTileResult> {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > 255 || y < 0 || y > 239) {
    throw new Error(`x must be 0-255 and y 0-239, got (${x}, ${y})`);
  }
  if (opts.precise === false) return legacy(await adapter.getTileAtPixel(x, y));

  let capture;
  try {
    capture = await adapter.captureScrollWrites(1);
  } catch (err) {
    // An older bridge.lua without the handler, or a refused pending request: answer, but say so.
    const message = err instanceof Error ? err.message : String(err);
    return legacy(await adapter.getTileAtPixel(x, y), `precise lookup unavailable (${message}); scroll is the request-time PPU state`);
  }

  const scroll = reconstructScrollAt(capture, y);
  const addr = tileAddressAt(x, y, scroll);
  const [tile, attr] = await Promise.all([
    adapter.readMemory(addr.nametable_addr, 1, "ppuDebug"),
    adapter.readMemory(addr.attribute_addr, 1, "ppuDebug"),
  ]);
  return {
    tile_id: tile.bytes[0],
    palette_id: (attr.bytes[0] >> addr.attribute_shift) & 0x03,
    tile_x: Math.floor(x / 8),
    tile_y: Math.floor(y / 8),
    scroll_x: scroll.scroll_x,
    scroll_y: scroll.scroll_y,
    nametable: addr.nametable,
    nametable_addr: addr.nametable_addr,
    attribute_addr: addr.attribute_addr,
    scroll_source: scroll.scroll_source,
    scroll_scanline: scroll.applied_scanline,
    stepped_frames: capture.stepped_frames,
    scroll_ambiguous: scroll.ambiguous,
  };
}
