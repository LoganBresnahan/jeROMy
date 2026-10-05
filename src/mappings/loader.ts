/**
 * Game mapping loader — loads and formats mapping files for prompt injection.
 *
 * Mapping files live in `mappings/sha1-{sha1}.json` and are loaded by ROM SHA1
 * at session start. The formatted output is injected into the agent's system prompt.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  MAPPING_SCHEMA,
  type GameMapping,
  type TileMapping,
  type PaletteMapping,
  type SpriteMapping,
  type AddressMapping,
  type RomOrigin,
} from "./types.js";

/** Default directory where mapping files live. */
const DEFAULT_MAPPINGS_DIR = resolve(
  import.meta.dirname ?? ".",
  "..",
  "..",
  "mappings"
);

/**
 * Load a game mapping by ROM SHA1.
 * Returns null if no mapping file exists for this ROM.
 */
export function loadMapping(
  sha1: string,
  mappingsDir: string = DEFAULT_MAPPINGS_DIR
): GameMapping | null {
  const filePath = resolve(mappingsDir, `sha1-${sha1}.json`);
  if (!existsSync(filePath)) return null;

  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as GameMapping;
}

/**
 * Save a game mapping to disk.
 * Creates or overwrites the mapping file for the given SHA1.
 */
export function saveMapping(
  mapping: GameMapping,
  mappingsDir: string = DEFAULT_MAPPINGS_DIR
): void {
  const filePath = resolve(mappingsDir, `sha1-${mapping.rom_sha1}.json`);
  writeFileSync(filePath, JSON.stringify(mapping, null, 2) + "\n", "utf-8");
}

/**
 * Merge newly discovered mappings into an existing mapping (or create a new one).
 * Does not overwrite existing entries — new discoveries only fill gaps.
 */
export function mergeMappings(
  existing: GameMapping | null,
  discoveries: DiscoveredEntry[],
  romSha1: string,
  romName: string
): GameMapping {
  const base: GameMapping = existing ?? {
    rom_sha1: romSha1,
    rom_name: romName,
    version: 1,
    schema: MAPPING_SCHEMA,
    contributors: [],
    description: `Auto-discovered mappings for ${romName}`,
    tiles: {},
    palettes: {},
    sprites: {},
    addresses: {},
    notes: [],
  };

  // ROM origins are the one thing a later discovery may add to an existing
  // entry: knowing where a thing lives in the cartridge is new knowledge even
  // when its name is not (ADR-0009).
  const addOrigins = (target: { rom_origins?: RomOrigin[] }, origins?: RomOrigin[]) => {
    if (!origins || origins.length === 0) return;
    const have = new Set((target.rom_origins ?? []).map((o) => `${o.mem}:${o.offset}:${o.length}`));
    const fresh = origins.filter((o) => !have.has(`${o.mem}:${o.offset}:${o.length}`));
    if (fresh.length > 0) target.rom_origins = [...(target.rom_origins ?? []), ...fresh];
  };

  for (const entry of discoveries) {
    switch (entry.mapping_type) {
      case "tile":
        if (!base.tiles[entry.id]) {
          base.tiles[entry.id] = {
            name: entry.name,
            category: (entry.category as TileMapping["category"]) ?? "other",
            ...(entry.group ? { group: entry.group } : {}),
            ...(entry.notes ? { notes: entry.notes } : {}),
          };
        }
        addOrigins(base.tiles[entry.id], entry.rom_origins);
        break;
      case "palette":
        if (!base.palettes[entry.id]) {
          base.palettes[entry.id] = {
            name: entry.name,
            ...(entry.notes ? { notes: entry.notes } : {}),
          };
        }
        addOrigins(base.palettes[entry.id], entry.rom_origins);
        break;
      case "sprite":
        if (!base.sprites[entry.id]) {
          base.sprites[entry.id] = {
            tiles: [],
            palette_id: 0,
            ...(entry.notes ? { notes: entry.notes } : {}),
          };
        }
        break;
      case "address":
        if (!base.addresses[entry.id]) {
          base.addresses[entry.id] = {
            address: entry.id,
            mem_type: "cpu",
            description: entry.name,
          };
        }
        addOrigins(base.addresses[entry.id], entry.rom_origins);
        break;
    }
  }

  base.version += existing ? 1 : 0;
  if (!base.schema || base.schema < MAPPING_SCHEMA) base.schema = MAPPING_SCHEMA;
  return base;
}

/** `prgRom 0xCCC (1 byte)` style, for prompts and tool text. */
export function formatOrigins(origins?: RomOrigin[]): string {
  if (!origins || origins.length === 0) return "";
  return origins.map((o) => `${o.mem} 0x${o.offset.toString(16).toUpperCase()} (${o.length} byte${o.length === 1 ? "" : "s"})${o.notes ? ` ${o.notes}` : ""}`).join(", ");
}

/** A single discovery entry from the record_mapping tool. */
export interface DiscoveredEntry {
  mapping_type: "tile" | "palette" | "sprite" | "address";
  id: string;
  name: string;
  category?: string;
  group?: string;
  notes?: string;
  confidence: number;
  /** Where the bytes live in the cartridge, when the agent found them (ADR-0009). */
  rom_origins?: RomOrigin[];
}

/**
 * Format a game mapping for injection into the system prompt.
 * Produces a concise text summary the LLM can reference.
 */
export function formatMappingForPrompt(mapping: GameMapping): string {
  const lines: string[] = [];
  lines.push(`## Game Mapping: ${mapping.rom_name}`);
  lines.push(`SHA1: ${mapping.rom_sha1}`);
  if (mapping.description) lines.push(mapping.description);
  lines.push("");

  // Tiles
  const tileEntries = Object.entries(mapping.tiles);
  if (tileEntries.length > 0) {
    lines.push("### Known Tiles");
    // Group by category
    const byCategory = new Map<string, [string, TileMapping][]>();
    for (const [id, tile] of tileEntries) {
      const cat = tile.category;
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push([id, tile]);
    }
    for (const [category, tiles] of byCategory) {
      lines.push(`**${category}:**`);
      for (const [id, tile] of tiles) {
        let line = `- ${id}: ${tile.name}`;
        if (tile.group) line += ` [${tile.group}]`;
        if (tile.notes) line += ` — ${tile.notes}`;
        if (tile.rom_origins?.length) line += ` (ROM: ${formatOrigins(tile.rom_origins)})`;
        lines.push(line);
      }
    }
    lines.push("");
  }

  // Palettes
  const paletteEntries = Object.entries(mapping.palettes);
  if (paletteEntries.length > 0) {
    lines.push("### Known Palettes");
    for (const [id, pal] of paletteEntries) {
      let line = `- Palette ${id}: ${pal.name}`;
      if (pal.notes) line += ` — ${pal.notes}`;
      if (pal.rom_origins?.length) line += ` (ROM: ${formatOrigins(pal.rom_origins)})`;
      lines.push(line);
    }
    lines.push("");
  }

  // Sprites
  const spriteEntries = Object.entries(mapping.sprites);
  if (spriteEntries.length > 0) {
    lines.push("### Known Sprites");
    for (const [name, sprite] of spriteEntries) {
      let line = `- ${name}: tiles=[${sprite.tiles.join(", ")}] palette=${sprite.palette_id}`;
      if (sprite.notes) line += ` — ${sprite.notes}`;
      lines.push(line);
    }
    lines.push("");
  }

  // Addresses
  const addrEntries = Object.entries(mapping.addresses);
  if (addrEntries.length > 0) {
    lines.push("### Known Addresses");
    for (const [key, addr] of addrEntries) {
      lines.push(
        `- ${key}: ${addr.address} (${addr.mem_type}) — ${addr.description}${addr.rom_origins?.length ? ` (ROM: ${formatOrigins(addr.rom_origins)})` : ""}`
      );
    }
    lines.push("");
  }

  // Notes
  if (mapping.notes.length > 0) {
    lines.push("### Notes");
    for (const note of mapping.notes) {
      lines.push(`- ${note}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
