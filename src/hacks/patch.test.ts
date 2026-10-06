import { describe, it, expect } from "vitest";
import { applyBps, applyEdits, applyIps, crc32, diffRuns, encodeBps, encodeIps, fileOffset, inesLayout } from "./patch.js";
import type { EditEntry } from "./store.js";

// A tiny iNES image: 16-byte header, 1 PRG bank (16 KiB), 1 CHR bank (8 KiB), no trainer.
function fakeRom(seed = 1): Uint8Array {
  const rom = new Uint8Array(16 + 16384 + 8192);
  rom.set([0x4e, 0x45, 0x53, 0x1a, 1, 1, 0, 0]);
  let x = seed;
  for (let i = 16; i < rom.length; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    rom[i] = x & 0xff;
  }
  return rom;
}

// Element-wise matchers crawl multi-megabyte arrays; compare bytes directly.
const same = (a: Uint8Array, b: Uint8Array) => Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;

const edit = (seq: number, mem: "prgRom" | "chrRom", offset: number, oldB: number[], newB: number[]): EditEntry =>
  ({ seq, at: "t", tool: "write_memory", mem, offset, length: newB.length, old: oldB, new: newB });

describe("crc32", () => {
  it("matches the IEEE check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe("iNES layout (ADR-0009 header rule)", () => {
  it("places PRG after the header and CHR after PRG, honoring a trainer", () => {
    const rom = fakeRom();
    const l = inesLayout(rom);
    expect(l).toMatchObject({ headerSize: 16, trainerSize: 0, prgSize: 16384, chrSize: 8192, prgStart: 16, chrStart: 16 + 16384 });
    expect(fileOffset(l, "prgRom", 0xccc)).toBe(16 + 0xccc);
    expect(fileOffset(l, "chrRom", 0xb60, 16)).toBe(16 + 16384 + 0xb60);
    const trained = new Uint8Array(rom.length + 512);
    trained.set(rom.subarray(0, 16));
    trained[6] |= 0x04;
    expect(inesLayout(trained).prgStart).toBe(16 + 512);
  });

  it("rejects non-iNES data and out-of-range offsets", () => {
    expect(() => inesLayout(new Uint8Array([1, 2, 3]))).toThrow(/iNES/);
    const l = inesLayout(fakeRom());
    expect(() => fileOffset(l, "prgRom", 16384)).toThrow(/outside/);
    expect(() => fileOffset(l, "chrRom", 8192 - 8, 16)).toThrow(/outside/);
  });

  it("applies ledger entries at file offsets, later entries winning", () => {
    const rom = fakeRom();
    const out = applyEdits(rom, [edit(1, "prgRom", 0xccc, [rom[16 + 0xccc]], [0x16]), edit(2, "prgRom", 0xccc, [0x16], [0x29]), edit(3, "chrRom", 0, [0, 0], [1, 2])]);
    expect(out[16 + 0xccc]).toBe(0x29);
    expect(Array.from(out.subarray(16 + 16384, 16 + 16384 + 2))).toEqual([1, 2]);
    expect(rom[16 + 0xccc]).not.toBe(0x29); // original untouched
  });
});

describe("IPS", () => {
  it("round-trips a sparse edit through the independent applier", () => {
    const src = fakeRom();
    const tgt = new Uint8Array(src);
    tgt[16 + 0xccc] ^= 0xff;
    tgt[20000] ^= 0xff;
    tgt[20001] ^= 0xff;
    const ips = encodeIps(src, tgt);
    expect(String.fromCharCode(...ips.subarray(0, 5))).toBe("PATCH");
    expect(String.fromCharCode(...ips.subarray(ips.length - 3))).toBe("EOF");
    expect(same(applyIps(src, ips), tgt)).toBe(true);
    expect(diffRuns(src, tgt).length).toBe(2);
  });

  it("never starts a record at offset 0x454F46 and splits runs longer than 65535", () => {
    const src = new Uint8Array(0x460000);
    const tgt = new Uint8Array(src);
    tgt[0x454f46] = 7; // the "EOF" offset
    for (let i = 0x100; i < 0x100 + 70000; i++) tgt[i] = 9; // > one record
    const ips = encodeIps(src, tgt);
    // Scan the records ourselves: no record header may read as EOF before the real end.
    let p = 5;
    const starts: number[] = [];
    while (p < ips.length - 3) {
      const off = (ips[p] << 16) | (ips[p + 1] << 8) | ips[p + 2];
      const size = (ips[p + 3] << 8) | ips[p + 4];
      starts.push(off);
      p += 5 + size;
    }
    expect(starts).not.toContain(0x454f46);
    expect(starts.length).toBeGreaterThanOrEqual(3);
    expect(same(applyIps(src, ips), tgt)).toBe(true);
  });

  it("merges runs separated by small gaps into one record", () => {
    const src = new Uint8Array(100);
    const tgt = new Uint8Array(100);
    tgt[10] = 1; tgt[13] = 1; // gap of 2 equal bytes
    tgt[50] = 1;
    expect(diffRuns(src, tgt).map((r) => [r.offset, r.bytes.length])).toEqual([[10, 4], [50, 1]]);
  });
});

describe("BPS", () => {
  it("round-trips with all three CRC32s verified and metadata carried", () => {
    const src = fakeRom(2);
    const tgt = new Uint8Array(src);
    tgt[16 + 0xccc] = 0x16;
    tgt[16 + 16384 + 5] ^= 0xff;
    const bps = encodeBps(src, tgt, '{"made_by":"jeROMy"}');
    expect(String.fromCharCode(...bps.subarray(0, 4))).toBe("BPS1");
    const applied = applyBps(src, bps);
    expect(same(applied.target, tgt)).toBe(true);
    expect(applied.metadata).toBe('{"made_by":"jeROMy"}');
  });

  it("refuses the wrong source ROM and a corrupted patch", () => {
    const src = fakeRom(3);
    const tgt = new Uint8Array(src);
    tgt[100] = 0;
    const bps = encodeBps(src, tgt);
    expect(() => applyBps(fakeRom(4), bps)).toThrow(/source CRC32/);
    const bad = new Uint8Array(bps);
    bad[10] ^= 1;
    expect(() => applyBps(src, bad)).toThrow(/patch CRC32/);
  });

  it("encodes varints the beat way (subtract-one continuation)", () => {
    // 128 encodes as 0x00 0x80: low 7 bits 0, then (128/128 - 1) = 0 with the stop bit.
    const src = new Uint8Array(128);
    const tgt = new Uint8Array(128);
    tgt[127] = 1;
    const bps = encodeBps(src, tgt);
    // Header: "BPS1", source size 128, target size 128, metadata size 0.
    expect(Array.from(bps.subarray(4, 9))).toEqual([0x00, 0x80, 0x00, 0x80, 0x80]);
    expect(same(applyBps(src, bps).target, tgt)).toBe(true);
  });

  it("survives a fuzz of random same-length edits", () => {
    let x = 99;
    const rnd = () => (x = (x * 1103515245 + 12345) & 0x7fffffff);
    for (let round = 0; round < 20; round++) {
      const src = fakeRom(round + 10);
      const tgt = new Uint8Array(src);
      const n = 1 + (rnd() % 40);
      for (let k = 0; k < n; k++) tgt[16 + (rnd() % (tgt.length - 16))] = rnd() & 0xff;
      expect(same(applyBps(src, encodeBps(src, tgt)).target, tgt)).toBe(true);
      expect(same(applyIps(src, encodeIps(src, tgt)), tgt)).toBe(true);
    }
  });
});
