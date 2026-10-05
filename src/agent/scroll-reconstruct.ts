/**
 * Which scroll was in effect at a given scanline, from the PPU register
 * writes captured over one frame (ADR-0010). Pure: no emulator access.
 *
 * The capture (mesen/bridge.lua `capture_scroll_writes`) records every CPU
 * write to $2000/$2005/$2006 with the PPU position and the loopy registers
 * as Mesen reports them BEFORE the write lands. This module applies the
 * writes itself and models the two moments the PPU copies t into v:
 *   - horizontal bits (coarse X, nametable X) at dot 257 of every rendered
 *     scanline, including the pre-render line;
 *   - vertical bits (coarse Y, fine Y, nametable Y) only during the
 *     pre-render line (dots 280-304), or immediately on a $2006 second write.
 * A mid-frame $2005 Y write therefore does nothing until the next frame
 * (ADR-0010 build plan, phase 2); only a $2006 pair moves Y mid-frame.
 */

import type { ScrollCaptureResult as ScrollCapture, ScrollWrite } from "../bridge/mesen/protocol.js";
export type { ScrollCapture, ScrollWrite };

export interface ScrollAtScanline {
  /** Horizontal state loaded for this scanline. */
  coarse_x: number;
  fine_x: number;
  nametable_x: number;
  /** Vertical position of v during this scanline, 0-239 within the nametable, plus the nametable Y bit. */
  v_y: number;
  nametable_y: number;
  /** Virtual top-of-frame scroll values a tool can report: v_y - scanline, wrapped. */
  scroll_x: number;
  scroll_y: number;
  /** "scanline" when a mid-frame write governs this scanline, else "vblank". */
  scroll_source: "scanline" | "vblank";
  /** The scanline of the last write that applies here, or -1 for vblank/pre-render writes. */
  applied_scanline: number;
  /** More than one completed scroll update landed in the region above this scanline. */
  ambiguous: boolean;
  updates_in_frame: number;
}

/** Chronological position within one frame: vblank, then pre-render, then visible lines. */
function order(scanline: number, cycle: number): number {
  const line = scanline >= 241 ? scanline - 241 : scanline === -1 ? 20 : scanline === 240 ? 262 : 21 + scanline;
  return line * 400 + cycle;
}

interface Loopy {
  t: number;
  v: number;
  x: number;
  w: boolean;
}

/** Apply one register write to the loopy registers (nesdev wiki "PPU scrolling"). Returns the new state and whether v was loaded. */
export function applyWrite(state: Loopy, reg: number, value: number): { state: Loopy; loadedV: boolean; completedUpdate: boolean } {
  let { t, v, x, w } = state;
  let loadedV = false;
  let completed = false;
  if (reg === 0) {
    // SMB toggles NMI through $2000 mid-frame without touching the nametable
    // bits; only a changed select counts as a scroll update.
    completed = ((t >> 10) & 0x03) !== (value & 0x03);
    t = (t & ~0x0c00) | ((value & 0x03) << 10);
  } else if (reg === 5) {
    if (!w) {
      t = (t & ~0x001f) | (value >> 3);
      x = value & 0x07;
      w = true;
    } else {
      t = (t & ~0x73e0) | ((value & 0x07) << 12) | ((value >> 3) << 5);
      w = false;
      completed = true;
    }
  } else if (reg === 6) {
    if (!w) {
      t = (t & 0x00ff) | ((value & 0x3f) << 8);
      w = true;
    } else {
      t = (t & 0xff00) | value;
      v = t;
      w = false;
      loadedV = true;
      completed = true;
    }
  }
  return { state: { t, v, x, w }, loadedV, completedUpdate: completed };
}

function yOf(addr: number): number {
  return ((addr >> 5) & 0x1f) * 8 + ((addr >> 12) & 0x07);
}

/** Advance v's vertical position by n scanlines, wrapping at 240 and flipping the nametable Y bit as the PPU does. */
function advanceY(vy: number, ntY: number, n: number): { v_y: number; nametable_y: number } {
  let y = vy;
  let nt = ntY;
  for (let i = 0; i < n; i++) {
    y++;
    if (y === 240) {
      y = 0;
      nt ^= 1;
    } else if (y >= 256) {
      // Attribute-row territory (coarse Y 30/31): wraps without the flip.
      y = 0;
    }
  }
  return { v_y: y, nametable_y: nt };
}

/**
 * Scroll in effect at `scanline` (0-239) according to the last frame of the
 * capture. Writes from earlier frames are ignored; the frame's vblank and
 * pre-render writes set the top-of-frame state.
 */
export function reconstructScrollAt(capture: ScrollCapture, scanline: number): ScrollAtScanline {
  if (scanline < 0 || scanline > 239) throw new Error(`scanline must be 0-239, got ${scanline}`);
  const lastFrame = capture.writes.reduce((m, w) => Math.max(m, w.frame), 0);
  const writes = capture.writes
    .filter((w) => w.frame === lastFrame)
    .map((w, i) => ({ ...w, i, pos: order(w.scanline, w.cycle) }))
    .sort((a, b) => a.pos - b.pos || a.i - b.i);

  // Horizontal: t and x as of the dot-257 copy of the previous line, unless a
  // $2006 pair loaded v outright between that copy and the start of this line.
  const hCopy = order(scanline - 1 < 0 ? -1 : scanline - 1, 257);
  const lineStart = order(scanline, 0);
  // Vertical: pre-render copy at dots 280-304, then +1 per scanline, unless a $2006 pair reloaded v.
  const vCopy = order(-1, 304);

  let state: Loopy = writes.length > 0 ? { t: writes[0].t, v: writes[0].v, x: writes[0].x, w: writes[0].w } : { ...capture.final };
  let hState: Loopy | null = null;
  let hApplied = -1;
  let vLoad: { y: number; nt: number; scanline: number; cycle: number } | null = null;
  let vPreRender: Loopy | null = null;
  let updates = 0;
  // Distinct visible scanlines with a completed update: a $2005 pair and a
  // $2000 nametable switch on the same line are one split, not two.
  const updateLines = new Set<number>();

  for (const w of writes) {
    // Trust the recorded pre-write latch over our own: $2002 reads reset w without a record.
    state = { ...state, w: w.w };
    const { state: next, loadedV, completedUpdate } = applyWrite(state, w.reg, w.value);
    state = next;
    if (completedUpdate) updates++;
    if (w.pos <= hCopy || (loadedV && w.pos < lineStart)) {
      hState = { ...state };
      if (completedUpdate) {
        hApplied = w.scanline >= 0 && w.scanline <= 239 ? w.scanline : -1;
        if (w.scanline >= 0 && w.scanline <= 239) updateLines.add(w.scanline);
      }
    }
    if (w.pos <= vCopy) vPreRender = { ...state };
    if (loadedV && w.pos > vCopy && w.pos < lineStart && w.scanline >= 0 && w.scanline <= 239) {
      vLoad = { y: yOf(state.v), nt: (state.v >> 11) & 1, scanline: w.scanline, cycle: w.cycle };
    }
  }

  const h = hState ?? state;
  const coarse_x = h.t & 0x1f;
  const fine_x = h.x;
  const nametable_x = (h.t >> 10) & 1;

  let vert: { v_y: number; nametable_y: number };
  if (vLoad) {
    // Increments at dot 256 of each line from the load's line (if the write came before dot 256) to scanline-1.
    const first = vLoad.cycle < 256 ? vLoad.scanline : vLoad.scanline + 1;
    vert = advanceY(vLoad.y, vLoad.nt, Math.max(0, scanline - first));
  } else {
    const base = vPreRender ?? state;
    vert = advanceY(yOf(base.t), (base.t >> 11) & 1, scanline);
  }

  const scroll_x = coarse_x * 8 + fine_x;
  const scroll_y = ((vert.v_y - scanline) % 240 + 240) % 240;
  const midFrame = hApplied >= 0 || (vLoad !== null);
  return {
    coarse_x,
    fine_x,
    nametable_x,
    v_y: vert.v_y,
    nametable_y: vert.nametable_y,
    scroll_x,
    scroll_y,
    scroll_source: midFrame ? "scanline" : "vblank",
    applied_scanline: vLoad && vLoad.scanline > hApplied ? vLoad.scanline : hApplied,
    ambiguous: updateLines.size > 1,
    updates_in_frame: updates,
  };
}

export interface TileAddress {
  nametable: number;
  tile_x: number;
  tile_y: number;
  nametable_addr: number;
  attribute_addr: number;
  attribute_shift: number;
}

/** Nametable tile and attribute cell for screen pixel (x, y) given the scroll at y's scanline. */
export function tileAddressAt(x: number, y: number, s: ScrollAtScanline): TileAddress {
  const absX = s.coarse_x * 8 + s.fine_x + x;
  let tile_x = Math.floor(absX / 8);
  let ntX = s.nametable_x;
  if (tile_x >= 32) {
    tile_x -= 32;
    ntX ^= 1;
  }
  // The pixel's row IS the scanline, so the row comes straight from v's vertical position.
  const tile_y = Math.floor(s.v_y / 8);
  const nametable = ntX + 2 * s.nametable_y;
  const base = 0x2000 + nametable * 0x400;
  const nametable_addr = base + tile_y * 32 + tile_x;
  const attribute_addr = base + 0x3c0 + Math.floor(tile_y / 4) * 8 + Math.floor(tile_x / 4);
  const attribute_shift = (Math.floor((tile_y % 4) / 2) * 2 + Math.floor((tile_x % 4) / 2)) * 2;
  return { nametable, tile_x, tile_y, nametable_addr, attribute_addr, attribute_shift };
}
