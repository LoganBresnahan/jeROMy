/**
 * Tool definitions for the LLM agent and the tool executor.
 * Each tool maps to a MesenAdapter method (or the Capstone disassembler).
 */

import type { LLMTool, ContentBlock } from "./provider.js";
import type { MesenAdapter } from "../bridge/mesen/index.js";
import type { Disassembler, Arch } from "./disassembler.js";

// -- Tool Definitions (JSON Schema for the LLM) -----------------------------

export const agentTools: LLMTool[] = [
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
            "Memory type: cpu, ppu, cpuDebug, ppuDebug, palette, oam, prgRom, chrRom, workRam, saveRam (default: cpuDebug)",
          enum: [
            "cpu",
            "ppu",
            "cpuDebug",
            "ppuDebug",
            "palette",
            "oam",
            "prgRom",
            "chrRom",
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
];

// -- Tool Result Types -------------------------------------------------------

/** Tool execution result — either text or an image (for screenshots). */
export type ToolResult =
  | { type: "text"; text: string }
  | { type: "mixed"; content: ContentBlock[] };

// -- Tool Executor -----------------------------------------------------------

/**
 * Execute a tool call and return the result.
 * Screenshot results include the image as a content block so the LLM can see it.
 */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  adapter: MesenAdapter,
  disassembler?: Disassembler | null
): Promise<ToolResult> {
  switch (name) {
    case "screenshot": {
      const result = await adapter.screenshot();
      // Return image block so the LLM can see it via vision
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

    default:
      return { type: "text", text: `Unknown tool: ${name}` };
  }
}
