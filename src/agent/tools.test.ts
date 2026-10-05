import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HackStore } from "../hacks/store.js";
import { applyBps, applyIps } from "../hacks/patch.js";
import { agentTools, executeTool } from "./tools.js";

describe("agentTools", () => {
  it("defines the expected set of tools", () => {
    const names = agentTools.map((t) => t.name);
    expect(names).toContain("screenshot");
    expect(names).toContain("get_tile_at_pixel");
    expect(names).toContain("get_pixel_color");
    expect(names).toContain("list_sprites");
    expect(names).toContain("get_region");
    expect(names).toContain("search_memory");
    expect(names).toContain("reset_emulator");
    expect(names).toContain("trace_writes");
    expect(names).toContain("get_palette");
    expect(names).toContain("write_palette");
    expect(names).toContain("get_all_palettes");
    expect(names).toContain("clear_palette_overrides");
    expect(names).toContain("read_memory");
    expect(names).toContain("write_memory");
    expect(names).toContain("get_cpu_state");
    expect(names).toContain("get_rom_info");
    expect(names).toContain("save_state");
    expect(names).toContain("load_state");
    expect(names).toContain("disassemble");
    // Phase 4 tools
    expect(names).toContain("read_tile");
    expect(names).toContain("write_tile");
    expect(names).toContain("read_nametable");
    expect(names).toContain("write_nametable");
    expect(names).toContain("write_sprite");
    expect(names).toContain("record_mapping");
    // Emulator control tools
    expect(names).toContain("pause_emulator");
    expect(names).toContain("resume_emulator");
    expect(names).toContain("step_frame");
  });

  it("includes extract_sprite and find_unused_tiles tools", () => {
    const names = agentTools.map((t) => t.name);
    expect(names).toContain("extract_sprite");
    expect(names).toContain("find_unused_tiles");
  });

  it("each tool has name, description, and valid input_schema", () => {
    for (const tool of agentTools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.input_schema.type).toBe("object");
      expect(tool.input_schema.properties).toBeDefined();
    }
  });

  it("required tools have required params listed", () => {
    const tileAt = agentTools.find((t) => t.name === "get_tile_at_pixel");
    expect(tileAt!.input_schema.required).toEqual(["x", "y"]);

    const writePalette = agentTools.find((t) => t.name === "write_palette");
    expect(writePalette!.input_schema.required).toContain("palette_id");
    expect(writePalette!.input_schema.required).toContain("color_index");
    expect(writePalette!.input_schema.required).toContain("nes_color");

    const readMem = agentTools.find((t) => t.name === "read_memory");
    expect(readMem!.input_schema.required).toEqual(["address"]);
  });
});

describe("executeTool", () => {
  function mockAdapter(overrides: Record<string, any> = {}) {
    return {
      screenshot: vi.fn().mockResolvedValue({ png_base64: "AAAA" }),
      getTileAtPixel: vi.fn().mockResolvedValue({ tile_id: 1, palette_id: 0 }),
      // One vblank $2005 pair, no mid-frame writes: scroll 0, source "vblank".
      captureScrollWrites: vi.fn().mockResolvedValue({ frames: 1, stepped_frames: 0, start_frame: 0, end_frame: 1, other_register_writes: 0, final: { t: 0, v: 0, x: 0, w: false, scanline: 240, cycle: 0 }, writes: [{ frame: 0, scanline: 241, cycle: 10, reg: 5, value: 0, t: 0, v: 0, x: 0, w: false }, { frame: 0, scanline: 241, cycle: 20, reg: 5, value: 0, t: 0, v: 0, x: 0, w: true }] }),
      // (136,216,0) is SMB's pipe green as Mesen renders $29, sampled by the agent on 2026-10-05.
      getPixelColor: vi.fn().mockResolvedValue({ x: 176, y: 182, argb: 0xff88d800, r: 136, g: 216, b: 0 }),
      // SMB: background pattern table $1000, 8x8 sprites from $0000, nothing over the pixel (ADR-0013).
      getSprites: vi.fn().mockResolvedValue({ large_sprites: false, sprite_pattern_addr: 0, background_pattern_addr: 0x1000, sprites_enabled: true, count: 0, sprites: [] }),
      // A window of one background slot (ADR-0014).
      readRegion: vi.fn().mockImplementation(async (p: { x: number; y: number; w: number; h: number }) => {
        const n = p.w * p.h;
        return { ...p, large_sprites: false, background_pattern_addr: 0x1000, sprite_pattern_addr: 0, layer: Array(n).fill(1), palette: Array(n).fill(0), slot: Array(n).fill(1), tile: Array(n).fill(0x162), oam: Array(n).fill(-1) };
      }),
      searchMemory: vi.fn().mockResolvedValue({ mem_type: "prgRom", memory_size: 32768, start: 0, searched: 32768, offsets: [0x0cb4], truncated: false, pattern_length: 4 }),
      resetEmulator: vi.fn().mockResolvedValue({ reset: true, cleared_palette_overrides: 1 }),
      traceWrites: vi.fn().mockResolvedValue({ address: 0x75a, length: 1, mem_type: "cpu", mode: "write", frames: 60, total_accesses: 2, recorded_accesses: 2, truncated: false, writers: [{ pc: 0x9087, count: 2, last_value: 2, last_address: 0x75a, last_frame: 3, samples: [], origin: { address: 0x1087, mem_type: "prgRom", mem_type_id: 45 } }] }),
      getPalette: vi.fn().mockResolvedValue({ palette_id: 0, colors: [0, 1, 2, 3] }),
      writePalette: vi.fn().mockResolvedValue({ old_color: 0, new_color: 0x27 }),
      getAllPalettes: vi.fn().mockResolvedValue({ palettes: [] }),
      readMemory: vi.fn().mockResolvedValue({ bytes: [0, 1, 2] }),
      writeMemory: vi.fn().mockResolvedValue({ bytes_written: 3 }),
      getCpuState: vi.fn().mockResolvedValue({ a: 0, x: 0, y: 0, pc: 0x8000 }),
      getRomInfo: vi.fn().mockResolvedValue({ name: "Test ROM" }),
      clearPaletteOverrides: vi.fn().mockResolvedValue({ cleared: 4 }),
      saveState: vi.fn().mockResolvedValue({ slot: 0, action: "saved" }),
      loadState: vi.fn().mockResolvedValue({ slot: 0, action: "loaded" }),
      readChrTile: vi.fn().mockResolvedValue({
        tile_id: 0xB4,
        source: "chrRom",
        pixels: [
          [0, 0, 0, 0, 1, 1, 2, 2],
          [0, 0, 1, 1, 2, 2, 2, 2],
          [0, 1, 2, 2, 2, 2, 2, 2],
          [1, 2, 2, 2, 2, 2, 2, 2],
          [1, 2, 2, 2, 2, 2, 2, 2],
          [0, 1, 2, 2, 2, 2, 2, 2],
          [0, 0, 1, 1, 2, 2, 2, 2],
          [0, 0, 0, 0, 1, 1, 2, 2],
        ],
      }),
      writeChrTile: vi.fn().mockResolvedValue({
        tile_id: 0xB4,
        target: "chrRam",
        rows_written: 8,
      }),
      pauseEmulator: vi.fn().mockResolvedValue({ paused: true }),
      resumeEmulator: vi.fn().mockResolvedValue({ resumed: true }),
      stepFrame: vi.fn().mockResolvedValue({ stepped: 1, paused: true }),
      getEmulatorStatus: vi.fn().mockResolvedValue({ paused: false }),
      ...overrides,
    } as any;
  }

  it("screenshot returns an image content block", async () => {
    const adapter = mockAdapter();
    const result = await executeTool("screenshot", {}, adapter);

    expect(result.type).toBe("mixed");
    if (result.type === "mixed") {
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("image");
    }
  });

  it("screenshot while paused throws instead of returning an empty image", async () => {
    const adapter = mockAdapter({
      screenshot: vi.fn().mockResolvedValue({ png_base64: "", paused: true }),
    });
    await expect(executeTool("screenshot", {}, adapter)).rejects.toThrow(/paused.*resume_emulator/);
  });

  it("search_memory accepts a hex string with wildcards and reports hex offsets (ADR-0009)", async () => {
    const adapter = mockAdapter();
    const result = await executeTool("search_memory", { hex: "22 ?? 1A $0F" }, adapter);
    expect(adapter.searchMemory).toHaveBeenCalledWith([0x22, -1, 0x1a, 0x0f], "prgRom", { start: 0, length: 65536, maxResults: 64 });
    expect(JSON.parse((result as { text: string }).text).offsets_hex).toEqual(["0xCB4"]);
  });

  it("search_memory chains 64 KiB chunks with pattern overlap across a large memory (ADR-0009)", async () => {
    // 256 KiB PRG with one hit straddling the first chunk boundary at 0xFFFE.
    const adapter = mockAdapter({
      searchMemory: vi.fn().mockImplementation(async (pattern: number[], _mt: string, o: { start: number; length: number }) => {
        const hits = [0xfffe, 0x20000].filter((h) => h >= o.start && h + pattern.length <= o.start + o.length);
        return { mem_type: "prgRom", memory_size: 262144, start: o.start, searched: o.length, offsets: hits, truncated: false, pattern_length: pattern.length };
      }),
    });
    const result = await executeTool("search_memory", { pattern: [1, 2, 3, 4] }, adapter);
    const parsed = JSON.parse((result as { text: string }).text);
    expect(parsed.offsets).toEqual([0xfffe, 0x20000]);
    expect(adapter.searchMemory).toHaveBeenCalledTimes(5); // 65536 + 3 × 65533 + a 12-byte tail
    expect(adapter.searchMemory.mock.calls[1][2].start).toBe(65536 - 3);
    expect(parsed.searched).toBe(262144);
  });

  it("search_memory rejects an empty or all-wildcard pattern without calling the bridge", async () => {
    const adapter = mockAdapter();
    expect((await executeTool("search_memory", {}, adapter) as { text: string }).text).toMatch(/^Error/);
    expect((await executeTool("search_memory", { pattern: [-1, -1] }, adapter) as { text: string }).text).toMatch(/all wildcards/);
    expect(adapter.searchMemory).not.toHaveBeenCalled();
  });

  it("trace_writes passes the range and formats writer PCs with their ROM origin (ADR-0009)", async () => {
    const adapter = mockAdapter();
    const result = await executeTool("trace_writes", { address: 0x75a, frames: 60 }, adapter);
    expect(adapter.traceWrites).toHaveBeenCalledWith({ address: 0x75a, length: undefined, memType: undefined, frames: 60, mode: undefined });
    const parsed = JSON.parse((result as { text: string }).text);
    expect(parsed.writers[0]).toMatchObject({ pc_hex: "0x9087", origin_hex: "prgRom 0x1087" });
    expect(parsed.note).toContain("Disassemble");
  });

  it("reset_emulator calls the adapter and says what survives (ADR-0009)", async () => {
    const adapter = mockAdapter();
    const result = await executeTool("reset_emulator", {}, adapter);
    expect(adapter.resetEmulator).toHaveBeenCalled();
    expect((result as { text: string }).text).toContain("ROM edits");
  });

  it("get_pixel_color maps the rendered RGB to the nearest NES index and hue name (ADR-0010)", async () => {
    const adapter = mockAdapter();
    const result = await executeTool("get_pixel_color", { x: 176, y: 182 }, adapter);
    expect(adapter.getPixelColor).toHaveBeenCalledWith(176, 182);
    expect(result.type).toBe("text");
    const parsed = JSON.parse((result as { text: string }).text);
    expect(parsed).toMatchObject({ x: 176, y: 182, rgb: [136, 216, 0], nes_color: 0x29, nes_color_hex: "0x29", name: "lime green" });
  });

  it("get_tile_at_pixel precise:false uses the request-time scroll and says so", async () => {
    const adapter = mockAdapter();
    const result = await executeTool("get_tile_at_pixel", { x: 128, y: 120, precise: false }, adapter);
    expect(adapter.getTileAtPixel).toHaveBeenCalledWith(128, 120);
    expect(adapter.captureScrollWrites).not.toHaveBeenCalled();
    expect(JSON.parse((result as { text: string }).text).scroll_source).toBe("legacy");
  });

  it("get_tile_at_pixel captures a frame of scroll writes by default and reads the tile at the reconstructed address (ADR-0010)", async () => {
    const adapter = mockAdapter();
    const result = await executeTool("get_tile_at_pixel", { x: 128, y: 120 }, adapter);

    expect(adapter.captureScrollWrites).toHaveBeenCalledWith(1);
    expect(adapter.readMemory).toHaveBeenCalledWith(0x2000 + 15 * 32 + 16, 1, "ppuDebug");
    const parsed = JSON.parse((result as { text: string }).text);
    expect(parsed).toMatchObject({ tile_x: 16, tile_y: 15, scroll_x: 0, scroll_y: 0, nametable: 0, scroll_source: "vblank", stepped_frames: 0 });
    // ADR-0013: the pattern-space index and the on-screen cell ride along, and the sprite check ran at the pixel.
    expect(parsed).toMatchObject({ chr_tile: 0x100 + 0, screen_box: { x: 128, y: 120, width: 8, height: 8 }, sprites: [] });
    expect(adapter.getSprites).toHaveBeenCalledWith({ x: 128, y: 120 });
    expect(result.type).toBe("text");
  });

  it("get_region fills by slot from the bridge's pixel map and drops the runs from the model's text (ADR-0014)", async () => {
    const adapter = mockAdapter();
    const result = await executeTool("get_region", { x: 128, y: 120 }, adapter);
    expect(adapter.readRegion).toHaveBeenCalledWith(expect.objectContaining({ x: 96, y: 88, w: 64, h: 64 }));
    const parsed = JSON.parse((result as { text: string }).text);
    expect(parsed).toMatchObject({ mode: "color", layer: "background", palette: 0, slot: 1, pixel_count: 4096, truncated: true });
    expect(parsed.runs).toBeUndefined();
    expect(parsed.summary).toContain("slot 1 of background palette 0");
    const obj = await executeTool("get_region", { x: 128, y: 120, mode: "object" }, adapter);
    expect(JSON.parse((obj as { text: string }).text).mode).toBe("object");
  });

  it("list_sprites decodes OAM through the bridge, filtered to a pixel when given one (ADR-0013)", async () => {
    const adapter = mockAdapter();
    await executeTool("list_sprites", {}, adapter);
    expect(adapter.getSprites).toHaveBeenLastCalledWith(undefined);
    const result = await executeTool("list_sprites", { x: 116, y: 190 }, adapter);
    expect(adapter.getSprites).toHaveBeenLastCalledWith({ x: 116, y: 190 });
    expect(JSON.parse((result as { text: string }).text)).toMatchObject({ large_sprites: false, count: 0 });
  });

  it("write_palette passes all params correctly", async () => {
    const adapter = mockAdapter();
    await executeTool(
      "write_palette",
      { palette_id: 2, color_index: 1, nes_color: 0x27 },
      adapter
    );

    expect(adapter.writePalette).toHaveBeenCalledWith(2, 1, 0x27);
  });

  it("read_memory uses defaults for optional params", async () => {
    const adapter = mockAdapter();
    await executeTool("read_memory", { address: 0x2000 }, adapter);

    expect(adapter.readMemory).toHaveBeenCalledWith(0x2000, 1, "cpuDebug");
  });

  it("returns error text for unknown tools", async () => {
    const adapter = mockAdapter();
    const result = await executeTool("nonexistent_tool", {}, adapter);

    expect(result.type).toBe("text");
    if (result.type === "text") {
      expect(result.text).toContain("Unknown tool");
    }
  });

  it("clear_palette_overrides forwards restore:false and omits it by default", async () => {
    const adapter = mockAdapter();
    await executeTool("clear_palette_overrides", { palette_id: 1, color_index: 1, restore: false }, adapter);
    expect(adapter.clearPaletteOverrides).toHaveBeenLastCalledWith(1, 1, false);
    await executeTool("clear_palette_overrides", { palette_id: 1 }, adapter);
    expect(adapter.clearPaletteOverrides).toHaveBeenLastCalledWith(1, undefined, undefined);
  });

  it("clear_palette_overrides passes palette_id and color_index", async () => {
    const adapter = mockAdapter();
    const result = await executeTool(
      "clear_palette_overrides",
      { palette_id: 2, color_index: 1 },
      adapter
    );

    expect(adapter.clearPaletteOverrides).toHaveBeenCalledWith(2, 1, undefined);
    expect(result.type).toBe("text");
    if (result.type === "text") {
      expect(result.text).toContain("cleared");
    }
  });

  it("clear_palette_overrides works with no params (clear all)", async () => {
    const adapter = mockAdapter();
    await executeTool("clear_palette_overrides", {}, adapter);

    expect(adapter.clearPaletteOverrides).toHaveBeenCalledWith(undefined, undefined, undefined);
  });

  it("save_state defaults to slot 0", async () => {
    const adapter = mockAdapter();
    await executeTool("save_state", {}, adapter);
    expect(adapter.saveState).toHaveBeenCalledWith(0);
  });

  it("load_state passes slot param", async () => {
    const adapter = mockAdapter();
    await executeTool("load_state", { slot: 3 }, adapter);
    expect(adapter.loadState).toHaveBeenCalledWith(3);
  });

  describe("edit ledger (ADR-0009)", () => {
    function ledgerMock() {
      const entries: any[] = [];
      return { entries, editsFile: "/hacks/sha1-x/edits.json", appendEdit: vi.fn((e: any) => { const entry = { seq: entries.length + 1, at: "t", ...e }; entries.push(entry); return entry; }) };
    }
    // readMemory answers with as many bytes as asked, counting up from the address, so before/after differ.
    function romAdapter() {
      let writes = 0;
      return mockAdapter({
        readMemory: vi.fn().mockImplementation(async (addr: number, len: number, mem: string) => ({ address: addr, mem_type: mem, bytes: Array.from({ length: len }, (_, i) => (addr + i + writes) & 0xff) })),
        writeMemory: vi.fn().mockImplementation(async () => { writes++; return { bytes_written: 1 }; }),
        writeChrTile: vi.fn().mockImplementation(async () => { writes++; return { rows_written: 8 }; }),
      });
    }

    it("write_memory to prgRom reads before and after and ledgers the entry", async () => {
      const adapter = romAdapter(); const ledger = ledgerMock();
      const result = await executeTool("write_memory", { address: 0xccc, bytes: [0x16], mem_type: "prgRom", reason: "pipes red" }, adapter, null, null, null, ledger);
      expect(adapter.readMemory).toHaveBeenCalledWith(0xccc, 1, "prgRom");
      expect(ledger.appendEdit).toHaveBeenCalledWith({ tool: "write_memory", mem: "prgRom", offset: 0xccc, length: 1, old: [0xcc], new: [0xcd], reason: "pipes red" });
      const parsed = JSON.parse((result as { text: string }).text);
      expect(parsed).toMatchObject({ persistent: true, ledger: { seq: 1, file: "/hacks/sha1-x/edits.json" } });
    });

    it("write_memory to RAM is volatile and never touches the ledger", async () => {
      const adapter = romAdapter(); const ledger = ledgerMock();
      const result = await executeTool("write_memory", { address: 0x75a, bytes: [9], mem_type: "cpu" }, adapter, null, null, null, ledger);
      expect(ledger.appendEdit).not.toHaveBeenCalled();
      expect(adapter.readMemory).not.toHaveBeenCalled();
      expect(JSON.parse((result as { text: string }).text).persistent).toBe(false);
    });

    it("write_tile to chrRom ledgers the 16 tile bytes; chrRam does not", async () => {
      const adapter = romAdapter(); const ledger = ledgerMock();
      const pixels = Array.from({ length: 8 }, () => Array(8).fill(1));
      const text = ((await executeTool("write_tile", { tile_id: 0xb6, pixels, target: "chrRom" }, adapter, null, null, null, ledger)) as { text: string }).text;
      expect(ledger.appendEdit).toHaveBeenCalledTimes(1);
      expect(ledger.appendEdit.mock.calls[0][0]).toMatchObject({ tool: "write_tile", mem: "chrRom", offset: 0xb6 * 16, length: 16 });
      expect(ledger.appendEdit.mock.calls[0][0].old).toHaveLength(16);
      expect(text).toContain("Ledgered as edit #1");
      await executeTool("write_tile", { tile_id: 1, pixels, target: "chrRam" }, adapter, null, null, null, ledger);
      expect(ledger.appendEdit).toHaveBeenCalledTimes(1);
    });

    it("write_sprite to chrRom ledgers one entry per tile", async () => {
      const adapter = romAdapter(); const ledger = ledgerMock();
      const pixels = Array.from({ length: 16 }, () => Array(16).fill(2));
      const text = ((await executeTool("write_sprite", { pixels, x: 0, y: 0, start_tile_id: 0x40, target: "chrRom" }, adapter, null, null, null, ledger)) as { text: string }).text;
      expect(ledger.appendEdit).toHaveBeenCalledTimes(4);
      expect(text).toContain("ledger entries #1, #2, #3, #4");
    });

    it("reports a missing ledger instead of pretending the edit is recorded", async () => {
      const adapter = romAdapter();
      const parsed = JSON.parse(((await executeTool("write_memory", { address: 1, bytes: [1], mem_type: "chrRom" }, adapter)) as { text: string }).text);
      expect(parsed.ledger).toBeNull();
      expect(parsed.ledger_warning).toMatch(/no hack directory/);
    });
  });

  describe("export_patch / export_rom / undo_edit (ADR-0009)", () => {
    // A 16 KiB PRG + 8 KiB CHR iNES image on disk, a real HackStore in a temp dir, and an adapter whose
    // prgRom/chrRom reads come from a mutable copy of that image so undo's read-back is honest.
    function setup() {
      const root = mkdtempSync(join(tmpdir(), "jeromy-export-"));
      const rom = new Uint8Array(16 + 16384 + 8192);
      rom.set([0x4e, 0x45, 0x53, 0x1a, 1, 1, 0, 0]);
      for (let i = 16; i < rom.length; i++) rom[i] = (i * 7) & 0xff;
      const romPath = join(root, "Game (World).nes");
      writeFileSync(romPath, rom);
      const emu = new Uint8Array(rom); // the emulator's copy
      const store = new HackStore(root, "ABC123");
      const adapter = mockAdapter({
        getRomInfo: vi.fn().mockResolvedValue({ name: "Game (World).nes", path: romPath, sha1: "ABC123", format: "iNES" }),
        readMemory: vi.fn().mockImplementation(async (addr: number, len: number, mem: string) => {
          const base = mem === "prgRom" ? 16 : mem === "chrRom" ? 16 + 16384 : 0;
          return { address: addr, mem_type: mem, bytes: Array.from(emu.subarray(base + addr, base + addr + len)) };
        }),
        writeMemory: vi.fn().mockImplementation(async (addr: number, bytes: number[], mem: string) => {
          const base = mem === "prgRom" ? 16 : mem === "chrRom" ? 16 + 16384 : 0;
          emu.set(bytes, base + addr);
          return { bytes_written: bytes.length };
        }),
      });
      return { root, rom, romPath, emu, store, adapter };
    }

    it("export_patch writes an IPS that an independent applier turns into the ledgered ROM", async () => {
      const { rom, store, adapter } = setup();
      await executeTool("write_memory", { address: 0xccc, bytes: [0x16], mem_type: "prgRom", reason: "pipes red" }, adapter, null, null, null, store);
      await executeTool("write_memory", { address: 0x10, bytes: [1, 2, 3], mem_type: "chrRom" }, adapter, null, null, null, store);
      const out = JSON.parse(((await executeTool("export_patch", {}, adapter, null, null, null, store)) as { text: string }).text);
      expect(out.written).toBe(join(store.dir, "patch.ips"));
      expect(out.edits).toBe(2);
      const patched = applyIps(rom, new Uint8Array(readFileSync(out.written)));
      expect(patched[16 + 0xccc]).toBe(0x16);
      expect(Array.from(patched.subarray(16 + 16384 + 0x10, 16 + 16384 + 0x13))).toEqual([1, 2, 3]);
      expect(patched.length).toBe(rom.length);
    });

    it("export_patch bps carries CRCs and verify mode compares the emulator against the ledger", async () => {
      const { rom, store, adapter, emu } = setup();
      await executeTool("write_memory", { address: 0xccc, bytes: [0x16], mem_type: "prgRom" }, adapter, null, null, null, store);
      emu[16 + 0x200] ^= 0xff; // an edit made behind the ledger's back
      const out = JSON.parse(((await executeTool("export_patch", { format: "bps", verify: true }, adapter, null, null, null, store)) as { text: string }).text);
      expect(out.written.endsWith("patch.bps")).toBe(true);
      expect(applyBps(rom, new Uint8Array(readFileSync(out.written))).target[16 + 0xccc]).toBe(0x16);
      expect(out.verify.differences).toEqual([{ mem: "prgRom", offset: 0x200, emulator: emu[16 + 0x200], ledger: rom[16 + 0x200] }]);
    });

    it("export_rom writes <name>.hacked.nes beside the ledger and leaves the original byte-identical", async () => {
      const { rom, romPath, store, adapter } = setup();
      await executeTool("write_memory", { address: 0, bytes: [9], mem_type: "prgRom" }, adapter, null, null, null, store);
      const out = JSON.parse(((await executeTool("export_rom", {}, adapter, null, null, null, store)) as { text: string }).text);
      expect(out.written).toBe(join(store.dir, "Game (World).hacked.nes"));
      const hacked = new Uint8Array(readFileSync(out.written));
      expect(hacked[16]).toBe(9);
      expect(Buffer.compare(readFileSync(romPath), Buffer.from(rom))).toBe(0);
    });

    it("refuses to export an empty ledger or without a ROM file, and says so", async () => {
      const { store, adapter } = setup();
      expect(((await executeTool("export_patch", {}, adapter, null, null, null, store)) as { text: string }).text).toMatch(/ledger is empty/);
      await executeTool("write_memory", { address: 0, bytes: [9], mem_type: "prgRom" }, adapter, null, null, null, store);
      expect(((await executeTool("export_patch", { rom_path: "/nonexistent.nes" }, adapter, null, null, null, store)) as { text: string }).text).toMatch(/not found/);
      expect(((await executeTool("export_patch", {}, adapter)) as { text: string }).text).toMatch(/no hack directory/);
    });

    it("reapply_edits reports missing entries in check mode and writes only those otherwise (ADR-0009 carry-in)", async () => {
      const { store, adapter, emu } = setup();
      await executeTool("write_memory", { address: 0xccc, bytes: [0x16], mem_type: "prgRom" }, adapter, null, null, null, store);
      await executeTool("write_memory", { address: 0x10, bytes: [7, 8], mem_type: "chrRom" }, adapter, null, null, null, store);
      // Mesen reloaded the ROM: the emulator's copy loses the first edit.
      emu[16 + 0xccc] = (16 + 0xccc) * 7 & 0xff;
      const check = JSON.parse(((await executeTool("reapply_edits", { check: true }, adapter, null, null, null, store)) as { text: string }).text);
      expect(check).toMatchObject({ total: 2, present: [2], missing: [1], applied: [] });
      expect(emu[16 + 0xccc]).not.toBe(0x16);
      const applied = JSON.parse(((await executeTool("reapply_edits", {}, adapter, null, null, null, store)) as { text: string }).text);
      expect(applied).toMatchObject({ applied: [1], failed: [], were_present: [2] });
      expect(emu[16 + 0xccc]).toBe(0x16);
      expect(store.readEdits()).toHaveLength(2); // nothing re-ledgered
      expect(((await executeTool("reapply_edits", {}, adapter)) as { text: string }).text).toMatch(/no hack directory/);
    });

    it("undo_edit writes the old bytes back through the raw path, confirms, and removes the entry", async () => {
      const { store, adapter, emu } = setup();
      await executeTool("write_memory", { address: 0xccc, bytes: [0x16], mem_type: "prgRom" }, adapter, null, null, null, store);
      expect(emu[16 + 0xccc]).toBe(0x16);
      const out = JSON.parse(((await executeTool("undo_edit", { seq: 1 }, adapter, null, null, null, store)) as { text: string }).text);
      expect(out).toMatchObject({ undone: true, seq: 1, remaining_edits: 0 });
      expect(emu[16 + 0xccc]).toBe((16 + 0xccc) * 7 & 0xff);
      expect(store.readEdits()).toEqual([]);
      expect(((await executeTool("undo_edit", { seq: 1 }, adapter, null, null, null, store)) as { text: string }).text).toMatch(/no ledger entry/);
    });
  });

  it("write_memory passes bytes and default mem_type", async () => {
    const adapter = mockAdapter();
    await executeTool("write_memory", { address: 0x6000, bytes: [0xff, 0x00] }, adapter);
    expect(adapter.writeMemory).toHaveBeenCalledWith(0x6000, [0xff, 0x00], "cpu");
  });

  it("disassemble without disassembler returns unavailable message", async () => {
    const adapter = mockAdapter();
    // executeTool with no disassembler argument
    const result = await executeTool("disassemble", { address: 0x8000 }, adapter);
    expect(result.type).toBe("text");
    if (result.type === "text") {
      expect(result.text).toContain("not available");
    }
  });

  it("handles adapter errors gracefully when caught by caller", async () => {
    const adapter = mockAdapter({
      getCpuState: vi.fn().mockRejectedValue(new Error("bridge disconnected")),
    });

    await expect(executeTool("get_cpu_state", {}, adapter)).rejects.toThrow(
      "bridge disconnected"
    );
  });

  // -- Phase 4 Tool Tests ---------------------------------------------------

  it("read_tile returns ASCII art preview and pixel data", async () => {
    const adapter = mockAdapter();
    const result = await executeTool("read_tile", { tile_id: 0xB4 }, adapter);

    expect(adapter.readChrTile).toHaveBeenCalledWith(0xB4, "chrRom");
    expect(result.type).toBe("text");
    if (result.type === "text") {
      expect(result.text).toContain("$B4");
      // ASCII art uses . 1 2 3 characters
      expect(result.text).toContain(". . . . 1 1 2 2");
      expect(result.text).toContain("Raw pixels:");
    }
  });

  it("read_tile includes tile name from mapping", async () => {
    const adapter = mockAdapter();
    const mapping = {
      tiles: { "0xB4": { name: "cloud-top-left", category: "background" as const } },
    } as any;
    const result = await executeTool("read_tile", { tile_id: 0xB4 }, adapter, null, mapping);

    expect(result.type).toBe("text");
    if (result.type === "text") {
      expect(result.text).toContain("cloud-top-left");
    }
  });

  it("read_tile uses chrRam source when specified", async () => {
    const adapter = mockAdapter();
    await executeTool("read_tile", { tile_id: 10, source: "chrRam" }, adapter);
    expect(adapter.readChrTile).toHaveBeenCalledWith(10, "chrRam");
  });

  it("write_tile calls writeChrTile with correct params", async () => {
    const adapter = mockAdapter();
    const pixels = Array.from({ length: 8 }, () => Array(8).fill(0));
    pixels[0][0] = 3;

    const result = await executeTool(
      "write_tile",
      { tile_id: 0xB4, pixels, target: "chrRam" },
      adapter
    );

    expect(adapter.writeChrTile).toHaveBeenCalledWith(0xB4, pixels, "chrRam");
    expect(result.type).toBe("text");
  });

  it("write_tile warns when writing to chrRom", async () => {
    const adapter = mockAdapter();
    const pixels = Array.from({ length: 8 }, () => Array(8).fill(0));

    const result = await executeTool(
      "write_tile",
      { tile_id: 1, pixels, target: "chrRom" },
      adapter
    );

    expect(result.type).toBe("text");
    if (result.type === "text") {
      expect(result.text).toContain("CHR ROM");
    }
  });

  it("write_tile rejects invalid pixel grid dimensions", async () => {
    const adapter = mockAdapter();
    const badPixels = [[0, 0], [1, 1]]; // Only 2x2 instead of 8x8

    const result = await executeTool(
      "write_tile",
      { tile_id: 1, pixels: badPixels },
      adapter
    );

    expect(result.type).toBe("text");
    if (result.type === "text") {
      expect(result.text).toContain("Error");
      expect(result.text).toContain("8x8");
    }
  });

  it("read_nametable reads tile IDs from PPU memory", async () => {
    const adapter = mockAdapter({
      readMemory: vi.fn().mockResolvedValue({ bytes: [0x24] }),
    });
    const result = await executeTool(
      "read_nametable",
      { x: 0, y: 0, width: 2, height: 2 },
      adapter
    );

    expect(result.type).toBe("text");
    if (result.type === "text") {
      expect(result.text).toContain("Nametable 0");
      expect(result.text).toContain("24"); // tile ID in hex
    }
    // Should read both nametable and attribute bytes
    expect(adapter.readMemory).toHaveBeenCalled();
  });

  it("write_nametable writes tile IDs to PPU memory", async () => {
    const adapter = mockAdapter();
    const result = await executeTool(
      "write_nametable",
      { x: 0, y: 0, tile_ids: [[1, 2], [3, 4]] },
      adapter
    );

    expect(result.type).toBe("text");
    if (result.type === "text") {
      const parsed = JSON.parse(result.text);
      expect(parsed.tiles_written).toBe(4);
    }
    expect(adapter.writeMemory).toHaveBeenCalled();
  });

  it("record_mapping returns confirmation with event type", async () => {
    const adapter = mockAdapter();
    const result = await executeTool(
      "record_mapping",
      { mapping_type: "tile", id: "0xB4", name: "cloud-top-left", confidence: 1 },
      adapter
    );

    expect(result.type).toBe("text");
    if (result.type === "text") {
      const parsed = JSON.parse(result.text);
      expect(parsed.recorded).toBe(true);
      expect(parsed.event_type).toBe("mapping_discovered");
    }
  });

  it("record_mapping echoes validated rom_origins and rejects malformed ones (ADR-0009)", async () => {
    const adapter = mockAdapter();
    const ok = await executeTool("record_mapping", { mapping_type: "palette", id: "0", name: "p", rom_origins: [{ mem: "prgRom", offset: 0xccc, length: 1 }] }, adapter);
    expect(JSON.parse((ok as { text: string }).text).rom_origins).toEqual([{ mem: "prgRom", offset: 0xccc, length: 1 }]);
    const bad = await executeTool("record_mapping", { mapping_type: "palette", id: "0", name: "p", rom_origins: [{ mem: "cpu", offset: 1, length: 1 }] }, adapter);
    expect((bad as { text: string }).text).toMatch(/^Error/);
  });

  it("record_mapping returns hypothesis for low confidence", async () => {
    const adapter = mockAdapter();
    const result = await executeTool(
      "record_mapping",
      { mapping_type: "tile", id: "0x45", name: "maybe-question-block", confidence: 0.7 },
      adapter
    );

    expect(result.type).toBe("text");
    if (result.type === "text") {
      const parsed = JSON.parse(result.text);
      expect(parsed.event_type).toBe("mapping_hypothesis");
      expect(parsed.confidence).toBe(0.7);
    }
  });

  // -- Emulator Control Tool Tests -------------------------------------------

  it("pause_emulator calls adapter.pauseEmulator", async () => {
    const adapter = mockAdapter();
    const result = await executeTool("pause_emulator", {}, adapter);

    expect(adapter.pauseEmulator).toHaveBeenCalled();
    expect(result.type).toBe("text");
    if (result.type === "text") {
      const parsed = JSON.parse(result.text);
      expect(parsed.paused).toBe(true);
    }
  });

  it("resume_emulator calls adapter.resumeEmulator", async () => {
    const adapter = mockAdapter();
    const result = await executeTool("resume_emulator", {}, adapter);

    expect(adapter.resumeEmulator).toHaveBeenCalled();
    expect(result.type).toBe("text");
    if (result.type === "text") {
      const parsed = JSON.parse(result.text);
      expect(parsed.resumed).toBe(true);
    }
  });

  it("step_frame defaults count to 1", async () => {
    const adapter = mockAdapter();
    const result = await executeTool("step_frame", {}, adapter);

    expect(adapter.stepFrame).toHaveBeenCalledWith(1);
    expect(result.type).toBe("text");
    if (result.type === "text") {
      const parsed = JSON.parse(result.text);
      expect(parsed.stepped).toBe(1);
    }
  });

  it("step_frame passes explicit count", async () => {
    const adapter = mockAdapter({
      stepFrame: vi.fn().mockResolvedValue({ stepped: 10, paused: true }),
    });
    const result = await executeTool("step_frame", { count: 10 }, adapter);

    expect(adapter.stepFrame).toHaveBeenCalledWith(10);
    if (result.type === "text") {
      const parsed = JSON.parse(result.text);
      expect(parsed.stepped).toBe(10);
    }
  });

  // -- write_tile ASCII preview -----------------------------------------------

  it("write_tile returns ASCII art preview of written pixels", async () => {
    const adapter = mockAdapter();
    const pixels = Array.from({ length: 8 }, () => Array(8).fill(0));
    pixels[0][0] = 3;
    pixels[0][1] = 3;
    pixels[0][2] = 3;

    const result = await executeTool(
      "write_tile",
      { tile_id: 0x10, pixels, target: "chrRam" },
      adapter
    );

    expect(result.type).toBe("text");
    if (result.type === "text") {
      expect(result.text).toContain("Preview:");
      expect(result.text).toContain("3 3 3 . . . . .");
      expect(result.text).toContain("Wrote tile $10");
      expect(result.text).toContain("chrRam");
    }
  });

  // -- write_sprite -----------------------------------------------------------

  it("write_sprite splits 16x16 grid into 4 tiles and places in nametable", async () => {
    const adapter = mockAdapter();
    const pixels = Array.from({ length: 16 }, () => Array(16).fill(1));
    pixels[0][0] = 3; // top-left quadrant marker
    pixels[0][8] = 2; // top-right quadrant marker

    const result = await executeTool(
      "write_sprite",
      { pixels, x: 5, y: 10, start_tile_id: 0xF0, target: "chrRam" },
      adapter
    );

    expect(result.type).toBe("text");
    if (result.type === "text") {
      expect(result.text).toContain("4 tiles");
      expect(result.text).toContain("2x2");
      expect(result.text).toContain("$F0");
      expect(result.text).toContain("$F3");
      expect(result.text).toContain("Preview");
    }

    // Should have written 4 tiles to CHR
    expect(adapter.writeChrTile).toHaveBeenCalledTimes(4);
    // Should have placed 4 entries in the nametable
    expect(adapter.writeMemory).toHaveBeenCalledTimes(4);
  });

  it("write_sprite rejects non-multiple-of-tile_size dimensions", async () => {
    const adapter = mockAdapter();
    const pixels = Array.from({ length: 10 }, () => Array(10).fill(0));

    const result = await executeTool(
      "write_sprite",
      { pixels, x: 0, y: 0, start_tile_id: 0 },
      adapter
    );

    expect(result.type).toBe("text");
    if (result.type === "text") {
      expect(result.text).toContain("Error");
      expect(result.text).toContain("multiples of 8");
    }
  });

  it("write_sprite supports custom tile_size", async () => {
    const adapter = mockAdapter();
    // 16x16 grid with tile_size=16 should produce exactly 1 tile
    const pixels = Array.from({ length: 16 }, () => Array(16).fill(2));

    const result = await executeTool(
      "write_sprite",
      { pixels, x: 0, y: 0, start_tile_id: 0xA0, tile_size: 16 },
      adapter
    );

    expect(result.type).toBe("text");
    if (result.type === "text") {
      expect(result.text).toContain("1 tiles");
      expect(result.text).toContain("1x1");
    }
    expect(adapter.writeChrTile).toHaveBeenCalledTimes(1);
  });

  it("write_sprite warns when writing to chrRom", async () => {
    const adapter = mockAdapter();
    const pixels = Array.from({ length: 8 }, () => Array(8).fill(0));

    const result = await executeTool(
      "write_sprite",
      { pixels, x: 0, y: 0, start_tile_id: 0, target: "chrRom" },
      adapter
    );

    expect(result.type).toBe("text");
    if (result.type === "text") {
      expect(result.text).toContain("WARNING");
      expect(result.text).toContain("CHR ROM");
    }
  });

  // -- extract_sprite ---------------------------------------------------------

  it("extract_sprite quantizes a solid-color 8x8 region", async () => {
    const adapter = mockAdapter({
      // Palette with black, red, orange, white
      getPalette: vi.fn().mockResolvedValue({
        palette_id: 0,
        colors: [0x0F, 0x16, 0x27, 0x30],
      }),
    });

    // Create a simple 8x8 RGBA image — all bright red (close to NES $16 = rgb 164,34,0)
    const width = 8, height = 8;
    const data = Buffer.alloc(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      data[i * 4 + 0] = 170; // R
      data[i * 4 + 1] = 30;  // G
      data[i * 4 + 2] = 5;   // B
      data[i * 4 + 3] = 255; // A (fully opaque)
    }

    const imageStore = new Map([
      ["image_0", { data, width, height }],
    ]);

    const result = await executeTool(
      "extract_sprite",
      { x: 0, y: 0, width: 8, height: 8, palette_id: 0 },
      adapter, null, null, imageStore,
    );

    expect(result.type).toBe("text");
    if (result.type === "text") {
      expect(result.text).toContain("8x8");
      expect(result.text).toContain("pixels:");
      expect(result.text).toContain("Preview:");
      expect(result.text).toContain("Palette 0");
    }
  });

  it("extract_sprite treats transparent pixels as palette index 0", async () => {
    const adapter = mockAdapter({
      getPalette: vi.fn().mockResolvedValue({
        palette_id: 4,
        colors: [0x0F, 0x30, 0x16, 0x12],
      }),
    });

    const width = 8, height = 8;
    const data = Buffer.alloc(width * height * 4); // all zeroes = transparent black

    const imageStore = new Map([
      ["image_0", { data, width, height }],
    ]);

    const result = await executeTool(
      "extract_sprite",
      { x: 0, y: 0, width: 8, height: 8, palette_id: 4 },
      adapter, null, null, imageStore,
    );

    expect(result.type).toBe("text");
    if (result.type === "text") {
      // All transparent → all palette index 0
      const match = result.text.match(/pixels: (\[.*\])/);
      expect(match).toBeTruthy();
      const pixels = JSON.parse(match![1]);
      const allZero = pixels.every((row: number[]) => row.every((p: number) => p === 0));
      expect(allZero).toBe(true);
    }
  });

  it("extract_sprite returns error when no images uploaded", async () => {
    const adapter = mockAdapter();
    const result = await executeTool(
      "extract_sprite",
      { x: 0, y: 0, width: 8, height: 8, palette_id: 0 },
      adapter, null, null, new Map(),
    );

    expect(result.type).toBe("text");
    if (result.type === "text") {
      expect(result.text).toContain("Error");
      expect(result.text).toContain("No reference images");
    }
  });

  it("extract_sprite validates crop bounds", async () => {
    const adapter = mockAdapter({
      getPalette: vi.fn().mockResolvedValue({
        palette_id: 0, colors: [0x0F, 0x30, 0x16, 0x12],
      }),
    });

    const imageStore = new Map([
      ["image_0", { data: Buffer.alloc(8 * 8 * 4), width: 8, height: 8 }],
    ]);

    const result = await executeTool(
      "extract_sprite",
      { x: 0, y: 0, width: 100, height: 100, palette_id: 0 },
      adapter, null, null, imageStore,
    );

    expect(result.type).toBe("text");
    if (result.type === "text") {
      expect(result.text).toContain("Error");
      expect(result.text).toContain("exceeds image bounds");
    }
  });

  it("extract_sprite pads dimensions to multiples of 8", async () => {
    const adapter = mockAdapter({
      getPalette: vi.fn().mockResolvedValue({
        palette_id: 0, colors: [0x0F, 0x30, 0x16, 0x12],
      }),
    });

    const width = 20, height = 20;
    const data = Buffer.alloc(width * height * 4, 0xFF); // all white, fully opaque

    const imageStore = new Map([
      ["image_0", { data, width, height }],
    ]);

    const result = await executeTool(
      "extract_sprite",
      { x: 0, y: 0, width: 13, height: 11, palette_id: 0 },
      adapter, null, null, imageStore,
    );

    expect(result.type).toBe("text");
    if (result.type === "text") {
      // 13 → 16, 11 → 16
      expect(result.text).toContain("16x16");
    }
  });

  it("extract_sprite returns error for missing image_id", async () => {
    const adapter = mockAdapter();
    const imageStore = new Map([
      ["image_0", { data: Buffer.alloc(64), width: 8, height: 8 }],
    ]);

    const result = await executeTool(
      "extract_sprite",
      { x: 0, y: 0, width: 8, height: 8, palette_id: 0, image_id: "image_5" },
      adapter, null, null, imageStore,
    );

    expect(result.type).toBe("text");
    if (result.type === "text") {
      expect(result.text).toContain("Error");
      expect(result.text).toContain("image_5");
      expect(result.text).toContain("image_0");
    }
  });

  // -- find_unused_tiles -------------------------------------------------------

  it("find_unused_tiles identifies tiles not in nametable", async () => {
    const adapter = mockAdapter({
      readMemory: vi.fn().mockImplementation(async () => {
        // All nametable entries use tile IDs 0-9 repeating
        const bytes = Array.from({ length: 32 }, (_, i) => i % 10);
        return { bytes };
      }),
    });

    const result = await executeTool(
      "find_unused_tiles",
      { count: 5 },
      adapter,
    );

    expect(result.type).toBe("text");
    if (result.type === "text") {
      expect(result.text).toContain("unused tile IDs");
      // Tile IDs 10+ should all be unused; we asked for 5
      expect(result.text).toContain("$0A"); // first unused = 10
    }
  });

  it("find_unused_tiles reads 30 rows of nametable", async () => {
    const adapter = mockAdapter({
      readMemory: vi.fn().mockResolvedValue({ bytes: Array(32).fill(0x24) }),
    });

    await executeTool("find_unused_tiles", {}, adapter);

    // Should read 30 rows
    expect(adapter.readMemory).toHaveBeenCalledTimes(30);
  });
});
