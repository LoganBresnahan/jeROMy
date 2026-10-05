import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { backgroundCellAt, lookupTileAtPixel } from "./tile-lookup.js";
import type { ScrollCapture } from "./scroll-reconstruct.js";

// Paused SMB title fixture (Claude, 2026-10-05, Mesen2 2.1.1): last stepped
// frame has playfield X 53 from scanline 32 down.
const paused = JSON.parse(readFileSync(new URL("./fixtures/smb-title-paused.json", import.meta.url), "utf8")) as ScrollCapture;

function adapterWith(overrides: Record<string, unknown> = {}) {
  const mem = new Map<number, number>();
  return {
    getTileAtPixel: vi.fn().mockResolvedValue({ tile_id: 0x24, palette_id: 2, tile_x: 22, tile_y: 22, scroll_x: 0, scroll_y: 0, nametable: 0, nametable_addr: 0x22d6, attribute_addr: 0x23f5 }),
    captureScrollWrites: vi.fn().mockResolvedValue(paused),
    readMemory: vi.fn().mockImplementation(async (addr: number) => ({ address: addr, mem_type: "ppuDebug", bytes: [mem.get(addr) ?? 0] })),
    getSprites: vi.fn().mockResolvedValue({ large_sprites: true, sprite_pattern_addr: 0, background_pattern_addr: 0x1000, sprites_enabled: true, count: 0, sprites: [] }),
    mem,
    ...overrides,
  } as any;
}

describe("lookupTileAtPixel (ADR-0010)", () => {
  it("resolves Logan's pipe click with the scanline scroll, not the status-bar zero", async () => {
    const a = adapterWith();
    // Tile 28 of row 22 in nametable 0 holds a pipe tile; attribute cell gives palette 0 in that quadrant.
    a.mem.set(0x2000 + 22 * 32 + 28, 0x62);
    a.mem.set(0x2000 + 0x3c0 + 5 * 8 + 7, 0b00_00_00_00);
    const r = await lookupTileAtPixel(a, 176, 182);
    expect(a.captureScrollWrites).toHaveBeenCalledWith(1);
    expect(a.getTileAtPixel).not.toHaveBeenCalled();
    expect(r).toMatchObject({ tile_id: 0x62, palette_id: 0, nametable: 0, nametable_addr: 0x2000 + 22 * 32 + 28, scroll_x: 53, scroll_y: 0, scroll_source: "scanline", scroll_scanline: 31, stepped_frames: 0, scroll_ambiguous: false, tile_x: 22, tile_y: 22 });
    // ADR-0013: screen cell of that tile (176+53 = 229, 229 & 7 = 5 → left edge 171) and the pattern-space index.
    expect(r.screen_box).toEqual({ x: 171, y: 176, width: 8, height: 8 });
    expect(r.chr_tile).toBe(0x162);
    expect(r.sprites).toEqual([]);
    expect(r.sprite_hit).toBeUndefined();
  });

  it("reports the sprite drawing the pixel, first opaque in OAM order, and survives a bridge without get_sprites (ADR-0013)", async () => {
    const behind = { index: 2, x: 170, y: 176, width: 8, height: 16, tile: 0x40, attr: 0, palette: 4, behind_background: false, flip_h: false, flip_v: false, chr_tile: 0x40, pixel_value: 0, opaque: false };
    const hit = { ...behind, index: 9, tile: 0x42, chr_tile: 0x42, pixel_value: 3, opaque: true, hit_tile: 0x43, cell: { x: 170, y: 176, width: 8, height: 8 } };
    const a = adapterWith({ getSprites: vi.fn().mockResolvedValue({ large_sprites: true, sprite_pattern_addr: 0, background_pattern_addr: 0x1000, sprites_enabled: true, count: 2, sprites: [behind, hit] }) });
    const r = await lookupTileAtPixel(a, 176, 182);
    expect(a.getSprites).toHaveBeenCalledWith({ x: 176, y: 182 });
    expect(r.sprites).toHaveLength(2);
    expect(r.sprite_hit?.index).toBe(9);

    const old = adapterWith({ getSprites: vi.fn().mockRejectedValue(new Error("Bridge error: unknown method: get_sprites")) });
    const r2 = await lookupTileAtPixel(old, 176, 182);
    expect(r2.sprites).toBeUndefined();
    expect(r2.chr_tile).toBeUndefined();
    expect(r2.tile_id).toBe(0);
  });

  it("ignores sprite hits while the PPU has sprites switched off (scene transition)", async () => {
    const hit = { index: 5, x: 170, y: 176, width: 8, height: 8, tile: 0x4a, attr: 0, palette: 4, behind_background: false, flip_h: false, flip_v: false, chr_tile: 0x4a, pixel_value: 1, opaque: true, hit_tile: 0x4a, cell: { x: 170, y: 176, width: 8, height: 8 } };
    const a = adapterWith({ getSprites: vi.fn().mockResolvedValue({ large_sprites: false, sprite_pattern_addr: 0, background_pattern_addr: 0x1000, sprites_enabled: false, count: 1, sprites: [hit] }) });
    const r = await lookupTileAtPixel(a, 176, 182);
    expect(r.sprites).toHaveLength(1);
    expect(r.sprite_hit).toBeUndefined();
  });

  it("backgroundCellAt applies the scroll to find the tile's screen cell", () => {
    expect(backgroundCellAt(0, 0, 0, 0)).toEqual({ x: 0, y: 0, width: 8, height: 8 });
    expect(backgroundCellAt(116, 190, 173, 0)).toEqual({ x: 115, y: 184, width: 8, height: 8 });
    expect(backgroundCellAt(5, 239, 7, 237)).toEqual({ x: 1, y: 235, width: 8, height: 8 });
  });

  it("extracts the palette from the right attribute quadrant", async () => {
    const a = adapterWith();
    // Row 22 (22%4=2 → bottom), tile 28 (28%4=0 → left): shift 4.
    a.mem.set(0x2000 + 0x3c0 + 5 * 8 + 7, 0b00_11_00_00);
    const r = await lookupTileAtPixel(a, 176, 182);
    expect(r.palette_id).toBe(3);
  });

  it("precise:false asks the bridge for the request-time answer and labels it legacy", async () => {
    const a = adapterWith();
    const r = await lookupTileAtPixel(a, 176, 182, { precise: false });
    expect(a.captureScrollWrites).not.toHaveBeenCalled();
    expect(r).toMatchObject({ tile_id: 0x24, scroll_source: "legacy", scroll_scanline: -1 });
  });

  it("falls back to the legacy answer with a note when the capture is refused", async () => {
    const a = adapterWith({ captureScrollWrites: vi.fn().mockRejectedValue(new Error("Bridge error: unknown method: capture_scroll_writes")) });
    const r = await lookupTileAtPixel(a, 10, 10);
    expect(r.scroll_source).toBe("legacy");
    expect(r.note).toContain("unknown method");
  });

  it("rejects out-of-range coordinates before touching the bridge", async () => {
    const a = adapterWith();
    await expect(lookupTileAtPixel(a, 256, 0)).rejects.toThrow(/0-255/);
    expect(a.captureScrollWrites).not.toHaveBeenCalled();
  });
});
