/**
 * Region selection by palette slot (ADR-0014). The bridge renders a window
 * around a screen point into a PPU-faithful pixel map (layer, palette, slot,
 * tile, OAM index per pixel); this module flood-fills that map and says, in
 * numbers and in words, what a palette edit or a tile edit of the selection
 * would also change. Pure apart from the two bridge calls in `getRegionAt`;
 * the fill never looks at rendered colors, because two slots can render the
 * same color and only the slot can be edited.
 */

import type { MesenAdapter } from "../bridge/mesen/index.js";
import type { ReadRegionResult, RegionRow, ScrollCaptureResult } from "../bridge/mesen/protocol.js";
import { reconstructScrollAt } from "./scroll-reconstruct.js";
import type { ScreenBox } from "./tile-lookup.js";

export type RegionMode = "pixel" | "tile" | "color" | "object";
export const REGION_MODES: readonly RegionMode[] = ["pixel", "tile", "color", "object"];
export const WINDOW = 64;

/** One horizontal run of region pixels; x1 inclusive. */
export interface RegionRun {
  y: number;
  x0: number;
  x1: number;
}

export interface RegionResult {
  mode: "color" | "object";
  x: number;
  y: number;
  layer: "background" | "sprite" | "none";
  palette: number;
  /** color mode: the one slot selected. object mode: every slot the region uses. */
  slot?: number;
  slots: number[];
  pixel_count: number;
  bbox: ScreenBox;
  runs: RegionRun[];
  /** The fill reached the window's edge: the object continues beyond the 64x64 window. */
  truncated: boolean;
  /** Pattern-space tile indices drawing region pixels. */
  tiles: number[];
  /** OAM entries drawing region pixels (sprite layer). */
  oam: number[];
  window: ScreenBox;
  /** color mode: pixels in the window, outside the region, that a palette edit of this slot would also recolor. */
  sharing?: { pixels: number; tiles: number[]; oam: number[] };
  /** Slots 1-3 of this palette that no pixel of this layer uses anywhere in the window. */
  free_slots: number[];
  /** The sentence the model receives. */
  summary: string;
}

const hex = (n: number): string => `0x${n.toString(16).toUpperCase().padStart(2, "0")}`;
const list = (ns: number[], prefix: string, max = 6): string => {
  const shown = ns.slice(0, max).map((n) => `${prefix}${prefix === "#" ? n : hex(n)}`);
  return shown.join(", ") + (ns.length > max ? ` and ${ns.length - max} more` : "");
};

/** Per-row background scroll for a window, from one frame of captured scroll writes (ADR-0013). Pure. */
export function windowRows(capture: ScrollCaptureResult, y0: number, h: number): RegionRow[] {
  const rows: RegionRow[] = [];
  for (let r = 0; r < h; r++) {
    const s = reconstructScrollAt(capture, y0 + r);
    rows.push({ scroll_x: s.coarse_x * 8 + s.fine_x, nt_x: s.nametable_x, v_y: s.v_y, nt_y: s.nametable_y });
  }
  return rows;
}

/** The 64x64 window around (x, y), clamped to the screen. */
export function windowAround(x: number, y: number, size = WINDOW): ScreenBox {
  const w = Math.min(size, 256), h = Math.min(size, 240);
  return { x: Math.max(0, Math.min(x - (w >> 1), 256 - w)), y: Math.max(0, Math.min(y - (h >> 1), 240 - h)), width: w, height: h };
}

/** Flood-fill the map from (x, y) in screen coordinates. Pure. */
export function regionFromMap(map: ReadRegionResult, x: number, y: number, mode: "color" | "object"): RegionResult {
  const { w, h } = map;
  const at = (px: number, py: number): number => (py - map.y) * w + (px - map.x);
  const window: ScreenBox = { x: map.x, y: map.y, width: w, height: h };
  if (x < map.x || y < map.y || x >= map.x + w || y >= map.y + h) throw new Error(`(${x}, ${y}) is outside the window`);
  const start = at(x, y);
  const L = map.layer[start], P = map.palette[start], S = map.slot[start];
  const layer = L === 2 ? "sprite" : L === 1 ? "background" : "none";

  const empty = (summary: string): RegionResult => ({
    mode, x, y, layer, palette: P, slots: [], pixel_count: 0, bbox: { x, y, width: 1, height: 1 }, runs: [], truncated: false,
    tiles: [], oam: [], window, free_slots: [], summary,
  });
  if (L === 0) return empty("No region: the PPU had rendering switched off at this instant (a scene transition), so nothing is drawn here and the screen shows the last frame; resume or step and click again.");

  // Backdrop in object mode is "no object"; select its slot run instead so the answer is still useful.
  const objectMode = mode === "object" && !(L === 1 && S === 0);
  const member = (i: number): boolean => map.layer[i] === L && map.palette[i] === P && (objectMode ? map.slot[i] !== 0 : map.slot[i] === S);

  const seen = new Uint8Array(w * h);
  const stack = [start];
  seen[start] = 1;
  const members: number[] = [];
  while (stack.length) {
    const i = stack.pop()!;
    members.push(i);
    const cx = i % w, cy = (i - cx) / w;
    const nbrs = [cx > 0 ? i - 1 : -1, cx < w - 1 ? i + 1 : -1, cy > 0 ? i - w : -1, cy < h - 1 ? i + w : -1];
    for (const j of nbrs) if (j >= 0 && !seen[j] && member(j)) { seen[j] = 1; stack.push(j); }
  }

  let minX = w, minY = h, maxX = -1, maxY = -1, truncated = false;
  const slots = new Set<number>(), tiles = new Set<number>(), oam = new Set<number>();
  const inRegion = new Uint8Array(w * h);
  for (const i of members) {
    inRegion[i] = 1;
    const cx = i % w, cy = (i - cx) / w;
    if (cx < minX) minX = cx; if (cx > maxX) maxX = cx; if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
    slots.add(map.slot[i]);
    if (map.tile[i] >= 0) tiles.add(map.tile[i]);
    if (map.oam[i] >= 0) oam.add(map.oam[i]);
    // The window edge is only a truncation when it is not also the screen edge.
    if ((cx === 0 && map.x > 0) || (cx === w - 1 && map.x + w < 256) || (cy === 0 && map.y > 0) || (cy === h - 1 && map.y + h < 240)) truncated = true;
  }
  const runs: RegionRun[] = [];
  for (let cy = minY; cy <= maxY; cy++) {
    let runStart = -1;
    for (let cx = 0; cx <= w; cx++) {
      const on = cx < w && inRegion[cy * w + cx] === 1;
      if (on && runStart < 0) runStart = cx;
      if (!on && runStart >= 0) { runs.push({ y: map.y + cy, x0: map.x + runStart, x1: map.x + cx - 1 }); runStart = -1; }
    }
  }

  // Blast radius of a palette edit: same layer, palette and slot elsewhere in the window.
  const usage = new Map<number, number>();
  let sharePixels = 0;
  const shareTiles = new Set<number>(), shareOam = new Set<number>();
  for (let i = 0; i < w * h; i++) {
    if (map.layer[i] !== L || map.palette[i] !== P) continue;
    usage.set(map.slot[i], (usage.get(map.slot[i]) ?? 0) + 1);
    if (mode === "color" && !inRegion[i] && map.slot[i] === S) {
      sharePixels++;
      if (map.tile[i] >= 0) shareTiles.add(map.tile[i]);
      if (map.oam[i] >= 0) shareOam.add(map.oam[i]);
    }
  }
  const free_slots = [1, 2, 3].filter((s) => !usage.has(s));

  const sorted = (s: Set<number>): number[] => [...s].sort((a, b) => a - b);
  const result: RegionResult = {
    mode, x, y, layer, palette: P, ...(mode === "color" ? { slot: S } : {}), slots: sorted(slots), pixel_count: members.length,
    bbox: { x: map.x + minX, y: map.y + minY, width: maxX - minX + 1, height: maxY - minY + 1 }, runs, truncated,
    tiles: sorted(tiles), oam: sorted(oam), window, free_slots, summary: "",
    ...(mode === "color" ? { sharing: { pixels: sharePixels, tiles: sorted(shareTiles), oam: sorted(shareOam) } } : {}),
  };
  result.summary = describeRegion(result);
  return result;
}

/** The region sentence for the model: what was selected, and what each edit path would also change. */
export function describeRegion(r: RegionResult): string {
  if (r.pixel_count === 0) return r.summary || "Nothing is drawn at this pixel.";
  const palName = r.layer === "sprite" ? `sprite palette ${r.palette}` : `background palette ${r.palette}`;
  const where = r.layer === "sprite" ? `OAM ${list(r.oam, "#")} (CHR ${list(r.tiles, "")})` : `background CHR ${list(r.tiles, "")}`;
  const box = `box (${r.bbox.x},${r.bbox.y})-(${r.bbox.x + r.bbox.width - 1},${r.bbox.y + r.bbox.height - 1})`;
  let s = r.mode === "color"
    ? `Selected region (color mode): ${r.pixel_count} pixels of slot ${r.slot} of ${palName} across ${where}, ${box}.`
    : `Selected region (object mode): ${r.pixel_count} connected pixels of ${palName} using slots ${r.slots.join(", ")} across ${where}, ${box}.`;
  if (r.layer === "background" && r.slots.length === 1 && r.slots[0] === 0) s += " Slot 0 is the shared backdrop: every background palette renders it.";
  if (r.mode === "color" && r.sharing) {
    s += r.sharing.pixels > 0
      ? ` A palette edit of that slot also recolors ${r.sharing.pixels} other pixels in view that use it (${r.layer === "sprite" ? `OAM ${list(r.sharing.oam, "#")}, ` : ""}CHR ${list(r.sharing.tiles, "")}).`
      : " No other pixel in view uses that slot, so a palette edit changes only this region (and whatever uses it off screen).";
  }
  s += r.free_slots.length > 0
    ? ` Slot${r.free_slots.length > 1 ? "s" : ""} ${r.free_slots.join(", ")} of ${palName} ${r.free_slots.length > 1 ? "are" : "is"} unused in view: a tile edit could move these pixels there for a color of their own.`
    : ` ${palName[0].toUpperCase() + palName.slice(1)} has no free slot in view, so a tile edit cannot give these pixels a color of their own without taking one from another part of the same tiles.`;
  if (r.truncated) s += " The region reaches the edge of the 64x64 window and continues beyond it.";
  return s;
}

/** Window the bridge around (x, y) with the frame's scroll and fill from that pixel. */
export async function getRegionAt(adapter: MesenAdapter, x: number, y: number, mode: "color" | "object", capture?: ScrollCaptureResult): Promise<RegionResult> {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > 255 || y < 0 || y > 239) {
    throw new Error(`x must be 0-255 and y 0-239, got (${x}, ${y})`);
  }
  const win = windowAround(x, y);
  const cap = capture ?? await adapter.captureScrollWrites(1);
  const map = await adapter.readRegion({ x: win.x, y: win.y, w: win.width, h: win.height, rows: windowRows(cap, win.y, win.height) });
  return regionFromMap(map, x, y, mode);
}
