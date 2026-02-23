import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "./prompts.js";

describe("buildSystemPrompt", () => {
  it("returns a non-empty base prompt with no context", () => {
    const prompt = buildSystemPrompt();
    expect(prompt.length).toBeGreaterThan(100);
    expect(prompt).toContain("jeROMiah");
    expect(prompt).toContain("NES");
    expect(prompt).toContain("palette");
  });

  it("includes ROM info when provided", () => {
    const prompt = buildSystemPrompt({
      romInfo: {
        name: "Super Mario Bros",
        path: "/roms/smb.nes",
        sha1: "abc123",
        format: "iNES",
      },
    });
    expect(prompt).toContain("Super Mario Bros");
    expect(prompt).toContain("iNES");
    expect(prompt).toContain("abc123");
  });

  it("includes palette info when provided", () => {
    const prompt = buildSystemPrompt({
      palettes: {
        palettes: [
          { palette_id: 0, type: "background" as const, colors: [0x0f, 0x00, 0x10, 0x30] },
          { palette_id: 4, type: "sprite" as const, colors: [0x0f, 0x16, 0x27, 0x28] },
        ],
      },
    });
    expect(prompt).toContain("Palette 0");
    expect(prompt).toContain("background");
    expect(prompt).toContain("Palette 4");
    expect(prompt).toContain("sprite");
  });

  it("includes both ROM and palette info together", () => {
    const prompt = buildSystemPrompt({
      romInfo: {
        name: "TestROM",
        path: "/test",
        sha1: "xyz",
        format: "NES2",
      },
      palettes: {
        palettes: [
          { palette_id: 0, type: "background" as const, colors: [0, 1, 2, 3] },
        ],
      },
    });
    expect(prompt).toContain("TestROM");
    expect(prompt).toContain("Palette 0");
  });
});
