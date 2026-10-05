import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { ReadRegionResult } from "../bridge/mesen/protocol.js";
import type { ScrollCapture } from "./scroll-reconstruct.js";
import { describeRegion, getRegionAt, regionFromMap, windowAround, windowRows } from "./region.js";

// A 16x16 window at (100, 170) holding a Mario-like 8x16 figure made of two
// 8x8 sprites (OAM #8 top, #9 bottom; CHR 0x43, 0x44) on sprite palette 4:
// slot 1 = hat/shirt, slot 2 = skin, slot 3 = overalls, with a 2x2 "button"
// of slot 2 inside the overalls. The rest is background palette 0 slot 0
// (sky, CHR 0x124) except a 3-wide pipe-rim column of slot 1 at the right
// edge of the window (CHR 0x160). Hand-built by Claude, 2026-10-05.
function mario(): ReadRegionResult {
  const w = 16, h = 16, x = 100, y = 170;
  const layer: number[] = [], palette: number[] = [], slot: number[] = [], tile: number[] = [], oam: number[] = [];
  const rows = [
    "...11111........", // hat
    "..11111111......",
    "..222222........", // face (skin)
    "..2.22.22.......",
    "...33333........", // shirt-ish: overalls colour starts (slot 3)
    "..3333333.......",
    "..3333333.......",
    "..33.3333.......",
    "..3333333.......", // overalls
    "..33223333......", // button: slot 2 at cols 4-5
    "..33223333......",
    "..3333333.......",
    "...333..3.......",
    "...333..3.......",
    "................",
    "................",
  ];
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const ch = rows[r][c];
      if (ch !== ".") {
        layer.push(2); palette.push(4); slot.push(Number(ch)); tile.push(r < 8 ? 0x43 : 0x44); oam.push(r < 8 ? 8 : 9);
      } else if (c >= 13) {
        layer.push(1); palette.push(0); slot.push(1); tile.push(0x160); oam.push(-1);
      } else {
        layer.push(1); palette.push(0); slot.push(0); tile.push(0x124); oam.push(-1);
      }
    }
  }
  return { x, y, w, h, large_sprites: false, background_pattern_addr: 0x1000, sprite_pattern_addr: 0, layer, palette, slot, tile, oam };
}

describe("regionFromMap (ADR-0014)", () => {
  it("color mode on the button selects only the button and names the shared slot's blast radius", () => {
    const r = regionFromMap(mario(), 104, 179, "color");
    expect(r).toMatchObject({ mode: "color", layer: "sprite", palette: 4, slot: 2, pixel_count: 4, truncated: false, tiles: [0x44], oam: [9] });
    expect(r.bbox).toEqual({ x: 104, y: 179, width: 2, height: 2 });
    expect(r.runs).toEqual([{ y: 179, x0: 104, x1: 105 }, { y: 180, x0: 104, x1: 105 }]);
    // The face is slot 2 too: 6 + 5 = 11 pixels through the top sprite.
    expect(r.sharing).toEqual({ pixels: 11, tiles: [0x43], oam: [8] });
    expect(r.free_slots).toEqual([]);
    expect(r.summary).toContain("4 pixels of slot 2 of sprite palette 4 across OAM #9 (CHR 0x44)");
    expect(r.summary).toContain("also recolors 11 other pixels in view that use it (OAM #8, CHR 0x43)");
    expect(r.summary).toContain("Sprite palette 4 has no free slot in view");
  });

  it("color mode on the hat selects the hat, not the sky around it", () => {
    const r = regionFromMap(mario(), 104, 170, "color");
    expect(r).toMatchObject({ slot: 1, pixel_count: 5 + 8, tiles: [0x43], oam: [8] });
    expect(r.bbox).toEqual({ x: 102, y: 170, width: 8, height: 2 });
    expect(r.sharing?.pixels).toBe(0);
    expect(r.summary).toContain("No other pixel in view uses that slot");
  });

  it("object mode selects all of Mario across both sprites and every slot", () => {
    const r = regionFromMap(mario(), 104, 179, "object");
    expect(r).toMatchObject({ mode: "object", layer: "sprite", palette: 4, slots: [1, 2, 3], tiles: [0x43, 0x44], oam: [8, 9] });
    expect(r.slot).toBeUndefined();
    expect(r.sharing).toBeUndefined();
    expect(r.pixel_count).toBe(mario().slot.filter((s, i) => mario().layer[i] === 2 && s !== 0).length);
    expect(r.summary).toContain("connected pixels of sprite palette 4 using slots 1, 2, 3 across OAM #8, #9");
  });

  it("background runs: the pipe rim is truncated at the window edge, the sky is the backdrop", () => {
    const rim = regionFromMap(mario(), 114, 175, "color");
    expect(rim).toMatchObject({ layer: "background", palette: 0, slot: 1, pixel_count: 48, truncated: true, tiles: [0x160], oam: [] });
    expect(rim.summary).toContain("continues beyond it");
    expect(rim.free_slots).toEqual([2, 3]);
    expect(rim.summary).toContain("Slots 2, 3 of background palette 0 are unused in view");
    const sky = regionFromMap(mario(), 100, 185, "object");
    expect(sky.slot).toBeUndefined();
    expect(sky.slots).toEqual([0]);
    expect(sky.summary).toContain("Slot 0 is the shared backdrop");
  });

  it("answers for a pixel with nothing drawn and rejects a point outside the window", () => {
    const m = mario();
    m.layer[0] = 0;
    expect(regionFromMap(m, 100, 170, "color")).toMatchObject({ layer: "none", pixel_count: 0 });
    expect(() => regionFromMap(m, 0, 0, "color")).toThrow(/outside the window/);
  });

  it("describeRegion is what the summary field holds", () => {
    const r = regionFromMap(mario(), 104, 179, "color");
    expect(describeRegion(r)).toBe(r.summary);
  });
});

describe("getRegionAt (ADR-0014)", () => {
  // Paused SMB title fixture (Claude, 2026-10-05, Mesen2 2.1.1): playfield X 53 from scanline 32 down.
  const paused = JSON.parse(readFileSync(new URL("./fixtures/smb-title-paused.json", import.meta.url), "utf8")) as ScrollCapture;

  it("windows the click, derives one scroll row per window line from the capture, and fills from the click", async () => {
    const readRegion = vi.fn().mockImplementation(async (p: { x: number; y: number; w: number; h: number }) => {
      const n = p.w * p.h;
      return { ...p, large_sprites: false, background_pattern_addr: 0x1000, sprite_pattern_addr: 0, layer: Array(n).fill(1), palette: Array(n).fill(0), slot: Array(n).fill(1), tile: Array(n).fill(0x162), oam: Array(n).fill(-1) };
    });
    const adapter = { captureScrollWrites: vi.fn().mockResolvedValue(paused), readRegion } as any;
    const r = await getRegionAt(adapter, 176, 182, "color");
    expect(adapter.captureScrollWrites).toHaveBeenCalledWith(1);
    const params = readRegion.mock.calls[0][0];
    expect(params).toMatchObject({ x: 144, y: 150, w: 64, h: 64 });
    expect(params.rows).toHaveLength(64);
    // Row 32 of the window is scanline 182: the playfield scroll (53) applies, as the tile lookup found (ADR-0010).
    expect(params.rows[32]).toEqual({ scroll_x: 53, nt_x: 0, v_y: 182, nt_y: 0 });
    expect(r).toMatchObject({ pixel_count: 64 * 64, truncated: true, tiles: [0x162] });
  });

  it("clamps the window to the screen and rejects bad coordinates", async () => {
    expect(windowAround(3, 2)).toEqual({ x: 0, y: 0, width: 64, height: 64 });
    expect(windowAround(255, 239)).toEqual({ x: 192, y: 176, width: 64, height: 64 });
    expect(windowAround(128, 120)).toEqual({ x: 96, y: 88, width: 64, height: 64 });
    expect(windowRows(paused, 0, 2)).toHaveLength(2);
    await expect(getRegionAt({} as any, 256, 0, "color")).rejects.toThrow(/0-255/);
  });
});
