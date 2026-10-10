import { crc32, deflateSync } from "node:zlib";

/** Colors for palette indices 0-3 when no palette is given: distinct, so the model can tell the indices apart. */
export const INDEX_COLORS: [number, number, number][] = [[24, 24, 24], [230, 60, 60], [240, 200, 80], [90, 170, 255]];

// 3x5 hex digits, one row per string, '#' lit; B and D are drawn lowercase so they never read as 8 and 0.
const FONT: Record<string, string[]> = {
  "0": ["###", "#.#", "#.#", "#.#", "###"], "1": [".#.", "##.", ".#.", ".#.", "###"],
  "2": ["###", "..#", "###", "#..", "###"], "3": ["###", "..#", "###", "..#", "###"],
  "4": ["#.#", "#.#", "###", "..#", "..#"], "5": ["###", "#..", "###", "..#", "###"],
  "6": ["###", "#..", "###", "#.#", "###"], "7": ["###", "..#", "..#", "..#", "..#"],
  "8": ["###", "#.#", "###", "#.#", "###"], "9": ["###", "#.#", "###", "..#", "###"],
  A: [".#.", "#.#", "###", "#.#", "#.#"], B: ["#..", "#..", "###", "#.#", "###"],
  C: ["###", "#..", "#..", "#..", "###"], D: ["..#", "..#", "###", "#.#", "###"],
  E: ["###", "#..", "###", "#..", "###"], F: ["###", "#..", "###", "#..", "#.."],
};

export interface TileSheet { png: Buffer; width: number; height: number; columns: number; rows: number }

/**
 * Render 2bpp NES tiles (16 bytes each) as a labelled grid: a column header with the low hex digit, and a row
 * label with the row's first tile id in hex, so tile id = row label + column is readable from the image alone.
 * With first null the tiles are an arbitrary list laid out as one picture (a metasprite): no labels, no grid lines.
 */
export function renderTileSheet(bytes: Uint8Array, first: number | null, colors: [number, number, number][] = INDEX_COLORS, scale = 3, columns = 16): TileSheet {
  const count = Math.floor(bytes.length / 16);
  const rows = Math.ceil(count / columns);
  const labelled = first !== null;
  const cell = 8 * scale + (labelled ? 1 : 0);
  const glyph = 2; // font scale
  const labelW = labelled ? 3 * 4 * glyph + 4 : 0;
  const headerH = labelled ? 5 * glyph + 4 : 0;
  const edge = labelled ? 1 : 0;
  const width = labelW + columns * cell + edge;
  const height = headerH + rows * cell + edge;
  const px = Buffer.alloc(width * height * 3, 0x60); // grid lines and margins
  const set = (x: number, y: number, [r, g, b]: [number, number, number]) => { const o = (y * width + x) * 3; px[o] = r; px[o + 1] = g; px[o + 2] = b; };
  const fill = (x0: number, y0: number, w: number, h: number, c: [number, number, number]) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, c); };
  const text = (s: string, x0: number, y0: number) => {
    [...s].forEach((ch, i) => FONT[ch].forEach((row, y) => [...row].forEach((on, x) => {
      if (on === "#") fill(x0 + (i * 4 + x) * glyph, y0 + y * glyph, glyph, glyph, [255, 255, 255]);
    })));
  };
  if (first !== null) {
    fill(0, 0, width, headerH, [0, 0, 0]);
    fill(0, 0, labelW, height, [0, 0, 0]);
    for (let c = 0; c < columns; c++) text(c.toString(16).toUpperCase(), labelW + c * cell + Math.floor((cell - 3 * glyph) / 2), 2);
    for (let r = 0; r < rows; r++) text((first + r * columns).toString(16).toUpperCase().padStart(3, "0"), 2, headerH + r * cell + Math.floor((cell - 5 * glyph) / 2));
  }
  for (let t = 0; t < count; t++) {
    const x0 = labelW + (t % columns) * cell + edge;
    const y0 = headerH + Math.floor(t / columns) * cell + edge;
    for (let y = 0; y < 8; y++) {
      const lo = bytes[t * 16 + y], hi = bytes[t * 16 + 8 + y];
      for (let x = 0; x < 8; x++) {
        const idx = ((lo >> (7 - x)) & 1) | (((hi >> (7 - x)) & 1) << 1);
        fill(x0 + x * scale, y0 + y * scale, scale, scale, colors[idx]);
      }
    }
  }
  return { png: encodePng(px, width, height), width, height, columns, rows };
}

/** Minimal RGB8 PNG: one IDAT, filter 0 on every row. */
export function encodePng(rgb: Buffer, width: number, height: number): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
