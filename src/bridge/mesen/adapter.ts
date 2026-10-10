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
  DebugEventTypesResult,
  ReadChrTileResult,
  WriteChrTileResult,
  MemoryType,
  PauseEmulatorResult,
  ResumeEmulatorResult,
  StepFrameResult,
  PlayInputParams,
  PlayInputResult,
  EmulatorStatusResult,
  PixelColorResult,
  ScrollCaptureResult,
  SearchMemoryResult,
  SpritesResult,
  ReadRegionParams,
  ReadRegionResult,
  ResetEmulatorResult,
  TraceWritesResult,
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

  /**
   * Capture every $2000/$2005/$2006 write for one frame (two stepped frames
   * while paused) with the PPU position, for the scanline-accurate scroll
   * reconstruction (ADR-0010). Two-phase on the Lua side.
   */
  async captureScrollWrites(frames: number = 1): Promise<ScrollCaptureResult> {
    return this.conn.request<ScrollCaptureResult>("capture_scroll_writes", { frames }, { timeoutMs: Math.ceil((frames + 2) / 60) * 1000 + 5000 });
  }

  /** Find a byte pattern (-1 = wildcard) in a memory type; bounded on the Lua side (ADR-0009). */
  async searchMemory(pattern: number[], memType: MemoryType = "prgRom", opts: { start?: number; length?: number; maxResults?: number } = {}): Promise<SearchMemoryResult> {
    return this.conn.request<SearchMemoryResult>("search_memory", {
      pattern,
      mem_type: memType,
      ...(opts.start !== undefined ? { start: opts.start } : {}),
      ...(opts.length !== undefined ? { length: opts.length } : {}),
      ...(opts.maxResults !== undefined ? { max_results: opts.maxResults } : {}),
    });
  }

  /** Who writes (or reads) an address range over N frames; two-phase on the Lua side (ADR-0009). */
  async traceWrites(opts: { address: number; length?: number; memType?: MemoryType; frames?: number; mode?: "write" | "read"; maxWriters?: number }): Promise<TraceWritesResult> {
    const frames = opts.frames ?? 60;
    return this.conn.request<TraceWritesResult>("trace_writes", {
      address: opts.address,
      ...(opts.length !== undefined ? { length: opts.length } : {}),
      ...(opts.memType !== undefined ? { mem_type: opts.memType } : {}),
      frames,
      ...(opts.mode !== undefined ? { mode: opts.mode } : {}),
      ...(opts.maxWriters !== undefined ? { max_writers: opts.maxWriters } : {}),
    }, { timeoutMs: Math.ceil(frames / 60) * 1000 + 5000 });
  }

  /** Soft-reset the console; clears palette overrides first and answers after `frames` have run (ADR-0009). */
  async resetEmulator(frames: number = 30): Promise<ResetEmulatorResult> {
    // Paused, bridge.lua steps those frames through the keep-alive, much slower than real time: a paused reset
    // answered after exactly the old 6 s budget and timed out (eval/runs/20261009-1428-sheet2-text-tiles, ledger F12).
    return this.conn.request<ResetEmulatorResult>("reset_emulator", { frames }, { timeoutMs: frames * 400 + 5000 });
  }

  /** Rendered color at a screen pixel; ground truth for what the user sees (ADR-0010). */
  async getPixelColor(x: number, y: number): Promise<PixelColorResult> {
    return this.conn.request<PixelColorResult>("get_pixel_color", { x, y });
  }

  /** PPU-faithful pixel map of a window ≤64x64, with the caller's per-row background scroll (ADR-0014). */
  async readRegion(params: ReadRegionParams): Promise<ReadRegionResult> {
    return this.conn.request<ReadRegionResult>("read_region", { ...params });
  }

  /** OAM decoded as the PPU draws it; with `at`, only the sprites covering that pixel, hit-tested (ADR-0013). */
  async getSprites(at?: { x: number; y: number }): Promise<SpritesResult> {
    return this.conn.request<SpritesResult>("get_sprites", at ? { x: at.x, y: at.y } : {});
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
    colorIndex?: number,
    restore?: boolean
  ): Promise<ClearPaletteOverridesResult> {
    return this.conn.request<ClearPaletteOverridesResult>(
      "clear_palette_overrides",
      {
        ...(paletteId != null ? { palette_id: paletteId } : {}),
        ...(colorIndex != null ? { color_index: colorIndex } : {}),
        ...(restore != null ? { restore } : {}),
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

  /** Load emulator state from a slot, or from a file in Mesen's SaveStates folder (ADR-0023). */
  async loadState(slot: number = 0, file?: string): Promise<StateResult> {
    return this.conn.request<StateResult>("load_state", file ? { slot, file } : { slot });
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

  /** Probe which `emu.eventType` callbacks and input functions this Mesen build offers (ADR-0019). */
  async debugEventTypes(): Promise<DebugEventTypesResult> {
    return this.conn.request<DebugEventTypesResult>("debug_event_types");
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

  /** Run a bounded button script in real time; completes when its frames have elapsed (ADR-0019). */
  async playInput(params: PlayInputParams): Promise<PlayInputResult> {
    const frames = params.script.reduce((n, seg) => n + (seg.frames | 0), 0);
    return this.conn.request<PlayInputResult>("play_input", { ...params }, { timeoutMs: Math.ceil(frames / 60) * 1000 + 5000 });
  }

  /** Query the current emulator pause/run state. */
  async getEmulatorStatus(): Promise<EmulatorStatusResult> {
    return this.conn.request<EmulatorStatusResult>("get_emulator_status");
  }
}
