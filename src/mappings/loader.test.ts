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
  it("keeps a discovery's source on the merged entry and never overwrites an existing one (ADR-0017)", () => {
    const first = mergeMappings(null, [{ mapping_type: "address", id: "0x075A", name: "lives", source: "Data Crystal RAM map, GFDL 1.2" } as any], "abc", "SMB");
    expect(first.addresses["0x075A"].source).toBe("Data Crystal RAM map, GFDL 1.2");
    const again = mergeMappings(first, [{ mapping_type: "address", id: "0x075A", name: "lives", source: "someone else" } as any], "abc", "SMB");
    expect(again.addresses["0x075A"].source).toBe("Data Crystal RAM map, GFDL 1.2");
    const tile = mergeMappings(null, [{ mapping_type: "tile", id: "0x24", name: "sky", source: "smbdis" } as any], "abc", "SMB");
    expect(tile.tiles["0x24"].source).toBe("smbdis");
  });

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

describe("mapping schema v2: rom_origins (ADR-0009)", () => {
  const origin = { mem: "prgRom" as const, offset: 0xccc, length: 1, notes: "level palette table, slot 1" };

  it("stamps schema 2 on a new mapping and carries rom_origins onto new entries", () => {
    const m = mergeMappings(null, [{ mapping_type: "palette", id: "0", name: "pipe_bush_hill_green", confidence: 1, rom_origins: [origin] }], "abc", "SMB");
    expect(m.schema).toBe(2);
    expect(m.palettes["0"].rom_origins).toEqual([origin]);
  });

  it("adds origins to an existing entry without renaming it, and does not duplicate them", () => {
    const existing = mergeMappings(null, [{ mapping_type: "palette", id: "0", name: "sky_ground", confidence: 1 }], "abc", "SMB");
    delete existing.schema; // a v1 file on disk
    const once = mergeMappings(existing, [{ mapping_type: "palette", id: "0", name: "renamed", confidence: 1, rom_origins: [origin] }], "abc", "SMB");
    expect(once.palettes["0"].name).toBe("sky_ground");
    expect(once.palettes["0"].rom_origins).toEqual([origin]);
    expect(once.schema).toBe(2);
    const twice = mergeMappings(once, [{ mapping_type: "palette", id: "0", name: "x", confidence: 1, rom_origins: [origin, { mem: "chrRom", offset: 16, length: 16 }] }], "abc", "SMB");
    expect(twice.palettes["0"].rom_origins).toHaveLength(2);
  });

  it("prints ROM origins in the prompt text", () => {
    const m = mergeMappings(null, [
      { mapping_type: "palette", id: "0", name: "p", confidence: 1, rom_origins: [origin] },
      { mapping_type: "tile", id: "0xB6", name: "ground", confidence: 1, rom_origins: [{ mem: "chrRom", offset: 0xb60, length: 16 }] },
    ], "abc", "SMB");
    const text = formatMappingForPrompt(m);
    expect(text).toContain("Palette 0: p (ROM: prgRom 0xCCC (1 byte) level palette table, slot 1)");
    expect(text).toContain("0xB6: ground (ROM: chrRom 0xB60 (16 bytes))");
  });
});
