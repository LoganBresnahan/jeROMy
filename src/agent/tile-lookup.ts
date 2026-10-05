/**
 * Screen pixel → nametable tile, honest about scroll splits (ADR-0010),
 * plus the sprites drawn over that pixel (ADR-0013). Precise mode takes the
 * last completed frame of $2000/$2005/$2006 writes from the bridge's
 * standing ring, reconstructs the scroll in effect at the pixel's scanline,
 * and reads the tile and attribute bytes at the resulting address. Shared by
 * the get_tile_at_pixel tool and the emulator view's pixel picker, so both
 * answer the same way.
 */

import type { MesenAdapter } from "../bridge/mesen/index.js";
import type { ScrollCaptureResult, SpriteInfo, SpritesResult, TileAtPixelResult } from "../bridge/mesen/protocol.js";
import { reconstructScrollAt, tileAddressAt } from "./scroll-reconstruct.js";

export interface ScreenBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PreciseTileResult extends TileAtPixelResult {
  /** "scanline": a mid-frame write governs this pixel's line. "vblank": only the frame-top scroll. "legacy": the request-time PPU state (precise off or capture unavailable). */
  scroll_source: "scanline" | "vblank" | "legacy";
  /** The visible scanline whose write applies, or -1. */
  scroll_scanline: number;
  /** Always 0: a lookup never advances the emulator (ADR-0013). Kept so older readers of the result keep working. */
  stepped_frames: number;
  /** More than one completed scroll update above this scanline: raster effects; the answer is the last one. */
  scroll_ambiguous: boolean;
  /** Where the background tile under the pixel sits on screen (scroll applied), unlike tile_x/tile_y which are the screen's 8x8 grid cell. */
  screen_box: ScreenBox;
  /** tile_id resolved through the background pattern table: the index read_tile/write_tile want (SMB: nametable $24 is CHR $124). */
  chr_tile?: number;
  background_pattern_addr?: number;
  /** Sprites whose box covers the pixel, OAM order (lower index wins on hardware). */
  sprites?: SpriteInfo[];
  /** The first sprite that draws an opaque pixel here, if any: the click most likely means this. */
  sprite_hit?: SpriteInfo;
  /** Set when precise mode was requested but could not run. */
  note?: string;
}

export interface LookupOptions {
  /** Default true. False uses the request-time PPU scroll, which is wrong on split-scroll frames. */
  precise?: boolean;
  /** A capture already taken for this frame, so a pick that also selects a region asks the bridge once (ADR-0014). */
  capture?: ScrollCaptureResult;
}

/** The screen-space 8x8 cell of the background tile under (x, y) for a given top-of-frame scroll. Pure. */
export function backgroundCellAt(x: number, y: number, scrollX: number, scrollY: number): ScreenBox {
  return { x: x - ((x + scrollX) & 7), y: y - ((y + scrollY) & 7), width: 8, height: 8 };
}

async function spritesAt(adapter: MesenAdapter, x: number, y: number): Promise<Pick<PreciseTileResult, "sprites" | "sprite_hit" | "background_pattern_addr"> & { result?: SpritesResult }> {
  let result: SpritesResult;
  try {
    result = await adapter.getSprites({ x, y });
  } catch {
    // An older bridge.lua without the handler: the tile answer stands on its own.
    return {};
  }
  // With sprite rendering off (SMB blanks the PPU between scenes) OAM still
  // holds entries, but nothing of them is on screen: no hit.
  const hit = result.sprites_enabled ? result.sprites.find((s) => s.opaque) : undefined;
  return { result, sprites: result.sprites, ...(hit ? { sprite_hit: hit } : {}), background_pattern_addr: result.background_pattern_addr };
}

function withSprites<T extends TileAtPixelResult>(r: T, s: Awaited<ReturnType<typeof spritesAt>>): T & Pick<PreciseTileResult, "sprites" | "sprite_hit" | "background_pattern_addr" | "chr_tile"> {
  const { result, ...rest } = s;
  const chr = result ? { chr_tile: r.tile_id + (result.background_pattern_addr >= 0x1000 ? 256 : 0) } : {};
  return { ...r, ...rest, ...chr };
}

function legacy(r: TileAtPixelResult, x: number, y: number, note?: string): PreciseTileResult {
  return { ...r, scroll_source: "legacy", scroll_scanline: -1, stepped_frames: 0, scroll_ambiguous: false, screen_box: backgroundCellAt(x, y, r.scroll_x, r.scroll_y), ...(note ? { note } : {}) };
}

export async function lookupTileAtPixel(adapter: MesenAdapter, x: number, y: number, opts: LookupOptions = {}): Promise<PreciseTileResult> {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > 255 || y < 0 || y > 239) {
    throw new Error(`x must be 0-255 and y 0-239, got (${x}, ${y})`);
  }
  if (opts.precise === false) {
    const [r, s] = await Promise.all([adapter.getTileAtPixel(x, y), spritesAt(adapter, x, y)]);
    return withSprites(legacy(r, x, y), s);
  }

  let capture;
  try {
    capture = opts.capture ?? await adapter.captureScrollWrites(1);
  } catch (err) {
    // An older bridge.lua without the handler, or a refused pending request: answer, but say so.
    const message = err instanceof Error ? err.message : String(err);
    const [r, s] = await Promise.all([adapter.getTileAtPixel(x, y), spritesAt(adapter, x, y)]);
    return withSprites(legacy(r, x, y, `precise lookup unavailable (${message}); scroll is the request-time PPU state`), s);
  }

  const scroll = reconstructScrollAt(capture, y);
  const addr = tileAddressAt(x, y, scroll);
  const [tile, attr, s] = await Promise.all([
    adapter.readMemory(addr.nametable_addr, 1, "ppuDebug"),
    adapter.readMemory(addr.attribute_addr, 1, "ppuDebug"),
    spritesAt(adapter, x, y),
  ]);
  return withSprites({
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
    stepped_frames: 0,
    scroll_ambiguous: scroll.ambiguous,
    screen_box: backgroundCellAt(x, y, scroll.scroll_x, scroll.scroll_y),
  }, s);
}
