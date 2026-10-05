/**
 * Mesen2 emulator adapter — typed tool wrappers over the TCP bridge.
 * This is the concrete implementation of the emulator abstraction layer.
 */

import { MesenConnection, type MesenConnectionOptions } from "./connection.js";
import type {
  ScreenshotResult,
  TileAtPixelResult,
  PaletteResult,
  WritePaletteResult,
  AllPalettesResult,
  ClearPaletteOverridesResult,
  ReadMemoryResult,
  WriteMemoryResult,
  CpuStateResult,
  RomInfoResult,
  StateResult,
  PingResult,
  LuaLogsResult,
  ReadChrTileResult,
  WriteChrTileResult,
  MemoryType,
  PauseEmulatorResult,
  ResumeEmulatorResult,
  StepFrameResult,
  EmulatorStatusResult,
} from "./protocol.js";

export class MesenAdapter {
  private conn: MesenConnection;

  constructor(options?: MesenConnectionOptions) {
    this.conn = new MesenConnection(options);
  }

  get isConnected(): boolean {
    return this.conn.isConnected;
  }

  /** Start the bridge TCP server and wait for Mesen to connect. */
  async listen(): Promise<void> {
    return this.conn.listen();
  }

  /** Shut down the bridge server. */
  shutdown(): void {
    this.conn.shutdown();
  }

  // -- Tools ---------------------------------------------------------------

  /** Capture the current frame as a PNG (base64-encoded). */
  async screenshot(): Promise<ScreenshotResult> {
    return this.conn.request<ScreenshotResult>("screenshot");
  }

  /** Get tile and palette info at a screen pixel coordinate. */
  async getTileAtPixel(x: number, y: number): Promise<TileAtPixelResult> {
    return this.conn.request<TileAtPixelResult>("get_tile_at_pixel", { x, y });
  }

  /** Get the 4 NES color indices for a palette (0-7). */
  async getPalette(paletteId: number): Promise<PaletteResult> {
    return this.conn.request<PaletteResult>("get_palette", {
      palette_id: paletteId,
    });
  }

  /** Change a palette color in live memory. */
  async writePalette(
    paletteId: number,
    colorIndex: number,
    nesColor: number
  ): Promise<WritePaletteResult> {
    return this.conn.request<WritePaletteResult>("write_palette", {
      palette_id: paletteId,
      color_index: colorIndex,
      nes_color: nesColor,
    });
  }

  /** Get all 8 palettes (4 background + 4 sprite). */
  async getAllPalettes(): Promise<AllPalettesResult> {
    return this.conn.request<AllPalettesResult>("get_all_palettes");
  }

  /** Clear frozen palette overrides (some or all). */
  async clearPaletteOverrides(
    paletteId?: number,
    colorIndex?: number
  ): Promise<ClearPaletteOverridesResult> {
    return this.conn.request<ClearPaletteOverridesResult>(
      "clear_palette_overrides",
      {
        ...(paletteId != null ? { palette_id: paletteId } : {}),
        ...(colorIndex != null ? { color_index: colorIndex } : {}),
      }
    );
  }

  /** Read bytes from a memory region. */
  async readMemory(
    address: number,
    length: number = 1,
    memType: MemoryType = "cpuDebug"
  ): Promise<ReadMemoryResult> {
    return this.conn.request<ReadMemoryResult>("read_memory", {
      address,
      length,
      mem_type: memType,
    });
  }

  /** Write bytes to a memory region. */
  async writeMemory(
    address: number,
    bytes: number[],
    memType: MemoryType = "cpu"
  ): Promise<WriteMemoryResult> {
    return this.conn.request<WriteMemoryResult>("write_memory", {
      address,
      bytes,
      mem_type: memType,
    });
  }

  /** Get CPU registers and PPU state. */
  async getCpuState(): Promise<CpuStateResult> {
    return this.conn.request<CpuStateResult>("get_cpu_state");
  }

  /** Get metadata about the loaded ROM. */
  async getRomInfo(): Promise<RomInfoResult> {
    return this.conn.request<RomInfoResult>("get_rom_info");
  }

  /** Save emulator state to a slot. */
  async saveState(slot: number = 0): Promise<StateResult> {
    return this.conn.request<StateResult>("save_state", { slot });
  }

  /** Load emulator state from a slot. */
  async loadState(slot: number = 0): Promise<StateResult> {
    return this.conn.request<StateResult>("load_state", { slot });
  }

  /** Read a single 8x8 tile from CHR memory, decoded to a pixel grid. */
  async readChrTile(
    tileId: number,
    source: "chrRom" | "chrRam" = "chrRom"
  ): Promise<ReadChrTileResult> {
    return this.conn.request<ReadChrTileResult>("read_chr_tile", {
      tile_id: tileId,
      source,
    });
  }

  /** Write an 8x8 pixel grid to CHR memory. */
  async writeChrTile(
    tileId: number,
    pixels: number[][],
    target: "chrRom" | "chrRam" = "chrRam"
  ): Promise<WriteChrTileResult> {
    return this.conn.request<WriteChrTileResult>("write_chr_tile", {
      tile_id: tileId,
      pixels,
      target,
    });
  }

  /** Health check — verify the bridge is responsive. */
  async ping(): Promise<PingResult> {
    return this.conn.request<PingResult>("ping");
  }

  /** Retrieve buffered emu.log entries from the Lua side. */
  async getLuaLogs(since: number = 0): Promise<LuaLogsResult> {
    return this.conn.request<LuaLogsResult>("get_lua_logs", { since });
  }

  // -- Emulator Control -------------------------------------------------------

  /** Pause the emulator (break execution). */
  async pauseEmulator(): Promise<PauseEmulatorResult> {
    return this.conn.request<PauseEmulatorResult>("pause_emulator");
  }

  /** Resume emulator execution. */
  async resumeEmulator(): Promise<ResumeEmulatorResult> {
    return this.conn.request<ResumeEmulatorResult>("resume_emulator");
  }

  /** Advance the emulator by N frames (default 1) while keeping it paused. */
  async stepFrame(count: number = 1): Promise<StepFrameResult> {
    return this.conn.request<StepFrameResult>("step_frame", { count });
  }

  /** Query the current emulator pause/run state. */
  async getEmulatorStatus(): Promise<EmulatorStatusResult> {
    return this.conn.request<EmulatorStatusResult>("get_emulator_status");
  }

  /** Send a raw request — for debugging and discovery. */
  async rawRequest(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return this.conn.request<unknown>(method, params);
  }
}
