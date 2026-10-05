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
  /** The bridge's frame counter when the shot was taken (ADR-0007 measurement); absent from older scripts. */
  frame?: number;
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
/** One OAM entry as the PPU will draw it (ADR-0013). */
export interface SpriteInfo {
  index: number;
  /** Screen position of the sprite's top-left pixel (OAM Y + 1). */
  x: number;
  y: number;
  width: 8;
  height: 8 | 16;
  /** Raw OAM tile byte and attribute byte. */
  tile: number;
  attr: number;
  /** Sprite palette 4-7. */
  palette: number;
  behind_background: boolean;
  flip_h: boolean;
  flip_v: boolean;
  /** Index into the 512-tile pattern space of the sprite's (top) tile: what read_tile wants. */
  chr_tile: number;
  chr_tile_bottom?: number;
  /** Present when the request named a pixel: the pattern value 0-3 drawn there, whether it is opaque, the CHR tile it came from, and the 8x8 screen cell. */
  pixel_value?: number;
  opaque?: boolean;
  hit_tile?: number;
  cell?: { x: number; y: number; width: number; height: number };
}

export interface SpritesResult {
  large_sprites: boolean;
  sprite_pattern_addr: number;
  background_pattern_addr: number;
  sprites_enabled: boolean;
  count: number;
  sprites: SpriteInfo[];
}

/** Background scroll in effect on one window row, from the ring reconstruction (ADR-0014). */
export interface RegionRow {
  /** Horizontal scroll (coarse*8 + fine) and nametable X bit for this scanline. */
  scroll_x: number;
  nt_x: number;
  /** Vertical position of the PPU's v register within the nametable (0-239) and nametable Y bit. */
  v_y: number;
  nt_y: number;
}

export interface ReadRegionParams {
  x: number;
  y: number;
  w: number;
  h: number;
  rows: RegionRow[];
}

/** A PPU-faithful pixel map of a screen window; arrays are row-major, length w*h (ADR-0014). */
export interface ReadRegionResult {
  x: number;
  y: number;
  w: number;
  h: number;
  large_sprites: boolean;
  background_pattern_addr: number;
  sprite_pattern_addr: number;
  /** 0 none (rendering off), 1 background, 2 sprite. */
  layer: number[];
  /** Palette 0-7 drawing the pixel. */
  palette: number[];
  /** Slot 0-3 within that palette (background slot 0 = backdrop; sprite slot 0 never appears). */
  slot: number[];
  /** Pattern-space tile index drawing the pixel, or -1. */
  tile: number[];
  /** OAM index for sprite pixels, else -1. */
  oam: number[];
}

export interface ScrollCaptureResult {
  frames: number;
  /** Always 0 since ADR-0013: a one-frame capture answers from the standing ring. */
  stepped_frames: number;
  /** "ring": the last completed frame; "frames": a live multi-frame hook. Absent from older scripts. */
  source?: "ring" | "frames";
  start_frame: number;
  end_frame: number;
  other_register_writes: number;
  final: { t: number; v: number; x: number; w: boolean; scanline: number; cycle: number };
  writes: ScrollWrite[];
}

/** One PC that accessed the traced range (ADR-0009). */
export interface TraceWriter {
  pc: number;
  count: number;
  last_value: number;
  last_address: number;
  last_frame: number;
  samples: Array<{ address: number; value: number; frame: number }>;
  /** Where the PC lives through the mapper (prgRom offset for ROM code). */
  origin: { address: number; mem_type?: string; mem_type_id: number } | null;
}

/** Answer to trace_writes: two-phase, N frames of write (or read) callbacks on a range (ADR-0009). */
export interface TraceWritesResult {
  address: number;
  length: number;
  mem_type: string;
  mode: "write" | "read";
  frames: number;
  total_accesses: number;
  recorded_accesses: number;
  truncated: boolean;
  writers: TraceWriter[];
}

export interface ClearPaletteOverridesResult {
  cleared: number;
  /** Slots whose pre-override color was written back (default behavior). */
  restored: number;
}

/** Answer to search_memory (ADR-0009). */
export interface SearchMemoryResult {
  mem_type: string;
  memory_size: number;
  start: number;
  searched: number;
  offsets: number[];
  truncated: boolean;
  pattern_length: number;
}

/** Answer to reset_emulator (ADR-0009). */
export interface ResetEmulatorResult {
  reset: boolean;
  cleared_palette_overrides: number;
  /** Frames the bridge let run after the reset before answering (default 30). */
  frames_waited: number;
  paused: boolean;
}

/** Answer to convert_address: where a CPU/PPU address lives through the mapper (ADR-0009). */
export interface ConvertAddressResult {
  input: number;
  input_mem_type: string;
  /** Offset within the resolved memory, e.g. the PRG ROM byte offset (no iNES header). */
  address?: number;
  /** Resolved memory type name when it is one the bridge knows (prgRom, chrRom, workRam, palette, ...). */
  mem_type?: string;
  mem_type_id?: number;
  raw: unknown;
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

/** save_state / load_state: two-phase, done inside an exec callback (Mesen2 requirement). Slots live in the running script. */
export interface StateResult {
  slot: number;
  action: "saved" | "loaded";
  /** Size of the state blob. */
  bytes: number;
  /** 1 when the emulator was paused and one frame had to run for the callback to fire. */
  stepped_frames: number;
  paused: boolean;
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
