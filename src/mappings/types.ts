/**
 * Type definitions for game mapping files.
 *
 * Game mappings are static, community-shareable JSON files keyed by ROM SHA1
 * that teach the agent about specific ROMs — tile names, palette purposes,
 * sprite compositions, and known memory addresses.
 */

export interface GameMapping {
  rom_sha1: string;
  rom_name: string;
  version: number;
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
}

export interface PaletteMapping {
  name: string;
  notes?: string;
}

export interface SpriteMapping {
  /** Hex tile IDs that compose this sprite */
  tiles: string[];
  palette_id: number;
  notes?: string;
}

export interface AddressMapping {
  /** Hex address */
  address: string;
  mem_type: string;
  description: string;
}
