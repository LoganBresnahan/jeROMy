import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { INDEX_COLORS, renderTileSheet } from "./tile-sheet.js";

function decode(png: Buffer) {
  expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  const idat: Buffer[] = [];
  for (let o = 8; o < png.length;) {
    const len = png.readUInt32BE(o), type = png.toString("ascii", o + 4, o + 8);
    if (type === "IDAT") idat.push(png.subarray(o + 8, o + 8 + len));
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const at = (x: number, y: number) => { const o = y * (width * 3 + 1) + 1 + x * 3; return [raw[o], raw[o + 1], raw[o + 2]]; };
  return { width, height, at };
}

describe("renderTileSheet (view_tiles)", () => {
  it("draws each 2bpp pixel in its index color at the grid position the labels name", () => {
    const bytes = new Uint8Array(32 * 16);
    // tile 17 (row 1, column 1): plane 0 all set, plane 1 clear -> every pixel index 1
    bytes.fill(0xff, 17 * 16, 17 * 16 + 8);
    // tile 0: plane 1 set only -> index 2
    bytes.fill(0xff, 8, 16);
    const sheet = renderTileSheet(bytes, 0x100);
    expect(sheet).toMatchObject({ columns: 16, rows: 2 });
    const { width, height, at } = decode(sheet.png);
    expect([width, height]).toEqual([sheet.width, sheet.height]);
    const labelW = 3 * 4 * 2 + 4, headerH = 5 * 2 + 4, cell = 25;
    expect(at(labelW + 1 + 4, headerH + 1 + 4)).toEqual(INDEX_COLORS[2]);
    expect(at(labelW + cell + 1 + 4, headerH + cell + 1 + 4)).toEqual(INDEX_COLORS[1]);
    expect(at(labelW + 2 * cell + 1 + 4, headerH + 1 + 4)).toEqual(INDEX_COLORS[0]);
  });
});
