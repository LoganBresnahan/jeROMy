import { describe, it, expect, vi } from "vitest";
import { agentTools, executeTool } from "./tools.js";

describe("agentTools", () => {
  it("defines the expected set of tools", () => {
    const names = agentTools.map((t) => t.name);
    expect(names).toContain("screenshot");
    expect(names).toContain("get_tile_at_pixel");
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

  it("get_tile_at_pixel passes params and returns text", async () => {
    const adapter = mockAdapter();
    const result = await executeTool("get_tile_at_pixel", { x: 128, y: 120 }, adapter);

    expect(adapter.getTileAtPixel).toHaveBeenCalledWith(128, 120);
    expect(result.type).toBe("text");
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

  it("clear_palette_overrides passes palette_id and color_index", async () => {
    const adapter = mockAdapter();
    const result = await executeTool(
      "clear_palette_overrides",
      { palette_id: 2, color_index: 1 },
      adapter
    );

    expect(adapter.clearPaletteOverrides).toHaveBeenCalledWith(2, 1);
    expect(result.type).toBe("text");
    if (result.type === "text") {
      expect(result.text).toContain("cleared");
    }
  });

  it("clear_palette_overrides works with no params (clear all)", async () => {
    const adapter = mockAdapter();
    await executeTool("clear_palette_overrides", {}, adapter);

    expect(adapter.clearPaletteOverrides).toHaveBeenCalledWith(undefined, undefined);
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
});
