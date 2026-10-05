/**
 * Protocol types for JSON-over-TCP communication with Mesen2 Lua bridge.
 * Messages are newline-delimited JSON.
 */

// -- Requests (TypeScript → Lua) ------------------------------------------

export interface BridgeRequest {
  id: string;
  method: string;
  params: Record<string, unknown>;
}

// -- Responses (Lua → TypeScript) ------------------------------------------

export interface BridgeResponseSuccess {
  id: string;
  result: Record<string, unknown>;
}

export interface BridgeResponseError {
  id: string;
  error: string;
}

export type BridgeResponse = BridgeResponseSuccess | BridgeResponseError;

export function isErrorResponse(
  resp: BridgeResponse
): resp is BridgeResponseError {
  return "error" in resp;
}

// -- Tool Parameter Types --------------------------------------------------

export interface ScreenshotParams {}

export interface GetTileAtPixelParams {
  x: number;
  y: number;
}

export interface GetPaletteParams {
  palette_id: number;
}

export interface WritePaletteParams {
  palette_id: number;
  color_index: number;
  nes_color: number;
}

export interface GetAllPalettesParams {}

export interface ReadMemoryParams {
  address: number;
  length?: number;
  mem_type?: MemoryType;
}

export interface WriteMemoryParams {
  address: number;
  bytes: number[];
  mem_type?: MemoryType;
}

export interface SaveStateParams {
  slot?: number;
}

export interface LoadStateParams {
  slot?: number;
}

export interface ReadChrTileParams {
  tile_id: number;
  source?: "chrRom" | "chrRam";
}

export interface WriteChrTileParams {
  tile_id: number;
  pixels: number[][];
  target?: "chrRom" | "chrRam";
}

export type MemoryType =
  | "cpu"
  | "ppu"
  | "cpuDebug"
  | "ppuDebug"
  | "palette"
  | "oam"
  | "prgRom"
  | "chrRom"
  | "chrRam"
  | "workRam"
  | "saveRam";

// -- Tool Result Types -----------------------------------------------------

export interface ScreenshotResult {
  png_base64: string;
  paused?: boolean;
}

export interface TileAtPixelResult {
  tile_id: number;
  palette_id: number;
  tile_x: number;
  tile_y: number;
  scroll_x: number;
  scroll_y: number;
  nametable: number;
  nametable_addr: number;
  attribute_addr: number;
}

/** One captured write to $2000/$2005/$2006 with the loopy state BEFORE it (ADR-0010). */
export interface ScrollWrite {
  /** Frame index relative to the capture start; the last frame is the complete one. */
  frame: number;
  /** Mesen scanline: -1 pre-render, 0-239 visible, 240 post, 241-260 vblank. */
  scanline: number;
  cycle: number;
  /** PPU register number (address & 7): 0, 5 or 6. */
  reg: number;
  value: number;
  t: number;
  v: number;
  x: number;
  w: boolean;
}

/** Answer to capture_scroll_writes (ADR-0010): two-phase, one frame running or two stepped frames while paused. */
export interface ScrollCaptureResult {
  frames: number;
  stepped_frames: number;
  start_frame: number;
  end_frame: number;
  other_register_writes: number;
  final: { t: number; v: number; x: number; w: boolean; scanline: number; cycle: number };
  writes: ScrollWrite[];
}

/** Answer to wait_frames, the trivial two-phase request (ADR-0010). */
export interface WaitFramesResult {
  requested: number;
  waited: number;
}

/** Rendered color at a screen pixel (ADR-0010). */
export interface PixelColorResult {
  x: number;
  y: number;
  argb: number;
  r: number;
  g: number;
  b: number;
}

export interface PaletteResult {
  palette_id: number;
  colors: number[];
  background_color: number;
}

export interface WritePaletteResult {
  palette_id: number;
  color_index: number;
  old_color: number;
  new_color: number;
  frozen?: boolean;
}

export interface ClearPaletteOverridesResult {
  cleared: number;
}

export interface AllPalettesResult {
  palettes: Array<{
    palette_id: number;
    type: "background" | "sprite";
    colors: number[];
  }>;
}

export interface ReadMemoryResult {
  address: number;
  mem_type: string;
  bytes: number[];
}

export interface WriteMemoryResult {
  address: number;
  mem_type: string;
  bytes_written: number;
}

export interface CpuStateResult {
  a: number;
  x: number;
  y: number;
  sp: number;
  pc: number;
  status: number;
  cycle: number;
  scanline: number;
  ppu_cycle: number;
}

export interface RomInfoResult {
  name: string;
  path: string;
  sha1: string;
  format: string;
  /** Mapper number (NES-specific, parsed from iNES header). */
  mapper?: number;
  /** CHR ROM size in KB (NES-specific). 0 or absent means CHR RAM. */
  chrRomSize?: number;
  /** PRG ROM size in KB (NES-specific). */
  prgRomSize?: number;
  /** Convenience flag: true if game uses CHR RAM (NES: chrRomSize === 0). */
  usesChrRam?: boolean;
}

export interface StateResult {
  slot: number;
  action: "saved" | "loaded";
}

export interface ReadChrTileResult {
  tile_id: number;
  source: string;
  pixels: number[][];
}

export interface WriteChrTileResult {
  tile_id: number;
  target: string;
  rows_written: number;
}

export interface PingResult {
  pong: true;
  timestamp: number;
}

export interface LuaLogEntry {
  ts: number;
  msg: string;
}

export interface LuaLogsResult {
  logs: LuaLogEntry[];
  count: number;
  overflow?: number;
}

// -- Emulator Control Types -------------------------------------------------

export interface PauseEmulatorResult {
  paused: true;
}

export interface ResumeEmulatorResult {
  resumed: true;
}

export interface StepFrameResult {
  stepped: number;
  paused: boolean;
}

export interface EmulatorStatusResult {
  paused: boolean;
}
