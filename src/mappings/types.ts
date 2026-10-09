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
  /** File format: absent or 1 = original; 2 = entries may carry rom_origins (ADR-0009); 3 = scenes, levels, routines, address extent (ADR-0021). */
  schema?: number;
  contributors: string[];
  description: string;
  tiles: Record<string, TileMapping>;
  palettes: Record<string, PaletteMapping>;
  sprites: Record<string, SpriteMapping>;
  addresses: Record<string, AddressMapping>;
  scenes?: Record<string, SceneMapping>;
  /** Keyed by the game's own level name ("1-1"). */
  levels?: Record<string, LevelMapping>;
  /** Keyed by the entry PC in hex. */
  routines?: Record<string, RoutineMapping>;
  notes: string[];
}

/** A distinct visual state of the game (ADR-0021). */
export interface SceneMapping {
  name: string;
  notes?: string;
  /** How to get there: a play_input script, a save state, "Start on the title". */
  reach?: string;
  source?: string;
}

/** One level's data in PRG (ADR-0021): each origin lies inside that level's data. */
export interface LevelMapping {
  name: string;
  notes?: string;
  rom_origins?: RomOrigin[];
  source?: string;
}

export interface RoutineMapping {
  name: string;
  notes?: string;
  /** Bytes from the entry, when known. */
  length?: number;
  source?: string;
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
  /** Pattern table, 0 ($0000) or 1 ($1000); a key `chr:0x124` already carries it (ADR-0021). */
  table?: number;
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
  /** Bytes from the address that are the same thing (a BCD digit run); the grader's extent (ADR-0021). */
  length?: number;
  /** A per-slot array: `count` slots `stride` bytes apart. */
  stride?: number;
  count?: number;
  /** Encoding: binary, bcd, digits, minus-one, signed, flags, or free text. */
  format?: string;
  rom_origins?: RomOrigin[];
  /** Where the lead came from when it was not a session's own discovery (ADR-0017); the emulator observation is still what made it an entry. */
  source?: string;
}

/** Current mapping file format (ADR-0009, ADR-0021). */
export const MAPPING_SCHEMA = 3;
