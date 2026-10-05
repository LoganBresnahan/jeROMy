import { describe, it, expect } from "vitest";
import {
  NES_COLOR_NAMES,
  NES_MASTER_PALETTE_RGB,
  formatNesPaletteGuide,
  nearestNesColor,
  nesColorName,
} from "./nes-palette.js";

// Expected names hand-checked by Claude on 2026-10-05 against SMB (World)
// screenshots: $22 sky, $29 and $1A pipe greens, $36 title-box peach,
// $16 Mario red, $27 ground orange (roadmap item 13).
describe("NES master palette names", () => {
  it("has one name per master-palette entry", () => {
    expect(NES_COLOR_NAMES).toHaveLength(64);
    expect(NES_COLOR_NAMES).toHaveLength(NES_MASTER_PALETTE_RGB.length);
    for (const n of NES_COLOR_NAMES) expect(n.length).toBeGreaterThan(2);
  });

  it("names the SMB colors the model slipped on", () => {
    expect(nesColorName(0x22)).toBe("periwinkle");
    expect(nesColorName(0x29)).toBe("lime green");
    expect(nesColorName(0x1a)).toBe("green");
    expect(nesColorName(0x36)).toBe("peach");
    expect(nesColorName(0x16)).toBe("red");
    expect(nesColorName(0x27)).toBe("orange");
    expect(nesColorName(0x0f)).toBe("black");
    expect(nesColorName(0x30)).toBe("white");
  });

  it("wraps indices to 6 bits like the PPU", () => {
    expect(nesColorName(0x4f)).toBe(nesColorName(0x0f));
  });

  it("formats four brightness rows with code-spanned indices", () => {
    const guide = formatNesPaletteGuide();
    const lines = guide.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatch(/^- \$00-\$0F \(dark\): `\$00` dark gray, `\$01` dark blue/);
    expect(guide).toContain("`$29` lime green");
    expect(guide).toContain("`$36` peach");
    expect(guide.match(/`\$[0-9A-F]{2}`/g)).toHaveLength(64);
  });

  it("maps rendered RGB back to the nearest index, preferring $0F for black", () => {
    expect(nearestNesColor([136, 216, 0])).toBe(0x29);
    expect(nearestNesColor([0, 0, 0])).toBe(0x0f);
    expect(nearestNesColor([255, 255, 255])).toBe(0x20);
    expect(nearestNesColor([154, 143, 255])).toBe(0x22);
  });
});
