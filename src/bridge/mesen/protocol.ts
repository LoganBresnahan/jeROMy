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

export type MemoryType =
  | "cpu"
  | "ppu"
  | "cpuDebug"
  | "ppuDebug"
  | "palette"
  | "oam"
  | "prgRom"
  | "chrRom"
  | "workRam"
  | "saveRam";

// -- Tool Result Types -----------------------------------------------------

export interface ScreenshotResult {
  png_base64: string;
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
}

export interface StateResult {
  slot: number;
  action: "saved" | "loaded";
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
