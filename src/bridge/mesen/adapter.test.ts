import { describe, it, expect, vi, beforeEach } from "vitest";
import { MesenAdapter } from "./adapter.js";

// Mock the connection module — must return a class for `new MesenConnection()`
vi.mock("./connection.js", () => {
  const mockRequest = vi.fn();
  class MockMesenConnection {
    isConnected = true;
    listen = vi.fn().mockResolvedValue(undefined);
    shutdown = vi.fn();
    request = mockRequest;
  }
  return {
    MesenConnection: MockMesenConnection,
    __mockRequest: mockRequest,
  };
});

// Get the mock request function — cast through any to access the test-only export
const { __mockRequest } = await import("./connection.js") as any;
const mockRequest = __mockRequest as ReturnType<typeof vi.fn>;

describe("MesenAdapter", () => {
  let adapter: MesenAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new MesenAdapter();
  });

  it("screenshot sends the right method", async () => {
    mockRequest.mockResolvedValue({ png_base64: "abc" });
    const result = await adapter.screenshot();
    expect(mockRequest).toHaveBeenCalledWith("screenshot");
    expect(result).toEqual({ png_base64: "abc" });
  });

  it("getTileAtPixel passes x and y", async () => {
    mockRequest.mockResolvedValue({ tile_id: 42, palette_id: 1 });
    const result = await adapter.getTileAtPixel(128, 120);
    expect(mockRequest).toHaveBeenCalledWith("get_tile_at_pixel", { x: 128, y: 120 });
    expect(result.tile_id).toBe(42);
  });

  it("getPixelColor sends get_pixel_color with x and y (ADR-0010)", async () => {
    mockRequest.mockResolvedValue({ x: 1, y: 2, argb: 0xff88d800, r: 136, g: 216, b: 0 });
    const result = await adapter.getPixelColor(1, 2);
    expect(mockRequest).toHaveBeenCalledWith("get_pixel_color", { x: 1, y: 2 });
    expect(result.g).toBe(216);
  });

  it("getPalette passes palette_id", async () => {
    mockRequest.mockResolvedValue({ palette_id: 3, colors: [0, 1, 2, 3], background_color: 0 });
    const result = await adapter.getPalette(3);
    expect(mockRequest).toHaveBeenCalledWith("get_palette", { palette_id: 3 });
    expect(result.colors).toEqual([0, 1, 2, 3]);
  });

  it("writePalette passes all params", async () => {
    mockRequest.mockResolvedValue({ old_color: 0, new_color: 0x27, frozen: true });
    const result = await adapter.writePalette(2, 1, 0x27);
    expect(mockRequest).toHaveBeenCalledWith("write_palette", {
      palette_id: 2,
      color_index: 1,
      nes_color: 0x27,
    });
    expect(result.frozen).toBe(true);
  });

  it("getAllPalettes sends method with no params", async () => {
    mockRequest.mockResolvedValue({ palettes: [] });
    await adapter.getAllPalettes();
    expect(mockRequest).toHaveBeenCalledWith("get_all_palettes");
  });

  it("clearPaletteOverrides passes optional params", async () => {
    mockRequest.mockResolvedValue({ cleared: 1 });
    await adapter.clearPaletteOverrides(2, 1);
    expect(mockRequest).toHaveBeenCalledWith("clear_palette_overrides", {
      palette_id: 2,
      color_index: 1,
    });
  });

  it("clearPaletteOverrides with no args sends empty object", async () => {
    mockRequest.mockResolvedValue({ cleared: 8 });
    await adapter.clearPaletteOverrides();
    expect(mockRequest).toHaveBeenCalledWith("clear_palette_overrides", {});
  });

  it("clearPaletteOverrides with only palette_id omits color_index", async () => {
    mockRequest.mockResolvedValue({ cleared: 4 });
    await adapter.clearPaletteOverrides(3);
    expect(mockRequest).toHaveBeenCalledWith("clear_palette_overrides", {
      palette_id: 3,
    });
  });

  it("readMemory passes address, length, and mem_type", async () => {
    mockRequest.mockResolvedValue({ address: 0x8000, mem_type: "prgRom", bytes: [0xff] });
    await adapter.readMemory(0x8000, 16, "prgRom");
    expect(mockRequest).toHaveBeenCalledWith("read_memory", {
      address: 0x8000,
      length: 16,
      mem_type: "prgRom",
    });
  });

  it("readMemory uses defaults for length and mem_type", async () => {
    mockRequest.mockResolvedValue({ address: 0, bytes: [0] });
    await adapter.readMemory(0);
    expect(mockRequest).toHaveBeenCalledWith("read_memory", {
      address: 0,
      length: 1,
      mem_type: "cpuDebug",
    });
  });

  it("writeMemory passes address, bytes, and mem_type", async () => {
    mockRequest.mockResolvedValue({ bytes_written: 2 });
    await adapter.writeMemory(0x6000, [0xff, 0x00], "saveRam");
    expect(mockRequest).toHaveBeenCalledWith("write_memory", {
      address: 0x6000,
      bytes: [0xff, 0x00],
      mem_type: "saveRam",
    });
  });

  it("getCpuState sends method", async () => {
    mockRequest.mockResolvedValue({ a: 0, x: 0, y: 0, sp: 0xfd, pc: 0x8000 });
    const result = await adapter.getCpuState();
    expect(mockRequest).toHaveBeenCalledWith("get_cpu_state");
    expect(result.pc).toBe(0x8000);
  });

  it("getRomInfo sends method", async () => {
    mockRequest.mockResolvedValue({ name: "Super Mario Bros", sha1: "abc", format: "iNES" });
    const result = await adapter.getRomInfo();
    expect(mockRequest).toHaveBeenCalledWith("get_rom_info");
    expect(result.name).toBe("Super Mario Bros");
  });

  it("saveState defaults to slot 0", async () => {
    mockRequest.mockResolvedValue({ slot: 0, action: "saved" });
    await adapter.saveState();
    expect(mockRequest).toHaveBeenCalledWith("save_state", { slot: 0 });
  });

  it("loadState passes slot", async () => {
    mockRequest.mockResolvedValue({ slot: 3, action: "loaded" });
    await adapter.loadState(3);
    expect(mockRequest).toHaveBeenCalledWith("load_state", { slot: 3 });
  });

  it("ping sends method", async () => {
    mockRequest.mockResolvedValue({ pong: true, timestamp: 12345 });
    const result = await adapter.ping();
    expect(result.pong).toBe(true);
  });

  it("getLuaLogs passes since param", async () => {
    mockRequest.mockResolvedValue({ logs: [], count: 0, overflow: 0 });
    await adapter.getLuaLogs(1000);
    expect(mockRequest).toHaveBeenCalledWith("get_lua_logs", { since: 1000 });
  });

  it("getLuaLogs defaults to since=0", async () => {
    mockRequest.mockResolvedValue({ logs: [], count: 0 });
    await adapter.getLuaLogs();
    expect(mockRequest).toHaveBeenCalledWith("get_lua_logs", { since: 0 });
  });

  it("rawRequest passes method and params through", async () => {
    mockRequest.mockResolvedValue({ keys: {} });
    await adapter.rawRequest("debug_state", { depth: 3 });
    expect(mockRequest).toHaveBeenCalledWith("debug_state", { depth: 3 });
  });

  // -- Emulator Control Tests ------------------------------------------------

  it("pauseEmulator sends pause_emulator method", async () => {
    mockRequest.mockResolvedValue({ paused: true });
    const result = await adapter.pauseEmulator();
    expect(mockRequest).toHaveBeenCalledWith("pause_emulator");
    expect(result.paused).toBe(true);
  });

  it("resumeEmulator sends resume_emulator method", async () => {
    mockRequest.mockResolvedValue({ resumed: true });
    const result = await adapter.resumeEmulator();
    expect(mockRequest).toHaveBeenCalledWith("resume_emulator");
    expect(result.resumed).toBe(true);
  });

  it("stepFrame defaults to count 1", async () => {
    mockRequest.mockResolvedValue({ stepped: 1, paused: true });
    const result = await adapter.stepFrame();
    expect(mockRequest).toHaveBeenCalledWith("step_frame", { count: 1 });
    expect(result.stepped).toBe(1);
  });

  it("stepFrame passes explicit count", async () => {
    mockRequest.mockResolvedValue({ stepped: 5, paused: true });
    const result = await adapter.stepFrame(5);
    expect(mockRequest).toHaveBeenCalledWith("step_frame", { count: 5 });
    expect(result.stepped).toBe(5);
  });

  it("getEmulatorStatus sends get_emulator_status method", async () => {
    mockRequest.mockResolvedValue({ paused: false });
    const result = await adapter.getEmulatorStatus();
    expect(mockRequest).toHaveBeenCalledWith("get_emulator_status");
    expect(result.paused).toBe(false);
  });
});
