/**
 * Tool definitions for the LLM agent and the tool executor.
 * Each tool maps to a MesenAdapter method (or the Capstone disassembler).
 */

import type { ToolSpec, ContentBlock, StoredImage } from "./types.js";
import type { MesenAdapter } from "../bridge/mesen/index.js";
import type { Disassembler, Arch } from "./disassembler.js";
import type { GameMapping } from "../mappings/types.js";
import { NES_MASTER_PALETTE_RGB } from "./nes-palette.js";

// -- Tool Definitions (JSON Schema for the LLM) -----------------------------

export const agentTools: ToolSpec[] = [
  {
    name: "screenshot",
    description:
      "Capture the current emulator frame as a PNG image. Use this to see what's on screen.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_tile_at_pixel",
    description:
      "Get tile and palette info at a screen pixel coordinate. Returns tile_id, palette_id, tile position, scroll values, and nametable address.",
    input_schema: {
      type: "object",
      properties: {
        x: { type: "number", description: "X pixel coordinate (0-255)" },
        y: { type: "number", description: "Y pixel coordinate (0-239)" },
      },
      required: ["x", "y"],
    },
  },
  {
    name: "get_palette",
    description:
      "Get the 4 NES color indices for a palette. Palette IDs 0-3 are background, 4-7 are sprite.",
    input_schema: {
      type: "object",
      properties: {
        palette_id: {
          type: "number",
          description: "Palette ID (0-7)",
        },
      },
      required: ["palette_id"],
    },
  },
  {
    name: "write_palette",
    description:
      "Change a palette color. The new color is frozen — it persists across frames even if the game tries to overwrite it. Resets on ROM reload. Use nes_color values 0-63 (NES master palette). Use clear_palette_overrides to unfreeze.",
    input_schema: {
      type: "object",
      properties: {
        palette_id: { type: "number", description: "Palette ID (0-7)" },
        color_index: {
          type: "number",
          description: "Color index within the palette (0-3)",
        },
        nes_color: {
          type: "number",
          description: "NES master palette color index (0-63)",
        },
      },
      required: ["palette_id", "color_index", "nes_color"],
    },
  },
  {
    name: "get_all_palettes",
    description:
      "Get all 8 palettes (4 background + 4 sprite) with their NES color indices.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "clear_palette_overrides",
    description:
      "Unfreeze palette overrides so the game can write its own colors again. Call with no arguments to clear all, or specify palette_id (and optionally color_index) to clear specific entries.",
    input_schema: {
      type: "object",
      properties: {
        palette_id: {
          type: "number",
          description: "Palette ID to unfreeze (0-7). Omit to clear all.",
        },
        color_index: {
          type: "number",
          description:
            "Color index within the palette (0-3). Only used with palette_id.",
        },
      },
    },
  },
  {
    name: "read_memory",
    description:
      "Read bytes from a memory region. Returns an array of byte values.",
    input_schema: {
      type: "object",
      properties: {
        address: { type: "number", description: "Start address" },
        length: {
          type: "number",
          description: "Number of bytes to read (default: 1)",
        },
        mem_type: {
          type: "string",
          description:
            "Memory type: cpu, ppu, cpuDebug, ppuDebug, palette, oam, prgRom, chrRom, chrRam, workRam, saveRam (default: cpuDebug)",
          enum: [
            "cpu",
            "ppu",
            "cpuDebug",
            "ppuDebug",
            "palette",
            "oam",
            "prgRom",
            "chrRom",
            "chrRam",
            "workRam",
            "saveRam",
          ],
        },
      },
      required: ["address"],
    },
  },
  {
    name: "write_memory",
    description:
      "Write bytes to a memory region. This is a live memory edit. Be careful — incorrect writes can crash the game.",
    input_schema: {
      type: "object",
      properties: {
        address: { type: "number", description: "Start address" },
        bytes: {
          type: "array",
          items: { type: "number" },
          description: "Array of byte values to write",
        },
        mem_type: {
          type: "string",
          description: "Memory type (default: cpu)",
          enum: [
            "cpu",
            "ppu",
            "cpuDebug",
            "ppuDebug",
            "palette",
            "oam",
            "prgRom",
            "chrRom",
            "chrRam",
            "workRam",
            "saveRam",
          ],
        },
      },
      required: ["address", "bytes"],
    },
  },
  {
    name: "get_cpu_state",
    description:
      "Get CPU registers (A, X, Y, SP, PC, status) and PPU position (cycle, scanline).",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_rom_info",
    description:
      "Get metadata about the currently loaded ROM (name, path, SHA1 hash, format).",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "save_state",
    description: "Save the current emulator state to a slot (for undo/backup).",
    input_schema: {
      type: "object",
      properties: {
        slot: {
          type: "number",
          description: "Save state slot number (default: 0)",
        },
      },
    },
  },
  {
    name: "load_state",
    description:
      "Load a previously saved emulator state from a slot (for undo/rollback).",
    input_schema: {
      type: "object",
      properties: {
        slot: {
          type: "number",
          description: "Save state slot number (default: 0)",
        },
      },
    },
  },
  {
    name: "disassemble",
    description:
      "Read bytes from memory and disassemble them into assembly instructions. Useful for understanding game code.",
    input_schema: {
      type: "object",
      properties: {
        address: {
          type: "number",
          description: "Start address to read and disassemble from",
        },
        length: {
          type: "number",
          description: "Number of bytes to read (default: 32)",
        },
        arch: {
          type: "string",
          description:
            "CPU architecture: 6502 (NES), 65c02, w65816 (SNES), arm (GBA), thumb (GBA Thumb mode). Default: 6502",
          enum: ["6502", "65c02", "w65816", "arm", "thumb"],
        },
      },
      required: ["address"],
    },
  },
  {
    name: "read_tile",
    description:
      "Read a tile's 8x8 pixel grid from CHR data. Returns palette indices (0-3) and an ASCII art preview. Use this to see what a tile looks like before editing it.",
    input_schema: {
      type: "object",
      properties: {
        tile_id: {
          type: "number",
          description: "Tile index in CHR memory (e.g. 0xB4 = 180)",
        },
        source: {
          type: "string",
          description: "CHR source: chrRom (default) or chrRam",
          enum: ["chrRom", "chrRam"],
        },
      },
      required: ["tile_id"],
    },
  },
  {
    name: "write_tile",
    description:
      "Write an 8x8 pixel grid to CHR memory. Each pixel is a palette index (0-3). Check the 'CHR Type' in the Current ROM section of your context to determine whether to use chrRam or chrRom as the target. If no CHR Type is listed, try chrRam first. WARNING: Writing to chrRom patches the ROM in memory.",
    input_schema: {
      type: "object",
      properties: {
        tile_id: {
          type: "number",
          description: "Tile index in CHR memory",
        },
        pixels: {
          type: "array",
          items: {
            type: "array",
            items: { type: "number" },
          },
          description:
            "8x8 array of pixel values (0-3). Each sub-array is one row of 8 pixels.",
        },
        target: {
          type: "string",
          description: "CHR target: chrRam (default) or chrRom",
          enum: ["chrRam", "chrRom"],
        },
      },
      required: ["tile_id", "pixels"],
    },
  },
  {
    name: "read_nametable",
    description:
      "Read a rectangular region of the nametable. Returns tile IDs and palette assignments for each position, showing what tiles are placed where on screen. If a game mapping is loaded, tile names are included.",
    input_schema: {
      type: "object",
      properties: {
        x: {
          type: "number",
          description: "Starting tile column (0-31)",
        },
        y: {
          type: "number",
          description: "Starting tile row (0-29)",
        },
        width: {
          type: "number",
          description: "Width in tiles (default: 4, max: 32)",
        },
        height: {
          type: "number",
          description: "Height in tiles (default: 4, max: 30)",
        },
        nametable: {
          type: "number",
          description: "Nametable index 0-3 (default: 0). Base addresses: 0=$2000, 1=$2400, 2=$2800, 3=$2C00",
        },
      },
      required: ["x", "y"],
    },
  },
  {
    name: "write_nametable",
    description:
      "Write tile IDs to nametable positions. This changes which tiles appear at specific screen locations. The tile shapes come from CHR data; this just rearranges which tiles go where.",
    input_schema: {
      type: "object",
      properties: {
        x: {
          type: "number",
          description: "Starting tile column (0-31)",
        },
        y: {
          type: "number",
          description: "Starting tile row (0-29)",
        },
        tile_ids: {
          type: "array",
          items: {
            type: "array",
            items: { type: "number" },
          },
          description:
            "2D array of tile IDs. Each sub-array is one row. E.g. [[1,2],[3,4]] places a 2x2 region.",
        },
        nametable: {
          type: "number",
          description: "Nametable index 0-3 (default: 0)",
        },
      },
      required: ["x", "y", "tile_ids"],
    },
  },
  {
    name: "write_sprite",
    description:
      "Write a multi-tile sprite to CHR memory and place it on the nametable. " +
      "Accepts a pixel grid larger than 8x8 (e.g. 16x16, 24x16) — automatically " +
      "splits it into tile-sized chunks, writes each to CHR memory, and places them " +
      "at the specified screen position. Grid dimensions must be multiples of tile_size. " +
      "Each pixel is a palette index (0-3). Use this instead of write_tile when creating " +
      "objects that need more than a single tile (animals, characters, detailed shapes).",
    input_schema: {
      type: "object",
      properties: {
        pixels: {
          type: "array",
          items: { type: "array", items: { type: "number" } },
          description:
            "2D pixel array (height x width). Dimensions must be multiples of tile_size. " +
            "Each pixel is 0-3 (palette index). E.g. a 16x16 grid creates 4 tiles.",
        },
        x: {
          type: "number",
          description: "Starting nametable tile column (0-31) for placement",
        },
        y: {
          type: "number",
          description: "Starting nametable tile row (0-29) for placement",
        },
        start_tile_id: {
          type: "number",
          description:
            "First tile ID to write to in CHR memory. Tiles are written sequentially " +
            "from this ID. Use read_tile to check if slots are empty (all zeros) before writing.",
        },
        target: {
          type: "string",
          description:
            "CHR target: chrRam or chrRom. Check 'CHR Type' in your context to choose correctly.",
          enum: ["chrRam", "chrRom"],
        },
        nametable: {
          type: "number",
          description: "Nametable index 0-3 (default: 0)",
        },
        tile_size: {
          type: "number",
          description:
            "Tile size in pixels (default: 8). NES uses 8x8 tiles. " +
            "Override only if working with a platform that uses different tile dimensions.",
        },
      },
      required: ["pixels", "x", "y", "start_tile_id"],
    },
  },
  {
    name: "record_mapping",
    description:
      "Record a discovery about the ROM — what a tile is, what a palette is used for, what a memory address controls. These discoveries are saved to the session and can later be promoted to a shareable mapping file.",
    input_schema: {
      type: "object",
      properties: {
        mapping_type: {
          type: "string",
          enum: ["tile", "palette", "sprite", "address"],
          description: "What kind of thing you're mapping",
        },
        id: {
          type: "string",
          description:
            "Identifier: tile ID (hex, e.g. '0xB4'), palette ID, sprite name, or address (hex)",
        },
        name: {
          type: "string",
          description: "Human-readable name (e.g. 'cloud-top-left', 'player_x')",
        },
        category: {
          type: "string",
          description:
            "Category: background, interactive, decoration, enemy, player, item, other",
        },
        group: {
          type: "string",
          description: "Related group (e.g. 'cloud', 'pipe', 'ground')",
        },
        notes: {
          type: "string",
          description: "Additional context about this discovery",
        },
        confidence: {
          type: "number",
          description:
            "How certain you are (0-1). 1 = confirmed, <1 = hypothesis. Defaults to 1.",
        },
      },
      required: ["mapping_type", "id", "name"],
    },
  },
  {
    name: "pause_emulator",
    description:
      "Pause the emulator. Use before making precise edits (tile writes, palette changes, nametable modifications) so the game engine doesn't overwrite your changes mid-frame. The emulator stays paused until you call resume_emulator.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "resume_emulator",
    description:
      "Resume emulator execution after pausing. Use when you're done making edits and want to see the game running with your changes applied.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "step_frame",
    description:
      "Advance the emulator by one or more frames while keeping it paused. Use after making edits to render changes visible in a screenshot without letting the game run freely. Each frame is 1/60th of a second.",
    input_schema: {
      type: "object",
      properties: {
        count: {
          type: "number",
          description: "Number of frames to advance (default: 1)",
        },
      },
    },
  },
  {
    name: "extract_sprite",
    description:
      "Extract pixel data from a user-uploaded reference image. Crops a region, quantizes colors " +
      "to the target NES palette (4 colors), and returns a pixel[][] array ready for write_tile or " +
      "write_sprite. Use this when the user provides a sprite sheet or pixel art reference. " +
      "The output dimensions are rounded up to multiples of 8 (tile-aligned).",
    input_schema: {
      type: "object",
      properties: {
        image_id: {
          type: "string",
          description:
            'Which uploaded image to extract from. Use "image_0" for the most recently uploaded ' +
            'image, "image_1" for the one before that, etc. Defaults to "image_0".',
        },
        x: {
          type: "number",
          description: "X pixel coordinate of the crop region's top-left corner in the source image",
        },
        y: {
          type: "number",
          description: "Y pixel coordinate of the crop region's top-left corner in the source image",
        },
        width: {
          type: "number",
          description: "Width of the crop region in pixels. Will be rounded up to a multiple of 8.",
        },
        height: {
          type: "number",
          description: "Height of the crop region in pixels. Will be rounded up to a multiple of 8.",
        },
        palette_id: {
          type: "number",
          description:
            "Target NES palette ID (0-7). The palette's 4 colors are used for quantization. " +
            "Get palettes with get_all_palettes first.",
        },
        transparency_threshold: {
          type: "number",
          description:
            "Alpha threshold (0-255) below which pixels are treated as transparent and mapped to " +
            "palette index 0 (background). Default: 128.",
        },
      },
      required: ["x", "y", "width", "height", "palette_id"],
    },
  },
  {
    name: "find_unused_tiles",
    description:
      "Scan the nametable to find CHR tile IDs that are NOT currently displayed on screen. " +
      "These tiles are safe to overwrite with new graphics without disturbing visible content. " +
      "Returns a list of unused tile IDs. Use these as start_tile_id for write_sprite.",
    input_schema: {
      type: "object",
      properties: {
        nametable: {
          type: "number",
          description: "Nametable index 0-3 to scan (default: 0)",
        },
        count: {
          type: "number",
          description: "Maximum number of unused tile IDs to return (default: 16)",
        },
      },
    },
  },
];

// -- Tool Result Types -------------------------------------------------------

/** Tool execution result — either text or an image (for screenshots). */
export type ToolResult =
  | { type: "text"; text: string }
  | { type: "mixed"; content: ContentBlock[] };

// -- Platform Constants -------------------------------------------------------

/** NES nametable base address in PPU memory. */
const NES_NT_BASE = 0x2000;
/** NES nametable size (1KB per nametable). */
const NES_NT_SIZE = 0x400;
/** NES attribute table offset within a nametable. */
const NES_ATTR_OFFSET = 0x3C0;

// -- Helpers -----------------------------------------------------------------

/** Generate ASCII art preview for a pixel grid (any size, not just 8x8). */
function pixelGridToAscii(pixels: number[][]): string {
  const charMap = [".", "1", "2", "3"];
  return pixels
    .map((row) => "  " + row.map((px) => charMap[px] ?? "?").join(" "))
    .join("\n");
}

/** Squared Euclidean distance between two RGB colors. */
function colorDistanceSq(
  r1: number, g1: number, b1: number,
  r2: number, g2: number, b2: number,
): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return dr * dr + dg * dg + db * db;
}

/** Quantize an RGBA pixel buffer region to a 4-color NES palette. */
function quantizeToNesPalette(
  imageData: Buffer,
  imageWidth: number,
  imageHeight: number,
  cropX: number,
  cropY: number,
  cropW: number,
  cropH: number,
  paletteRgb: [number, number, number][],
  alphaThreshold: number,
): number[][] {
  const outW = Math.ceil(cropW / 8) * 8;
  const outH = Math.ceil(cropH / 8) * 8;

  const pixels: number[][] = [];
  for (let row = 0; row < outH; row++) {
    const rowData: number[] = [];
    for (let col = 0; col < outW; col++) {
      const srcX = cropX + col;
      const srcY = cropY + row;

      // Out-of-bounds or padding pixels → background (index 0)
      if (col >= cropW || row >= cropH || srcX >= imageWidth || srcY >= imageHeight) {
        rowData.push(0);
        continue;
      }

      const idx = (srcY * imageWidth + srcX) * 4;
      const r = imageData[idx];
      const g = imageData[idx + 1];
      const b = imageData[idx + 2];
      const a = imageData[idx + 3];

      // Transparent → background (index 0)
      if (a < alphaThreshold) {
        rowData.push(0);
        continue;
      }

      // Find nearest palette color
      let bestIndex = 0;
      let bestDist = Infinity;
      for (let i = 0; i < paletteRgb.length; i++) {
        const [pr, pg, pb] = paletteRgb[i];
        const dist = colorDistanceSq(r, g, b, pr, pg, pb);
        if (dist < bestDist) {
          bestDist = dist;
          bestIndex = i;
        }
      }

      rowData.push(bestIndex);
    }
    pixels.push(rowData);
  }

  return pixels;
}

// -- Tool Executor -----------------------------------------------------------

/**
 * Execute a tool call and return the result.
 * Screenshot results include the image as a content block so the LLM can see it.
 */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  adapter: MesenAdapter,
  disassembler?: Disassembler | null,
  mapping?: GameMapping | null,
  imageStore?: Map<string, StoredImage> | null,
): Promise<ToolResult> {
  switch (name) {
    case "screenshot": {
      const result = await adapter.screenshot();
      // Mesen returns an empty PNG while paused; an empty image block is a
      // provider 400 that kills the whole turn, so fail inside the tool.
      if (!result.png_base64) {
        throw new Error(
          result.paused
            ? "Screenshot unavailable: the emulator is paused and Mesen produces no frame while paused. Call resume_emulator (or step_frame to advance one frame) and take the screenshot again."
            : "Screenshot unavailable: the emulator returned no image data.",
        );
      }
      return {
        type: "mixed",
        content: [
          {
            type: "image",
            media_type: "image/png",
            data: result.png_base64,
          },
        ],
      };
    }

    case "get_tile_at_pixel": {
      const result = await adapter.getTileAtPixel(
        input.x as number,
        input.y as number
      );
      return { type: "text", text: JSON.stringify(result) };
    }

    case "get_palette": {
      const result = await adapter.getPalette(input.palette_id as number);
      return { type: "text", text: JSON.stringify(result) };
    }

    case "write_palette": {
      const result = await adapter.writePalette(
        input.palette_id as number,
        input.color_index as number,
        input.nes_color as number
      );
      return { type: "text", text: JSON.stringify(result) };
    }

    case "get_all_palettes": {
      const result = await adapter.getAllPalettes();
      return { type: "text", text: JSON.stringify(result) };
    }

    case "clear_palette_overrides": {
      const result = await adapter.clearPaletteOverrides(
        input.palette_id as number | undefined,
        input.color_index as number | undefined
      );
      return { type: "text", text: JSON.stringify(result) };
    }

    case "read_memory": {
      const result = await adapter.readMemory(
        input.address as number,
        (input.length as number) ?? 1,
        (input.mem_type as any) ?? "cpuDebug"
      );
      return { type: "text", text: JSON.stringify(result) };
    }

    case "write_memory": {
      const result = await adapter.writeMemory(
        input.address as number,
        input.bytes as number[],
        (input.mem_type as any) ?? "cpu"
      );
      return { type: "text", text: JSON.stringify(result) };
    }

    case "get_cpu_state": {
      const result = await adapter.getCpuState();
      return { type: "text", text: JSON.stringify(result) };
    }

    case "get_rom_info": {
      const result = await adapter.getRomInfo();
      return { type: "text", text: JSON.stringify(result) };
    }

    case "save_state": {
      const result = await adapter.saveState((input.slot as number) ?? 0);
      return { type: "text", text: JSON.stringify(result) };
    }

    case "load_state": {
      const result = await adapter.loadState((input.slot as number) ?? 0);
      return { type: "text", text: JSON.stringify(result) };
    }

    case "disassemble": {
      if (!disassembler) {
        return {
          type: "text",
          text: "Disassembler not available — run `cd capstone && ./build.sh` to build the Capstone WASM module",
        };
      }
      const length = (input.length as number) ?? 32;
      const arch = (input.arch as Arch) ?? "6502";
      const memResult = await adapter.readMemory(
        input.address as number,
        length,
        "cpuDebug"
      );
      const bytes = new Uint8Array(memResult.bytes);
      const instructions = disassembler.disassemble(bytes, input.address as number, arch);
      const lines = instructions.map(
        (i) =>
          `$${i.address.toString(16).padStart(4, "0")}: ${i.bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ").padEnd(11)} ${i.mnemonic} ${i.op_str}`
      );
      return { type: "text", text: lines.join("\n") || "(no instructions decoded)" };
    }

    case "read_tile": {
      const tileId = input.tile_id as number;
      const source = (input.source as "chrRom" | "chrRam") ?? "chrRom";
      const result = await adapter.readChrTile(tileId, source);

      const hexId = `$${tileId.toString(16).toUpperCase().padStart(2, "0")}`;
      const tileName = mapping?.tiles[`0x${tileId.toString(16).toUpperCase().padStart(2, "0")}`]?.name
        ?? mapping?.tiles[`0x${tileId.toString(16).padStart(2, "0")}`]?.name;
      const header = tileName ? `${hexId}: ${tileName}` : hexId;
      const ascii = pixelGridToAscii(result.pixels);

      const text = `${header} (source: ${source})\n${ascii}\n\nRaw pixels: ${JSON.stringify(result.pixels)}`;
      return { type: "text", text };
    }

    case "write_tile": {
      const tileId = input.tile_id as number;
      const pixels = input.pixels as number[][];
      const target = (input.target as "chrRom" | "chrRam") ?? "chrRam";

      // Validate grid dimensions
      if (!pixels || pixels.length !== 8 || pixels.some((row) => row.length !== 8)) {
        return { type: "text", text: "Error: pixels must be an 8x8 array of values 0-3" };
      }

      const result = await adapter.writeChrTile(tileId, pixels, target);
      const warning = target === "chrRom"
        ? " WARNING: Wrote to CHR ROM — this patches the ROM in memory."
        : "";
      const hexId = `$${tileId.toString(16).toUpperCase().padStart(2, "0")}`;
      const ascii = pixelGridToAscii(pixels);
      const text = `Wrote tile ${hexId} to ${target} (${result.rows_written} rows).${warning}\n\nPreview:\n${ascii}`;
      return { type: "text", text };
    }

    case "read_nametable": {
      const startX = input.x as number;
      const startY = input.y as number;
      const width = Math.min((input.width as number) ?? 4, 32);
      const height = Math.min((input.height as number) ?? 4, 30);
      const nt = (input.nametable as number) ?? 0;
      const ntBase = NES_NT_BASE + nt * NES_NT_SIZE;
      const attrBase = ntBase + NES_ATTR_OFFSET;

      const grid: Array<{ x: number; y: number; tile_id: number; palette_id: number; name?: string }> = [];

      // Read nametable tile IDs and attribute palette assignments
      for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
          const tx = startX + col;
          const ty = startY + row;
          if (tx >= 32 || ty >= 30) continue;

          // Read tile ID from nametable
          const ntAddr = ntBase + ty * 32 + tx;
          const tileResult = await adapter.readMemory(ntAddr, 1, "ppuDebug");
          const tileId = tileResult.bytes[0];

          // Read attribute byte for palette
          const attrAddr = attrBase + Math.floor(ty / 4) * 8 + Math.floor(tx / 4);
          const attrResult = await adapter.readMemory(attrAddr, 1, "ppuDebug");
          const attrByte = attrResult.bytes[0];
          const qx = Math.floor((tx % 4) / 2);
          const qy = Math.floor((ty % 4) / 2);
          const shift = (qy * 2 + qx) * 2;
          const paletteId = (attrByte >> shift) & 0x03;

          const hexTileId = `0x${tileId.toString(16).toUpperCase().padStart(2, "0")}`;
          const tileName = mapping?.tiles[hexTileId]?.name
            ?? mapping?.tiles[`0x${tileId.toString(16).padStart(2, "0")}`]?.name;

          const entry: typeof grid[0] = { x: tx, y: ty, tile_id: tileId, palette_id: paletteId };
          if (tileName) entry.name = tileName;
          grid.push(entry);
        }
      }

      // Format as a readable grid
      const lines: string[] = [`Nametable ${nt} region (${startX},${startY}) ${width}x${height}:`];
      for (let row = 0; row < height; row++) {
        const rowTiles = grid.filter((g) => g.y === startY + row);
        const rowStr = rowTiles
          .map((t) => {
            const hex = t.tile_id.toString(16).toUpperCase().padStart(2, "0");
            return t.name ? `${hex}:${t.name}` : hex;
          })
          .join(" ");
        lines.push(`  Row ${startY + row}: ${rowStr}`);
      }

      return { type: "text", text: lines.join("\n") + "\n\n" + JSON.stringify(grid) };
    }

    case "write_nametable": {
      const startX = input.x as number;
      const startY = input.y as number;
      const tileIds = input.tile_ids as number[][];
      const nt = (input.nametable as number) ?? 0;
      const ntBase = NES_NT_BASE + nt * NES_NT_SIZE;

      let written = 0;
      for (let row = 0; row < tileIds.length; row++) {
        for (let col = 0; col < tileIds[row].length; col++) {
          const tx = startX + col;
          const ty = startY + row;
          if (tx >= 32 || ty >= 30) continue;

          const ntAddr = ntBase + ty * 32 + tx;
          await adapter.writeMemory(ntAddr, [tileIds[row][col]], "ppu");
          written++;
        }
      }

      return { type: "text", text: JSON.stringify({ nametable: nt, tiles_written: written }) };
    }

    case "write_sprite": {
      const pixels = input.pixels as number[][];
      const startX = input.x as number;
      const startY = input.y as number;
      const startTileId = input.start_tile_id as number;
      const target = (input.target as "chrRom" | "chrRam") ?? "chrRam";
      const nt = (input.nametable as number) ?? 0;
      const tileSize = (input.tile_size as number) ?? 8;
      const ntBase = NES_NT_BASE + nt * NES_NT_SIZE;

      // Validate dimensions
      const height = pixels.length;
      const width = pixels[0]?.length ?? 0;
      if (height === 0 || width === 0 || height % tileSize !== 0 || width % tileSize !== 0) {
        return {
          type: "text",
          text: `Error: pixel grid dimensions must be multiples of ${tileSize}. Got ${width}x${height}.`,
        };
      }
      if (pixels.some((row) => row.length !== width)) {
        return { type: "text", text: "Error: all rows must have the same width." };
      }

      const tilesWide = width / tileSize;
      const tilesHigh = height / tileSize;
      const totalTiles = tilesWide * tilesHigh;

      // Split into tile-sized chunks and write each
      let tileId = startTileId;
      const tileIds: number[][] = [];

      for (let tileRow = 0; tileRow < tilesHigh; tileRow++) {
        const rowTileIds: number[] = [];
        for (let tileCol = 0; tileCol < tilesWide; tileCol++) {
          // Extract chunk
          const chunk: number[][] = [];
          for (let py = 0; py < tileSize; py++) {
            const row: number[] = [];
            for (let px = 0; px < tileSize; px++) {
              row.push(pixels[tileRow * tileSize + py][tileCol * tileSize + px]);
            }
            chunk.push(row);
          }

          await adapter.writeChrTile(tileId, chunk, target);
          rowTileIds.push(tileId);
          tileId++;
        }
        tileIds.push(rowTileIds);
      }

      // Place tiles in the nametable
      let written = 0;
      for (let row = 0; row < tileIds.length; row++) {
        for (let col = 0; col < tileIds[row].length; col++) {
          const tx = startX + col;
          const ty = startY + row;
          if (tx >= 32 || ty >= 30) continue;
          const ntAddr = ntBase + ty * 32 + tx;
          await adapter.writeMemory(ntAddr, [tileIds[row][col]], "ppu");
          written++;
        }
      }

      const warning = target === "chrRom" ? " WARNING: Wrote to CHR ROM." : "";
      const hexStart = `$${startTileId.toString(16).toUpperCase().padStart(2, "0")}`;
      const hexEnd = `$${(startTileId + totalTiles - 1).toString(16).toUpperCase().padStart(2, "0")}`;
      const ascii = pixelGridToAscii(pixels);
      const text =
        `Wrote ${totalTiles} tiles (${tilesWide}x${tilesHigh}) to ${target} ` +
        `(tile IDs ${hexStart}-${hexEnd}), placed at nametable (${startX},${startY}).${warning}\n\n` +
        `Preview (${width}x${height} pixels):\n${ascii}`;

      return { type: "text", text };
    }

    case "record_mapping": {
      // This tool returns a confirmation — the actual DB event recording
      // is handled by extractDomainEvents in index.ts.
      const confidence = (input.confidence as number) ?? 1;
      const result = {
        mapping_type: input.mapping_type,
        id: input.id,
        name: input.name,
        category: input.category ?? null,
        group: input.group ?? null,
        notes: input.notes ?? null,
        confidence,
        recorded: true,
        event_type: confidence >= 1 ? "mapping_discovered" : "mapping_hypothesis",
      };
      return { type: "text", text: JSON.stringify(result) };
    }

    case "pause_emulator": {
      const result = await adapter.pauseEmulator();
      return { type: "text", text: JSON.stringify(result) };
    }

    case "resume_emulator": {
      const result = await adapter.resumeEmulator();
      return { type: "text", text: JSON.stringify(result) };
    }

    case "step_frame": {
      const count = (input.count as number) ?? 1;
      const result = await adapter.stepFrame(count);
      return { type: "text", text: JSON.stringify(result) };
    }

    case "extract_sprite": {
      const imageId = (input.image_id as string) ?? "image_0";
      const cropX = input.x as number;
      const cropY = input.y as number;
      const cropW = input.width as number;
      const cropH = input.height as number;
      const paletteId = input.palette_id as number;
      const alphaThreshold = (input.transparency_threshold as number) ?? 128;

      if (!imageStore || imageStore.size === 0) {
        return {
          type: "text",
          text: "Error: No reference images available. The user must upload or paste an image first.",
        };
      }
      const img = imageStore.get(imageId);
      if (!img) {
        const available = Array.from(imageStore.keys()).join(", ");
        return {
          type: "text",
          text: `Error: Image "${imageId}" not found. Available images: ${available}`,
        };
      }

      if (cropX < 0 || cropY < 0 || cropW <= 0 || cropH <= 0) {
        return { type: "text", text: "Error: Crop region must have positive dimensions." };
      }
      if (cropX + cropW > img.width || cropY + cropH > img.height) {
        return {
          type: "text",
          text: `Error: Crop region (${cropX},${cropY} ${cropW}x${cropH}) exceeds image bounds (${img.width}x${img.height}).`,
        };
      }

      const paletteResult = await adapter.getPalette(paletteId);
      const paletteRgb: [number, number, number][] = paletteResult.colors.map(
        (nesColor: number) => NES_MASTER_PALETTE_RGB[nesColor & 0x3F]
      );

      const pixels = quantizeToNesPalette(
        img.data, img.width, img.height,
        cropX, cropY, cropW, cropH,
        paletteRgb, alphaThreshold,
      );

      const outW = pixels[0].length;
      const outH = pixels.length;
      const ascii = pixelGridToAscii(pixels);

      const paletteSummary = paletteResult.colors.map((c: number, i: number) => {
        const [r, g, b] = NES_MASTER_PALETTE_RGB[c & 0x3F];
        return `${i}→$${c.toString(16).padStart(2, "0")} (rgb ${r},${g},${b})`;
      }).join(", ");

      const text =
        `Extracted ${outW}x${outH} sprite from ${imageId} ` +
        `(crop: ${cropX},${cropY} ${cropW}x${cropH}, padded to ${outW}x${outH})\n` +
        `Palette ${paletteId}: [${paletteSummary}]\n\n` +
        `Preview:\n${ascii}\n\n` +
        `pixels: ${JSON.stringify(pixels)}`;

      return { type: "text", text };
    }

    case "find_unused_tiles": {
      const nt = (input.nametable as number) ?? 0;
      const maxCount = (input.count as number) ?? 16;
      const ntBase = NES_NT_BASE + nt * NES_NT_SIZE;

      // Read all 960 tile IDs from the nametable (32 columns × 30 rows)
      const usedTiles = new Set<number>();
      for (let row = 0; row < 30; row++) {
        const addr = ntBase + row * 32;
        const result = await adapter.readMemory(addr, 32, "ppuDebug");
        for (const byte of result.bytes) {
          usedTiles.add(byte);
        }
      }

      const unused: number[] = [];
      for (let id = 0; id < 256; id++) {
        if (!usedTiles.has(id)) {
          unused.push(id);
          if (unused.length >= maxCount) break;
        }
      }

      const hexIds = unused.map((id) => `$${id.toString(16).toUpperCase().padStart(2, "0")}`);
      const text =
        `Found ${unused.length} unused tile IDs in nametable ${nt} ` +
        `(${usedTiles.size} of 256 tiles are in use):\n` +
        hexIds.join(", ") + "\n\n" +
        `Use these as start_tile_id for write_sprite to avoid overwriting visible tiles.`;

      return { type: "text", text };
    }

    default:
      return { type: "text", text: `Unknown tool: ${name}` };
  }
}
