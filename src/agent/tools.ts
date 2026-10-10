/**
 * Tool definitions for the LLM agent and the tool executor.
 * Each tool maps to a MesenAdapter method (or the Capstone disassembler).
 */

import type { ToolSpec, ContentBlock, StoredImage } from "./types.js";
import type { MesenAdapter } from "../bridge/mesen/index.js";
import type { MemoryType, PadButton, SearchMemoryResult } from "../bridge/mesen/protocol.js";
import { snapshotsFor, takeSnapshot, type DiffFilter } from "./snapshots.js";
import type { Disassembler, Arch } from "./disassembler.js";
import type { GameMapping } from "../mappings/types.js";
import { NES_MASTER_PALETTE_RGB, nearestNesColor, nesColorName } from "./nes-palette.js";
import { lookupTileAtPixel } from "./tile-lookup.js";
import { getRegionAt } from "./region.js";
import { blindMode, findSymbols, formatSymbol, loadReference, nearestSymbol, type ReferenceFile } from "./reference.js";
import { switchHack } from "../hacks/activate.js";
import { describeLedger, isRomMemory, ledgeredRomWrite, ledgerDivergence, windowsPathToWsl, type EditLedger } from "./edit-ledger.js";
import { applyEdits, applyIps, applyBps, crc32, encodeBps, encodeIps, inesLayout } from "../hacks/patch.js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

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
      "Get the nametable tile and palette under a screen pixel, plus the sprites drawn over it. It uses the scroll in effect at that pixel's scanline, taken from the last completed frame's PPU scroll writes, so a fixed status bar over a scrolling playfield (SMB) resolves correctly (scroll_source \"scanline\" or \"vblank\"); it never advances the emulator, paused or running. Returns tile_id, chr_tile (the pattern-space index read_tile/write_tile want), palette_id, screen_box (where that tile sits on screen), scroll values, nametable address, sprites covering the pixel and sprite_hit (the sprite drawing an opaque pixel there, with hit_tile and its 8x8 cell). Cross-check with get_pixel_color when in doubt.",
    input_schema: {
      type: "object",
      properties: {
        x: { type: "number", description: "X pixel coordinate (0-255)" },
        y: { type: "number", description: "Y pixel coordinate (0-239)" },
        precise: { type: "boolean", description: "Default true. False answers from the request-time PPU scroll in one request (fast, wrong on split-scroll frames)." },
      },
      required: ["x", "y"],
    },
  },
  {
    name: "get_region",
    description:
      "Select what is drawn around a screen pixel by palette slot, the way the PPU composes it (ADR-0014). mode \"color\": the connected run of pixels with the same layer, palette and slot (a hat, a button, a pipe rim). mode \"object\": the connected opaque pixels of the same layer and palette (all of Mario, the whole pipe). Returns the slot(s), pixel count, bounding box, the CHR tiles and OAM entries involved, how many other pixels in the 64x64 window share that slot (what a palette edit also recolors), which slots of that palette are unused in view (whether a tile edit could give the region its own color), and a summary sentence. Use it before any recolor to state the blast radius; never flood-fill rendered colors yourself.",
    input_schema: {
      type: "object",
      properties: {
        x: { type: "number", description: "X pixel coordinate (0-255)" },
        y: { type: "number", description: "Y pixel coordinate (0-239)" },
        mode: { type: "string", enum: ["color", "object"], description: "Default color" },
      },
      required: ["x", "y"],
    },
  },
  {
    name: "list_hacks",
    description:
      "List the named hacks of the loaded game (ADR-0018): each with its description, ledgered edit count, export count and last export, and which one is active. A hack is a directory under the game's hack directory with its own ledger and versioned patches; the mapping is shared by all of them.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "new_hack",
    description:
      "Create a named hack for the loaded game (ADR-0018): a fresh ledger and manifest beside the others. Does not switch to it; call use_hack to make it the one the emulator shows and the ledger writes go to. Names: a-z, 0-9, - and _.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Hack name, e.g. halloween" },
        description: { type: "string", description: "What this hack is" },
      },
      required: ["name"],
    },
  },
  {
    name: "use_hack",
    description:
      "Make a hack the active one (ADR-0018): the current hack's ledgered bytes are written back to their originals, the named hack's ledger is written into the emulator's ROM, and the emulator resets so the game re-reads its tables. From then on ROM writes ledger into that hack and exports version it. The emulator shows one hack at a time; every session shares the active one. Returns what was reverted and applied.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string", description: "Hack name from list_hacks" } },
      required: ["name"],
    },
  },
  {
    name: "lookup_symbol",
    description:
      "Look up a name or an address in the reference the user imported for this ROM (a community disassembly's labels and equates, or a wiki RAM map; ADR-0017). By name: exact match, else substring, up to 20. By address: the nearest symbol at or below it with the distance, so a PC from trace_writes or disassemble gets a routine name and a RAM address gets a variable name. Everything returned is a lead, not a fact: record a mapping only after the emulator confirms it, and pass the reference as record_mapping's source. Says so when no reference is imported.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Symbol name or fragment (case-insensitive)" },
        address: { type: "number", description: "CPU address (e.g. 0x8EE9) or RAM address (0x075A)" },
        max_distance: { type: "number", description: "For address lookups: how far below the address to search (default 0x400)" },
      },
      required: [],
    },
  },
  {
    name: "list_sprites",
    description:
      "Decode OAM: the hardware sprites as the PPU will draw them (screen x/y, 8x8 or 8x16 per the current PPUCTRL, raw tile byte, chr_tile = the pattern-space index read_tile wants, sprite palette 4-7, flips, behind-background priority). Only on-screen sprites are listed. With x and y, only the sprites whose box covers that pixel, each hit-tested against its pattern bytes (opaque, pixel_value, hit_tile, the 8x8 screen cell). Use it when a pixel's rendered color is not in the background palette, to find which sprite is the player or an enemy, or before editing a character's tiles.",
    input_schema: {
      type: "object",
      properties: {
        x: { type: "number", description: "Optional X pixel (0-255); with y, filters to sprites covering the pixel" },
        y: { type: "number", description: "Optional Y pixel (0-239)" },
      },
      required: [],
    },
  },
  {
    name: "search_memory",
    description:
      "Find a byte pattern in a memory type and return the offsets. Give bytes as an array (use -1 for a wildcard) or as a hex string like \"22 29 1A 0F\" / \"22 ?? 1A 0F\". Default region is PRG ROM (offsets are ROM offsets without the 16-byte iNES header). Use it to find where the game keeps the bytes you saw in RAM or palette memory, which is where a persistent edit belongs.",
    input_schema: {
      type: "object",
      properties: {
        pattern: { type: "array", items: { type: "number" }, description: "Bytes 0-255; -1 matches anything" },
        hex: { type: "string", description: "Alternative to pattern: space-separated hex bytes, ?? for a wildcard" },
        mem_type: { type: "string", description: "prgRom (default), chrRom, workRam, cpuDebug, ppuDebug, palette, ..." },
        start: { type: "number", description: "Offset to start from (default 0)" },
        length: { type: "number", description: "Bytes to scan (default: to the end, max 512 KiB per call)" },
        max_results: { type: "number", description: "Cap on offsets returned (default 64)" },
      },
      required: [],
    },
  },
  {
    name: "export_patch",
    description:
      "Write the edit ledger (every PRG/CHR ROM write this ROM has received through jeROMy) as a patch file in the ROM's hack directory: IPS by default, BPS on request (BPS carries CRC32s so it refuses the wrong ROM). Offsets include the iNES header. The patch is checked by re-applying it with an independent reader before the tool returns. The original ROM file is read, never written. With verify: true it also dumps PRG and CHR from the emulator and reports bytes that differ from the ledger (edits made some other way).",
    input_schema: {
      type: "object",
      properties: {
        format: { type: "string", enum: ["ips", "bps"], description: "Default ips" },
        rom_path: { type: "string", description: "Path to the original ROM file if the one Mesen reported is not readable from here" },
        verify: { type: "boolean", description: "Also dump PRG/CHR from the emulator and diff against the ledger (slower)" },
        name: { type: "string", description: "File name without extension (default: patch)" },
      },
      required: [],
    },
  },
  {
    name: "export_rom",
    description:
      "Apply the edit ledger to a copy of the original ROM and write <rom name>.hacked.nes in the ROM's hack directory. The original is never modified. The copy is for the user's own use; jeROMy never distributes ROMs. Load it with scripts/mesen-up.sh <path> to prove the hack from a clean start.",
    input_schema: {
      type: "object",
      properties: {
        rom_path: { type: "string", description: "Path to the original ROM file if the one Mesen reported is not readable from here" },
        name: { type: "string", description: "Output file name (default: <rom name>.hacked.nes)" },
      },
      required: [],
    },
  },
  {
    name: "reapply_edits",
    description:
      "Put the ledgered ROM edits back into the emulator after Mesen reloaded the ROM (restart, reload, ROM handoff): the ledger is a file and survives, the emulator's PRG/CHR copy comes back clean. Reads each entry first and writes only the ones whose bytes are missing; never runs on its own. With check: true it only reports which entries are present or missing.",
    input_schema: {
      type: "object",
      properties: {
        check: { type: "boolean", description: "Report only; write nothing" },
      },
      required: [],
    },
  },
  {
    name: "undo_edit",
    description:
      "Undo one ledgered ROM edit by its seq (see edits.json or the ledger field of the write's result): writes the old bytes back into the emulator's ROM copy, confirms by reading them, and removes the entry. Does not reset; call reset_emulator afterwards if the game has already copied the bytes somewhere (palette RAM, for instance).",
    input_schema: {
      type: "object",
      properties: { seq: { type: "number", description: "Ledger entry number" } },
      required: ["seq"],
    },
  },
  {
    name: "trace_writes",
    description:
      "Find the code that writes (or reads) a memory address: installs a callback on the range for N frames (default 60, max 600) and returns each writing PC with its count, last value, up to 8 samples, and where that PC lives in the ROM (prgRom offset) so you can disassemble around it. Use it when search_memory is ambiguous or when you need the routine that copies a table into RAM/palette RAM. Refused while paused (frames must run); the game must actually perform the write during the window, so trigger the event (resume, play, or reset) first.",
    input_schema: {
      type: "object",
      properties: {
        address: { type: "number", description: "Start address (CPU space by default)" },
        length: { type: "number", description: "Bytes in the range (default 1, max 256)" },
        mem_type: { type: "string", description: "cpu (default), or ppu for PPU address space (e.g. palette RAM 0x3F01)" },
        frames: { type: "number", description: "Frames to watch (default 60, max 600)" },
        mode: { type: "string", enum: ["write", "read"], description: "Default write" },
      },
      required: ["address"],
    },
  },
  {
    name: "reset_emulator",
    description:
      "Soft-reset the console (like the RESET button). Palette overrides are cleared first. A ROM edit that is still visible after a reset is persistent in the emulator's copy of the ROM; a RAM or palette edit is gone. Use it to prove an edit survived before exporting it.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_pixel_color",
    description:
      "The rendered color at a screen pixel: RGB plus the nearest NES master-palette index and its hue name. Ground truth regardless of scroll splits; use it to check which palette a clicked object really uses (its color must be one of that palette's four entries).",
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
      "Stop re-applying frozen palette colors and put back the color each slot had before its first override (pass restore: false to only unfreeze). Clears one slot (palette_id + color_index), one palette, or everything.",
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
                restore: { type: "boolean", description: "Default true: write the pre-override color back" },
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
        reason: { type: "string", description: "Why (for the edit ledger when the target is PRG/CHR ROM)" },
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
    description: "Snapshot the whole emulator (RAM, PPU, CPU; not PRG/CHR ROM edits) into a slot held by the running bridge script, so load_state can roll back gameplay state. Slots vanish when Mesen reloads the script. While paused one frame runs so the snapshot can be taken. For ROM edits use the ledger (undo_edit).",
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
      "Restore a slot saved with save_state in this bridge session, or a save state file the person made in Mesen (gameplay state only; ledgered ROM edits stay). While paused one frame runs so the restore can happen.",
    input_schema: {
      type: "object",
      properties: {
        slot: {
          type: "number",
          description: "Save state slot number (default: 0)",
        },
        file: {
          type: "string",
          description: "A file name in Mesen's SaveStates folder, e.g. \"Legend of Zelda, The (USA)_1.mss\" (Mesen's Shift+F1 writes slot 1 there); takes the place of slot",
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
        reason: { type: "string", description: "Why (for the edit ledger when the target is PRG/CHR ROM)" },
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
        reason: { type: "string", description: "Why (for the edit ledger when the target is PRG/CHR ROM)" },
      },
      required: ["pixels", "x", "y", "start_tile_id"],
    },
  },
  {
    name: "record_mapping",
    description:
      "Record a discovery about the ROM — what a tile is, what a palette is used for, what a memory address controls, a scene, a level's data, a routine, or a note (ADR-0021). These discoveries are saved to the session and can later be promoted to a shareable mapping file. For a multi-byte variable give length and format (the timer as three BCD digits: length 3, format digits); for a per-slot array give stride and count; for a tile give table so the key names the picture, not just the id.",
    input_schema: {
      type: "object",
      properties: {
        mapping_type: {
          type: "string",
          enum: ["tile", "palette", "sprite", "address", "scene", "level", "routine", "note"],
          description: "What kind of thing you're mapping: scene (a distinct visual state), level (one level's data in PRG, ranges in rom_origins), routine (code, id = entry PC), note (anything else worth keeping)",
        },
        id: {
          type: "string",
          description:
            "Identifier: tile ID (hex, e.g. '0xB4'), palette ID, sprite name, address (hex), scene name ('title'), level name ('1-1'), routine entry PC (hex), or a note's topic",
        },
        table: {
          type: "number",
          description: "Tiles: the pattern table the tile is drawn from, 0 ($0000) or 1 ($1000). The entry is then keyed chr:0x1B4, which names one picture.",
        },
        length: {
          type: "number",
          description: "Addresses: how many bytes from id are this one thing (the score's six digits: 6). Routines: bytes from the entry, when known.",
        },
        stride: { type: "number", description: "Addresses: a per-slot array's spacing in bytes (with count)" },
        count: { type: "number", description: "Addresses: how many slots the array has (with stride)" },
        format: {
          type: "string",
          description: "Addresses: how the value is stored: binary, bcd, digits (one decimal digit per byte), minus-one (shown value minus one), signed, flags, or a short phrase",
        },
        reach: { type: "string", description: "Scenes: how to get there (a play_input script, a save state, 'Start on the title')" },
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
        source: {
          type: "string",
          description: "Where the lead came from when it was not your own discovery: a reference label (\"smbdis via threecreepio ca65 port\"), a wiki (\"Data Crystal RAM map, GFDL 1.2\"), or omit. The emulator observation is still required for confidence 1 (ADR-0017).",
        },
        rom_origins: {
          type: "array",
          description: "Where the bytes live in the cartridge, once found (search_memory / trace_writes): [{mem: 'prgRom'|'chrRom', offset, length, notes?}]. Next time, a persistent edit goes straight there.",
          items: {
            type: "object",
            properties: {
              mem: { type: "string", enum: ["prgRom", "chrRom"] },
              offset: { type: "number", description: "ROM offset within that memory, no iNES header" },
              length: { type: "number" },
              notes: { type: "string" },
            },
            required: ["mem", "offset", "length"],
          },
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
    name: "play_input",
    description:
      "Play the game for the model: hold buttons for a number of frames, as a script of segments run in real time by the plugin (ADR-0019). E.g. [{buttons:['right'],frames:60},{buttons:['right','a'],frames:20}] runs right for a second then jumps. At most 600 frames (10 s) per call; chain calls for longer. A paused game is resumed for the run and paused again at the end (the result says was_paused). Optional watch: up to 16 CPU addresses sampled at the end of each frame (thinned to 60 samples on long runs), so a run doubles as a measurement: watch candidate addresses while holding right and the one that climbs steadily is the X position. This tool runs frames; use it to make a value change between two snapshot_memory calls, to reach a screen, or to trigger a routine while trace_writes watches.",
    input_schema: {
      type: "object",
      properties: {
        script: {
          type: "array",
          description: "Segments in order; each holds exactly these buttons for that many frames (buttons: a, b, select, start, up, down, left, right; [] releases everything).",
          items: {
            type: "object",
            properties: {
              buttons: { type: "array", items: { type: "string" } },
              frames: { type: "number" },
            },
            required: ["buttons", "frames"],
          },
        },
        port: { type: "number", description: "Controller port, default 0 (player 1)." },
        watch: { type: "array", items: { type: "number" }, description: "CPU addresses to sample each frame (max 16)." },
      },
      required: ["script"],
    },
  },
  {
    name: "snapshot_memory",
    description:
      "Take a named snapshot of a memory range for differential search (ADR-0019). Default: the NES's 2 KiB of internal RAM ($0000-$07FF) read without side effects. Returns the name, range, and a checksum, not the bytes. Take one, make something happen (play_input, or ask the user to play), take another, then diff_memory. Reusing a name replaces that snapshot. Session-only: snapshots are not saved anywhere.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Short label, e.g. 'before', 'after_coin', 's3'." },
        address: { type: "number", description: "Start address (default 0)." },
        length: { type: "number", description: "Bytes (default 2048). Battery SRAM: address 0x6000, length 0x2000." },
        mem_type: { type: "string", description: "Memory to read (default cpuDebug, which has no read side effects)." },
      },
      required: ["name"],
    },
  },
  {
    name: "diff_memory",
    description:
      "Compare two snapshots and keep the addresses that moved the way an action predicts (ADR-0019). filter: changed, unchanged, increased, decreased, or equals (with value, e.g. equals 2 after losing a life from 3). Narrow round by round: pass name to keep this diff's survivors, then from with that name on the next diff so only they are considered. Returns up to 64 hits with old and new values plus the survivor count; each hit carries a reference symbol as a lead when one is imported (unverified until proven). Prove a candidate by write_memory and a screenshot before record_mapping, with source 'differential search'.",
    input_schema: {
      type: "object",
      properties: {
        a: { type: "string", description: "Earlier snapshot name." },
        b: { type: "string", description: "Later snapshot name." },
        filter: { type: "string", enum: ["changed", "unchanged", "increased", "decreased", "equals"] },
        value: { type: "number", description: "For filter equals: the value the later snapshot must hold." },
        from: { type: "string", description: "Only consider the survivors of this earlier named diff." },
        name: { type: "string", description: "Keep this diff's survivors under this name for the next round." },
      },
      required: ["a", "b", "filter"],
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
/** Lua scans at most 64 KiB per request (watchdog); chunks overlap by the pattern length so no hit straddling a boundary is lost. */
const SEARCH_CHUNK = 64 * 1024;

export async function searchMemoryAll(
  adapter: MesenAdapter,
  pattern: number[],
  memType: MemoryType,
  opts: { start?: number; length?: number; maxResults?: number },
): Promise<SearchMemoryResult> {
  const maxResults = opts.maxResults ?? 64;
  const start = opts.start ?? 0;
  const first = await adapter.searchMemory(pattern, memType, { start, length: Math.min(opts.length ?? SEARCH_CHUNK, SEARCH_CHUNK), maxResults });
  const end = Math.min(first.memory_size, opts.length !== undefined ? start + opts.length : first.memory_size);
  const offsets = [...first.offsets];
  let searched = first.searched;
  let truncated = first.truncated;
  let next = start + first.searched - (pattern.length - 1);
  while (!truncated && offsets.length < maxResults && next + pattern.length <= end) {
    const length = Math.min(SEARCH_CHUNK, end - next);
    const part = await adapter.searchMemory(pattern, memType, { start: next, length, maxResults: maxResults - offsets.length });
    for (const o of part.offsets) if (!offsets.includes(o)) offsets.push(o);
    searched += Math.max(0, part.searched - (pattern.length - 1));
    truncated = part.truncated;
    if (part.searched <= pattern.length - 1) break;
    next += part.searched - (pattern.length - 1);
  }
  return { ...first, start, searched, offsets, truncated: truncated || offsets.length >= maxResults && next + pattern.length <= end };
}

/** The imported reference for the loaded ROM, read from the hack directory on each use so a fresh import needs no restart (ADR-0017). */
function referenceFor(ledger: EditLedger | null | undefined): ReferenceFile | null {
  if (blindMode()) return null;
  const dir = ledger?.gameDir ?? ledger?.dir;
  if (!dir) return null;
  try { return loadReference(dir); } catch { return null; }
}

/** `symbol` for a code address: the nearest reference label and the distance, always marked as a lead. */
/**
 * A lead for a RAM address: exact equates only. The reference cannot tell a
 * constant from an address (`DeathMusic = 1` and `FrameCounter = $09` are
 * both equates), so small values carry several names and every name is
 * listed; a nearest-label hint as used for code PCs would label every byte.
 */
function ramSymbolHint(ref: ReferenceFile, address: number): { symbols?: string[] } {
  const names = ref.symbols.filter((s) => s.address === address).map((s) => s.name);
  return names.length ? { symbols: names.slice(0, 6) } : {};
}

function symbolHint(ref: ReferenceFile, address: number): { symbol?: string } {
  const near = nearestSymbol(ref.symbols, address, 0x400);
  if (!near) return {};
  return { symbol: `${near.symbol.name}${near.offset ? `+$${near.offset.toString(16).toUpperCase()}` : ""} (reference, unverified)` };
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  adapter: MesenAdapter,
  disassembler?: Disassembler | null,
  mapping?: GameMapping | null,
  imageStore?: Map<string, StoredImage> | null,
  ledger?: EditLedger | null,
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
      const result = await lookupTileAtPixel(adapter, input.x as number, input.y as number, {
        precise: input.precise === undefined ? true : Boolean(input.precise),
      });
      return { type: "text", text: JSON.stringify(result) };
    }

    case "get_region": {
      const mode = input.mode === "object" ? "object" : "color";
      const { runs: _runs, ...region } = await getRegionAt(adapter, input.x as number, input.y as number, mode);
      return { type: "text", text: JSON.stringify(region) };
    }

    case "list_hacks": {
      if (!ledger) return { type: "text", text: "Error: no hack directory for this ROM (bridge not connected or ROM unknown)" };
      return { type: "text", text: JSON.stringify({ game_dir: ledger.gameDir, active: ledger.hackName, hacks: ledger.listHacks() }) };
    }

    case "new_hack": {
      if (!ledger) return { type: "text", text: "Error: no hack directory for this ROM (bridge not connected or ROM unknown)" };
      const hackName = String(input.name ?? "").trim();
      try {
        const created = ledger.createHack(hackName, typeof input.description === "string" ? input.description : "");
        return { type: "text", text: JSON.stringify({ created, active: ledger.hackName, note: `Call use_hack ${hackName} to switch the emulator and the ledger to it.` }) };
      } catch (err) {
        return { type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` };
      }
    }

    case "use_hack": {
      if (!ledger) return { type: "text", text: "Error: no hack directory for this ROM (bridge not connected or ROM unknown)" };
      try {
        const report = await switchHack(adapter, ledger as unknown as Parameters<typeof switchHack>[1], String(input.name ?? "").trim());
        const note = report.from === report.to ? "Already the active hack."
          : report.reset ? "Reverted the previous hack's bytes, wrote this one's, and reset; take a screenshot to see it."
          : "Switched: both ledgers are empty, so the emulator's bytes are unchanged; ROM writes now ledger into this hack.";
        return { type: "text", text: JSON.stringify({ ...report, note }) };
      } catch (err) {
        return { type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` };
      }
    }

    case "lookup_symbol": {
      const ref = referenceFor(ledger);
      if (blindMode()) return { type: "text", text: "Blind calibration session (JEROMY_BLIND=1): the reference is held back so the method is measured without it. Find the address by snapshot_memory, play_input and diff_memory, prove it with write_memory and a screenshot, and record it; the score script compares afterwards." };
      if (!ref) return { type: "text", text: "No reference imported for this ROM. Import one with scripts/import-reference.mjs (a disassembly's .dbg or .asm, or a wiki table) into the hack directory; until then, discover addresses with search_memory, trace_writes and snapshot comparisons." };
      const credit = `Reference: ${ref.source} (${ref.symbols.length} symbols; unverified leads, not mappings).`;
      if (typeof input.name === "string" && input.name.trim()) {
        const hits = findSymbols(ref.symbols, input.name.trim());
        return { type: "text", text: hits.length ? `${credit}\n${hits.map(formatSymbol).join("\n")}` : `${credit}\nNo symbol matches "${input.name}".` };
      }
      if (typeof input.address === "number") {
        const near = nearestSymbol(ref.symbols, input.address, (input.max_distance as number | undefined) ?? 0x400);
        const hex = `$${input.address.toString(16).toUpperCase().padStart(4, "0")}`;
        return { type: "text", text: near
          ? `${credit}\n${hex} is ${near.offset === 0 ? "exactly" : `$${near.offset.toString(16).toUpperCase()} bytes after`} ${formatSymbol(near.symbol)}`
          : `${credit}\nNo symbol within the search distance below ${hex}.` };
      }
      return { type: "text", text: "Error: give name or address" };
    }

    case "list_sprites": {
      const at = input.x !== undefined && input.y !== undefined ? { x: Number(input.x), y: Number(input.y) } : undefined;
      const result = await adapter.getSprites(at);
      return { type: "text", text: JSON.stringify(result) };
    }

    case "search_memory": {
      let pattern = input.pattern as number[] | undefined;
      if (!pattern && typeof input.hex === "string") {
        pattern = input.hex.trim().split(/[\s,]+/).filter(Boolean).map((tok) => {
          if (/^\?\?$|^\*$|^xx$/i.test(tok)) return -1;
          const v = parseInt(tok.replace(/^(0x|\$)/i, ""), 16);
          if (Number.isNaN(v) || v < 0 || v > 255) throw new Error(`search_memory: bad hex byte "${tok}"`);
          return v;
        });
      }
      if (!pattern || pattern.length === 0) return { type: "text", text: "Error: give pattern (array of bytes, -1 = wildcard) or hex (\"22 29 1A 0F\")" };
      if (pattern.every((b) => b === -1)) return { type: "text", text: "Error: pattern is all wildcards" };
      const result = await searchMemoryAll(adapter, pattern, (input.mem_type as any) ?? "prgRom", {
        start: input.start as number | undefined,
        length: input.length as number | undefined,
        maxResults: input.max_results as number | undefined,
      });
      const hexOffsets = result.offsets.map((o) => `0x${o.toString(16).toUpperCase()}`);
      return { type: "text", text: JSON.stringify({ ...result, offsets_hex: hexOffsets }) };
    }

    case "export_patch":
    case "export_rom": {
      if (!ledger) return { type: "text", text: "Error: no hack directory for this ROM (bridge not connected or ROM unknown)" };
      const info = await adapter.getRomInfo();
      const romPath = (input.rom_path as string | undefined) ?? windowsPathToWsl(info.path ?? "");
      if (!romPath || !existsSync(romPath)) {
        return { type: "text", text: `Error: original ROM file not found at ${JSON.stringify(romPath)} (Mesen reported ${JSON.stringify(info.path)}); pass rom_path` };
      }
      const original = new Uint8Array(readFileSync(romPath));
      const fileSha1 = createHash("sha1").update(original).digest("hex").toUpperCase();
      const notes: string[] = [];
      if (info.sha1 && info.sha1.toUpperCase() !== fileSha1) {
        // Mesen hashes the ROM data without the header; the file hash differs by design. Warn only on a header-less mismatch too.
        const headerless = createHash("sha1").update(original.subarray(inesLayout(original).prgStart)).digest("hex").toUpperCase();
        if (headerless !== info.sha1.toUpperCase()) notes.push(`WARNING: ${basename(romPath)} does not hash to the ROM Mesen reported (${info.sha1}); is it the same file?`);
      }
      const edits = ledger.readEdits();
      if (edits.length === 0) return { type: "text", text: "Error: the edit ledger is empty; nothing to export (RAM, palette and CHR RAM writes are not persistent edits)" };
      const target = applyEdits(original, edits);
      ledger.ensureDir();
      if (name === "export_rom") {
        // The hacked ROM is for the person's own emulator; it is gitignored by the root's .gitignore (ADR-0018).
        const outName = (input.name as string | undefined) ?? `${ledger.hackName}.hacked.nes`;
        const outPath = join(ledger.dir, outName);
        writeFileSync(outPath, target);
        return { type: "text", text: JSON.stringify({ hack: ledger.hackName, written: outPath, bytes: target.length, edits_applied: edits.length, original_untouched: romPath, sha1: createHash("sha1").update(target).digest("hex").toUpperCase(), notes }) };
      }
      const format = ((input.format as string | undefined) ?? "ips").toLowerCase();
      // Exports are versioned per hack and never overwritten (ADR-0018).
      const version = ledger.nextVersion();
      const outPath = join(ledger.dir, (input.name as string | undefined) ? `${input.name}.${format}` : `${ledger.hackName}-v${version}.${format}`);
      let patchBytes: Uint8Array;
      if (format === "bps") {
        patchBytes = encodeBps(original, target, JSON.stringify({ tool: "jeROMy", rom: info.name, edits: edits.length }));
        const check = applyBps(original, patchBytes).target;
        if (Buffer.compare(Buffer.from(check), Buffer.from(target)) !== 0) return { type: "text", text: "Error: BPS self-check failed; patch not written" };
      } else if (format === "ips") {
        patchBytes = encodeIps(original, target);
        const check = applyIps(original, patchBytes);
        if (Buffer.compare(Buffer.from(check), Buffer.from(target)) !== 0) return { type: "text", text: "Error: IPS self-check failed; patch not written" };
      } else {
        return { type: "text", text: `Error: unknown format ${format}; use ips or bps` };
      }
      writeFileSync(outPath, patchBytes);
      const exportRecord = ledger.recordExport(outPath, format, edits.length);
      let verify: Record<string, unknown> | undefined;
      if (input.verify) {
        const layout = inesLayout(original);
        const differences: Array<{ mem: string; offset: number; emulator: number; ledger: number }> = [];
        for (const [mem, size, start] of [["prgRom", layout.prgSize, layout.prgStart], ["chrRom", layout.chrSize, layout.chrStart]] as const) {
          for (let off = 0; off < size && differences.length < 64; off += 4096) {
            const len = Math.min(4096, size - off);
            const dump = await adapter.readMemory(off, len, mem);
            for (let i = 0; i < len && differences.length < 64; i++) {
              if (dump.bytes[i] !== target[start + off + i]) differences.push({ mem, offset: off + i, emulator: dump.bytes[i], ledger: target[start + off + i] });
            }
          }
        }
        verify = { bytes_compared: layout.prgSize + layout.chrSize, differences, note: differences.length ? "the emulator holds edits the ledger does not; they are not in the patch" : "emulator matches the ledger" };
      }
      return { type: "text", text: JSON.stringify({ hack: ledger.hackName, version: exportRecord.version, written: outPath, format, bytes: patchBytes.length, edits: edits.length, target_crc32: crc32(target).toString(16).toUpperCase().padStart(8, "0"), original_untouched: romPath, ...(verify ? { verify } : {}), notes }) };
    }

    case "reapply_edits": {
      if (!ledger) return { type: "text", text: "Error: no hack directory for this ROM (bridge not connected or ROM unknown)" };
      const before = await ledgerDivergence(adapter, ledger);
      if (input.check || before.missing.length === 0) {
        return { type: "text", text: JSON.stringify({ ...before, applied: [], note: before.missing.length ? "entries missing from the emulator; call again without check to write them" : "the emulator holds every ledgered edit" }) };
      }
      const edits = ledger.readEdits();
      const applied: number[] = [];
      const failed: Array<{ seq: number; read_back: number[] }> = [];
      for (const seq of before.missing) {
        const e = edits.find((x) => x.seq === seq);
        if (!e) continue;
        // Direct adapter write: this re-applies existing entries, it does not ledger new ones.
        await adapter.writeMemory(e.offset, e.new, e.mem);
        const back = await adapter.readMemory(e.offset, e.length, e.mem);
        if (back.bytes.every((b, i) => b === e.new[i])) applied.push(seq); else failed.push({ seq, read_back: back.bytes });
      }
      return { type: "text", text: JSON.stringify({ total: before.total, were_present: before.present, applied, failed, note: "Reset the emulator (reset_emulator) so the game re-reads the patched tables." }) };
    }

    case "undo_edit": {
      if (!ledger) return { type: "text", text: "Error: no hack directory for this ROM (bridge not connected or ROM unknown)" };
      const seq = input.seq as number;
      const entry = ledger.readEdits().find((e) => e.seq === seq);
      if (!entry) return { type: "text", text: `Error: no ledger entry with seq ${seq}` };
      // Direct adapter write on purpose: an undo must not ledger an inverse entry (ADR-0009).
      await adapter.writeMemory(entry.offset, entry.old, entry.mem);
      const back = await adapter.readMemory(entry.offset, entry.length, entry.mem);
      const restored = back.bytes.every((b, i) => b === entry.old[i]);
      if (!restored) return { type: "text", text: JSON.stringify({ undone: false, seq, error: "read-back does not match the old bytes; ledger entry kept", read_back: back.bytes, expected: entry.old }) };
      ledger.removeEdit(seq);
      return { type: "text", text: JSON.stringify({ undone: true, seq, mem: entry.mem, offset: entry.offset, restored: entry.old, remaining_edits: ledger.readEdits().length, note: "Reset the emulator if the game already copied these bytes elsewhere." }) };
    }

    case "trace_writes": {
      const result = await adapter.traceWrites({
        address: input.address as number,
        length: input.length as number | undefined,
        memType: input.mem_type as MemoryType | undefined,
        frames: input.frames as number | undefined,
        mode: input.mode as "write" | "read" | undefined,
      });
      const ref = referenceFor(ledger);
      const writers = result.writers.map((w) => ({
        ...(ref ? symbolHint(ref, w.pc) : {}),
        ...w,
        pc_hex: `0x${w.pc.toString(16).toUpperCase().padStart(4, "0")}`,
        ...(w.origin ? { origin_hex: `${w.origin.mem_type ?? w.origin.mem_type_id} 0x${w.origin.address.toString(16).toUpperCase()}` } : {}),
      }));
      const note = result.writers.length === 0
        ? "No access in the window: the game did not touch this range; trigger the event (resume, reset_emulator, play) and trace again."
        : "Disassemble around a writer's pc (CPU address) to see what it copies from; origin_hex is that code's ROM offset.";
      return { type: "text", text: JSON.stringify({ ...result, writers, note }) };
    }

    case "reset_emulator": {
      const result = await adapter.resetEmulator();
      return { type: "text", text: JSON.stringify({ ...result, note: "Reset done. Take a screenshot to confirm what survived; RAM and palette edits are gone, ROM edits in the emulator's copy remain." }) };
    }

    case "get_pixel_color": {
      const px = await adapter.getPixelColor(input.x as number, input.y as number);
      const nes = nearestNesColor([px.r, px.g, px.b]);
      return {
        type: "text",
        text: JSON.stringify({
          x: px.x,
          y: px.y,
          rgb: [px.r, px.g, px.b],
          nes_color: nes,
          nes_color_hex: `0x${nes.toString(16).toUpperCase().padStart(2, "0")}`,
          name: nesColorName(nes),
        }),
      };
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
        input.color_index as number | undefined,
        input.restore === undefined ? undefined : Boolean(input.restore)
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
      const memType = ((input.mem_type as string) ?? "cpu") as MemoryType;
      const address = input.address as number;
      const bytes = input.bytes as number[];
      if (isRomMemory(memType)) {
        // Persistent edit: read-before / read-back around the write, then ledger (ADR-0009).
        let result: unknown;
        const outcome = await ledgeredRomWrite(adapter, ledger, "write_memory", memType, address, bytes.length, async () => {
          result = await adapter.writeMemory(address, bytes, memType);
        }, input.reason as string | undefined);
        return { type: "text", text: JSON.stringify({ ...(result as object), persistent: true, ledger: outcome.entry ? { seq: outcome.entry.seq, file: ledger?.editsFile } : null, ...(outcome.ledgerError ? { ledger_warning: outcome.ledgerError } : {}) }) };
      }
      const result = await adapter.writeMemory(address, bytes, memType);
      return { type: "text", text: JSON.stringify({ ...result, persistent: false }) };
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
      const result = await adapter.loadState((input.slot as number) ?? 0, input.file as string | undefined);
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

      let result!: Awaited<ReturnType<MesenAdapter["writeChrTile"]>>;
      let warning = "";
      if (target === "chrRom") {
        const outcome = await ledgeredRomWrite(adapter, ledger, "write_tile", "chrRom", tileId * 16, 16, async () => {
          result = await adapter.writeChrTile(tileId, pixels, target);
        }, input.reason as string | undefined);
        warning = ` Persistent: this patches CHR ROM in the emulator's copy.${describeLedger(outcome, ledger)}`;
      } else {
        result = await adapter.writeChrTile(tileId, pixels, target);
      }
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
      const ledgerNotes: string[] = [];

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

          if (target === "chrRom") {
            const outcome = await ledgeredRomWrite(adapter, ledger, "write_sprite", "chrRom", tileId * 16, 16, async () => {
              await adapter.writeChrTile(tileId, chunk, target);
            }, input.reason as string | undefined);
            ledgerNotes.push(outcome.entry ? `#${outcome.entry.seq}` : `tile ${tileId} not ledgered (${outcome.ledgerError})`);
          } else {
            await adapter.writeChrTile(tileId, chunk, target);
          }
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

      const unledgered = ledgerNotes.some((n) => n.includes("not ledgered"));
      const warning = target === "chrRom"
        ? ` Persistent: CHR ROM patched in the emulator's copy; ledger entries ${ledgerNotes.join(", ")}${ledger ? ` in ${ledger.editsFile}` : ""}.${unledgered ? " WARNING: not every tile is in the ledger; the edit cannot be exported or undone from it." : ""}`
        : "";
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
      const origins = Array.isArray(input.rom_origins) ? (input.rom_origins as Array<Record<string, unknown>>) : [];
      for (const o of origins) {
        if ((o.mem !== "prgRom" && o.mem !== "chrRom") || typeof o.offset !== "number" || typeof o.length !== "number" || o.length < 1) {
          return { type: "text", text: "Error: each rom_origins entry needs mem (prgRom|chrRom), offset and length ≥ 1" };
        }
      }
      const num = (k: string) => (typeof input[k] === "number" && Number.isFinite(input[k]) ? { [k]: input[k] as number } : {});
      const table = input.table === 0 || input.table === 1 ? (input.table as number) : undefined;
      const result = {
        mapping_type: input.mapping_type,
        id: input.mapping_type === "tile" ? tileKey(String(input.id), table) : input.id,
        name: input.name,
        ...(table !== undefined && input.mapping_type === "tile" ? { table } : {}),
        ...num("length"),
        ...num("stride"),
        ...num("count"),
        ...(typeof input.format === "string" && input.format.trim() ? { format: input.format.trim() } : {}),
        ...(typeof input.reach === "string" && input.reach.trim() ? { reach: input.reach.trim() } : {}),
        category: input.category ?? null,
        group: input.group ?? null,
        notes: input.notes ?? null,
        confidence,
        ...(origins.length ? { rom_origins: origins } : {}),
        ...(typeof input.source === "string" && input.source.trim() ? { source: input.source.trim() } : {}),
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

    case "play_input": {
      const script = input.script as Array<{ buttons: string[]; frames: number }>;
      if (!Array.isArray(script) || script.length === 0) return { type: "text", text: "Error: script must be a non-empty array of {buttons, frames}." };
      const result = await adapter.playInput({
        script: script.map((s) => ({ buttons: (s.buttons ?? []) as PadButton[], frames: Number(s.frames) })),
        port: input.port as number | undefined,
        watch: input.watch as number[] | undefined,
      });
      const ref = referenceFor(ledger);
      const watch = result.watch.map((w) => ({
        ...w,
        address_hex: `0x${w.address.toString(16).toUpperCase().padStart(4, "0")}`,
        ...(ref ? ramSymbolHint(ref, w.address) : {}),
      }));
      const note = `Ran ${result.frames_run} frames of input on port ${result.port}.${result.was_paused ? " The game was paused before and is paused again now." : " The game is still running."}${watch.length ? ` watch values are one sample every ${result.sample_every} frame(s), sample_frames gives their frame numbers.` : ""}`;
      return { type: "text", text: JSON.stringify({ ...result, watch, note }) };
    }

    case "snapshot_memory": {
      const store = snapshotsFor(adapter);
      const taken = await takeSnapshot(adapter, store, input.name as string, {
        address: input.address as number | undefined,
        length: input.length as number | undefined,
        mem_type: input.mem_type as MemoryType | undefined,
      });
      return { type: "text", text: JSON.stringify({ ...taken, snapshots: store.list().map((s) => s.name), note: "Bytes kept in the session, not shown. Make something happen, snapshot again, then diff_memory." }) };
    }

    case "diff_memory": {
      const store = snapshotsFor(adapter);
      const result = store.diff(input.a as string, input.b as string, input.filter as DiffFilter, {
        value: input.value as number | undefined,
        from: input.from as string | undefined,
        name: input.name as string | undefined,
      });
      const ref = referenceFor(ledger);
      const hits = result.hits.map((h) => ({
        ...h,
        address_hex: `0x${h.address.toString(16).toUpperCase().padStart(4, "0")}`,
        ...(ref ? ramSymbolHint(ref, h.address) : {}),
      }));
      const note = result.matched === 0
        ? "Nothing matched: the action may not have changed what you expected, or the value lives outside the snapshot range, or it is stored in a different form (BCD digits, offset by one, a countdown). Try changed on the same pair."
        : result.matched > hits.length
          ? `${result.matched} addresses survive, more than shown: narrow with another action and a diff with from: "${input.name ?? "<name this diff>"}".`
          : result.matched <= 8
            ? "Few enough to test: write_memory each candidate and look at the screen; a change the HUD shows is the proof."
            : "Narrow further with another action: keep this diff's name and pass it as from on the next.";
      const leads = ref ? " symbols are the reference's exact equates for that address, unverified; small addresses also collect constants that happen to share the value." : "";
      return { type: "text", text: JSON.stringify({ ...result, hits, note: note + leads }) };
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

/**
 * A tile's mapping key (ADR-0021): `chr:0x124` when the pattern table is known
 * (or the id is already above 0xFF), else the id as given. Never key a known
 * table's tile by its bare id: `0x24` is sky in one table and a slope in the other.
 */
export function tileKey(id: string, table?: number): string {
  const n = /^(0x|\$)?[0-9a-f]+$/i.test(id.trim()) ? parseInt(id.trim().replace(/^(0x|\$)/i, ""), 16) : NaN;
  if (!Number.isFinite(n) || n > 0x1ff) return id;
  if (n > 0xff) return `chr:0x${n.toString(16).toUpperCase().padStart(3, "0")}`;
  if (table === undefined) return id;
  return `chr:0x${(table * 256 + n).toString(16).toUpperCase().padStart(3, "0")}`;
}
