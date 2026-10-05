import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadMapping,
  saveMapping,
  mergeMappings,
  formatMappingForPrompt,
  type DiscoveredEntry,
} from "./loader.js";
import type { GameMapping } from "./types.js";

function makeMapping(overrides?: Partial<GameMapping>): GameMapping {
  return {
    rom_sha1: "abc123",
    rom_name: "Test ROM",
    version: 1,
    contributors: ["tester"],
    description: "Test mapping",
    tiles: {
      "0x24": { name: "empty/sky", category: "background" },
      "0xB4": { name: "cloud-top-left", category: "background", group: "cloud" },
    },
    palettes: {
      "0": { name: "sky/ground", notes: "Shared palette" },
    },
    sprites: {
      "small-mario": { tiles: ["0x32", "0x33"], palette_id: 4, notes: "Standing" },
    },
    addresses: {
      player_x: { address: "0x0086", mem_type: "cpu", description: "X position" },
    },
    notes: ["Test note"],
    ...overrides,
  };
}

describe("loadMapping", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "jeromy-mappings-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null when no mapping file exists", () => {
    const result = loadMapping("nonexistent", tmpDir);
    expect(result).toBeNull();
  });

  it("loads a mapping file by SHA1", () => {
    const mapping = makeMapping();
    writeFileSync(
      join(tmpDir, "sha1-abc123.json"),
      JSON.stringify(mapping)
    );

    const result = loadMapping("abc123", tmpDir);
    expect(result).not.toBeNull();
    expect(result!.rom_name).toBe("Test ROM");
    expect(result!.tiles["0x24"].name).toBe("empty/sky");
  });
});

describe("saveMapping", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "jeromy-mappings-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes a mapping file to disk", () => {
    const mapping = makeMapping();
    saveMapping(mapping, tmpDir);

    const filePath = join(tmpDir, "sha1-abc123.json");
    expect(existsSync(filePath)).toBe(true);

    const loaded = loadMapping("abc123", tmpDir);
    expect(loaded!.rom_name).toBe("Test ROM");
  });
});

describe("mergeMappings", () => {
  it("creates a new mapping when none exists", () => {
    const discoveries: DiscoveredEntry[] = [
      { mapping_type: "tile", id: "0x45", name: "question-block", category: "interactive", confidence: 1 },
    ];

    const result = mergeMappings(null, discoveries, "sha1", "Test ROM");
    expect(result.rom_sha1).toBe("sha1");
    expect(result.tiles["0x45"].name).toBe("question-block");
    expect(result.tiles["0x45"].category).toBe("interactive");
  });

  it("merges discoveries into existing mapping without overwriting", () => {
    const existing = makeMapping();
    const discoveries: DiscoveredEntry[] = [
      // This should NOT overwrite the existing tile
      { mapping_type: "tile", id: "0x24", name: "different-name", confidence: 1 },
      // This SHOULD be added as new
      { mapping_type: "tile", id: "0x45", name: "question-block", category: "interactive", confidence: 1 },
      { mapping_type: "palette", id: "3", name: "castle", confidence: 1 },
      { mapping_type: "address", id: "0x0760", name: "level", confidence: 1 },
    ];

    const result = mergeMappings(existing, discoveries, existing.rom_sha1, existing.rom_name);
    // Existing tile should be preserved
    expect(result.tiles["0x24"].name).toBe("empty/sky");
    // New tile should be added
    expect(result.tiles["0x45"].name).toBe("question-block");
    // New palette added
    expect(result.palettes["3"].name).toBe("castle");
    // New address added
    expect(result.addresses["0x0760"].description).toBe("level");
    // Version should be bumped
    expect(result.version).toBe(2);
  });

  it("handles sprite discoveries", () => {
    const discoveries: DiscoveredEntry[] = [
      { mapping_type: "sprite", id: "goomba", name: "goomba", notes: "Walking frame", confidence: 1 },
    ];

    const result = mergeMappings(null, discoveries, "sha1", "Test");
    expect(result.sprites["goomba"]).toBeDefined();
    expect(result.sprites["goomba"].notes).toBe("Walking frame");
  });

  it("includes group and notes in tile discoveries", () => {
    const discoveries: DiscoveredEntry[] = [
      { mapping_type: "tile", id: "0xB5", name: "cloud-top-right", category: "background", group: "cloud", notes: "Paired with B4", confidence: 1 },
    ];

    const result = mergeMappings(null, discoveries, "sha1", "Test");
    expect(result.tiles["0xB5"].group).toBe("cloud");
    expect(result.tiles["0xB5"].notes).toBe("Paired with B4");
  });
});

describe("formatMappingForPrompt", () => {
  it("formats a mapping as readable text", () => {
    const mapping = makeMapping();
    const text = formatMappingForPrompt(mapping);

    expect(text).toContain("Game Mapping: Test ROM");
    expect(text).toContain("abc123");
    expect(text).toContain("Known Tiles");
    expect(text).toContain("empty/sky");
    expect(text).toContain("cloud-top-left");
    expect(text).toContain("[cloud]");
    expect(text).toContain("Known Palettes");
    expect(text).toContain("sky/ground");
    expect(text).toContain("Known Sprites");
    expect(text).toContain("small-mario");
    expect(text).toContain("Known Addresses");
    expect(text).toContain("player_x");
    expect(text).toContain("Notes");
    expect(text).toContain("Test note");
  });

  it("handles empty sections gracefully", () => {
    const mapping = makeMapping({
      tiles: {},
      palettes: {},
      sprites: {},
      addresses: {},
      notes: [],
    });
    const text = formatMappingForPrompt(mapping);

    expect(text).toContain("Game Mapping: Test ROM");
    expect(text).not.toContain("Known Tiles");
    expect(text).not.toContain("Known Palettes");
  });
});
