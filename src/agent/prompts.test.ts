import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "./prompts.js";

describe("buildSystemPrompt", () => {
  it("returns a non-empty base prompt with no context", () => {
    const prompt = buildSystemPrompt();
    expect(prompt.length).toBeGreaterThan(100);
    expect(prompt).toContain("jeROMy");
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

  it("includes game mapping when provided", () => {
    const prompt = buildSystemPrompt({
      mapping: {
        rom_sha1: "abc",
        rom_name: "Super Mario Bros",
        version: 1,
        contributors: [],
        description: "SMB mappings",
        tiles: {
          "0x24": { name: "empty/sky", category: "background" },
          "0x45": { name: "question-block", category: "interactive" },
        },
        palettes: { "0": { name: "sky/ground" } },
        sprites: {},
        addresses: {
          player_x: { address: "0x0086", mem_type: "cpu", description: "X position" },
        },
        notes: ["CHR ROM game"],
      },
    });
    expect(prompt).toContain("Game Mapping: Super Mario Bros");
    expect(prompt).toContain("empty/sky");
    expect(prompt).toContain("question-block");
    expect(prompt).toContain("sky/ground");
    expect(prompt).toContain("player_x");
    expect(prompt).toContain("CHR ROM game");
  });

  it("does not include mapping section when mapping is null", () => {
    const prompt = buildSystemPrompt({ mapping: null });
    expect(prompt).not.toContain("Game Mapping");
  });

  it("includes CHR editing guide in base prompt", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("CHR Tile Data");
    expect(prompt).toContain("bitplane");
    expect(prompt).toContain("Palette Sharing Warning");
  });

  it("includes record_mapping guidance in base prompt", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("Recording Discoveries");
    expect(prompt).toContain("record_mapping");
  });

  it("includes emulator control guidance in base prompt", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("Emulator Control");
    expect(prompt).toContain("pause_emulator");
    expect(prompt).toContain("step_frame");
    expect(prompt).toContain("resume_emulator");
  });

  it("shows PAUSED when emulatorPaused is true", () => {
    const prompt = buildSystemPrompt({ emulatorPaused: true });
    expect(prompt).toContain("Emulator State");
    expect(prompt).toContain("PAUSED");
    expect(prompt).not.toContain("RUNNING");
  });

  it("shows RUNNING when emulatorPaused is false", () => {
    const prompt = buildSystemPrompt({ emulatorPaused: false });
    expect(prompt).toContain("Emulator State");
    expect(prompt).toContain("RUNNING");
    expect(prompt).not.toContain("PAUSED");
  });

  it("omits emulator state when emulatorPaused is undefined", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).not.toContain("Emulator State");
  });

  it("includes self-evaluation guidance in base prompt", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("Critically evaluate visual results");
    expect(prompt).toContain("describe what you actually see in concrete terms");
    expect(prompt).toContain("do NOT claim success");
  });

  it("includes tile size warning in base prompt", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("Tile Size Reality");
    expect(prompt).toContain("multi-tile composition");
  });

  it("includes write_sprite guidance in base prompt", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("write_sprite");
    expect(prompt).toContain("Multi-tile composition");
  });

  it("includes sprite extraction workflow guidance in base prompt", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("extract_sprite");
    expect(prompt).toContain("find_unused_tiles");
    expect(prompt).toContain("Sprite Extraction Workflow");
  });

  it("includes CHR RAM info when romInfo has usesChrRam=true", () => {
    const prompt = buildSystemPrompt({
      romInfo: {
        name: "Test",
        path: "/test",
        sha1: "abc",
        format: "iNES",
        usesChrRam: true,
      },
    });
    expect(prompt).toContain("CHR RAM");
    expect(prompt).toContain('chrRam');
  });

  it("includes CHR ROM info when romInfo has usesChrRam=false", () => {
    const prompt = buildSystemPrompt({
      romInfo: {
        name: "Test",
        path: "/test",
        sha1: "abc",
        format: "iNES",
        usesChrRam: false,
        chrRomSize: 8,
        mapper: 0,
      },
    });
    expect(prompt).toContain("CHR ROM (8KB)");
    expect(prompt).toContain("Mapper: 0");
    expect(prompt).toContain('chrRom');
  });

  it("omits CHR info when romInfo lacks usesChrRam field", () => {
    const prompt = buildSystemPrompt({
      romInfo: {
        name: "SNES Game",
        path: "/test",
        sha1: "xyz",
        format: "SFC",
      },
    });
    expect(prompt).not.toContain("CHR Type");
    expect(prompt).not.toContain("Mapper:");
  });
});
