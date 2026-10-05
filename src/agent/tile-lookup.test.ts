import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { lookupTileAtPixel } from "./tile-lookup.js";
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
    expect(r).toMatchObject({ tile_id: 0x62, palette_id: 0, nametable: 0, nametable_addr: 0x2000 + 22 * 32 + 28, scroll_x: 53, scroll_y: 0, scroll_source: "scanline", scroll_scanline: 31, stepped_frames: 2, scroll_ambiguous: false, tile_x: 22, tile_y: 22 });
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
