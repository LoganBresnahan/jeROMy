/**
 * Type definitions for game mapping files.
 *
 * Game mappings are static, community-shareable JSON files keyed by ROM SHA1
 * that teach the agent about specific ROMs — tile names, palette purposes,
 * sprite compositions, and known memory addresses.
 */

/** Where a visible thing comes from in the cartridge (ADR-0009): the bytes a persistent edit must change. */
export interface RomOrigin {
  mem: "prgRom" | "chrRom";
  /** ROM offset within that memory, no iNES header. */
  offset: number;
  length: number;
  notes?: string;
}

export interface GameMapping {
  rom_sha1: string;
  rom_name: string;
  /** Revision counter: bumped on every merge. */
  version: number;
  /** File format: absent or 1 = original; 2 = entries may carry rom_origins (ADR-0009). */
  schema?: number;
  contributors: string[];
  description: string;
  tiles: Record<string, TileMapping>;
  palettes: Record<string, PaletteMapping>;
  sprites: Record<string, SpriteMapping>;
  addresses: Record<string, AddressMapping>;
  notes: string[];
}

export type TileCategory =
  | "background"
  | "interactive"
  | "decoration"
  | "enemy"
  | "player"
  | "item"
  | "other";

export interface TileMapping {
  name: string;
  category: TileCategory;
  /** Groups related tiles: "cloud", "pipe", "ground" */
  group?: string;
  notes?: string;
  rom_origins?: RomOrigin[];
  /** Where the lead came from when it was not a session's own discovery (ADR-0017); the emulator observation is still what made it an entry. */
  source?: string;
}

export interface PaletteMapping {
  name: string;
  notes?: string;
  rom_origins?: RomOrigin[];
  /** Where the lead came from when it was not a session's own discovery (ADR-0017); the emulator observation is still what made it an entry. */
  source?: string;
}

export interface SpriteMapping {
  /** Hex tile IDs that compose this sprite */
  tiles: string[];
  palette_id: number;
  notes?: string;
  source?: string;
}

export interface AddressMapping {
  /** Hex address */
  address: string;
  mem_type: string;
  description: string;
  rom_origins?: RomOrigin[];
  /** Where the lead came from when it was not a session's own discovery (ADR-0017); the emulator observation is still what made it an entry. */
  source?: string;
}

/** Current mapping file format (ADR-0009). */
export const MAPPING_SCHEMA = 2;
