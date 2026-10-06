/**
 * Patch formats and the iNES layout (ADR-0009). Pure byte work, no I/O.
 *
 * IPS: "PATCH", records of 3-byte big-endian file offset, 2-byte length,
 * data (or length 0 + 2-byte run length + 1 byte for RLE), then "EOF".
 * Offsets are FILE offsets, so the iNES header shifts every ROM offset.
 * BPS: "BPS1", varint source/target/metadata sizes, actions, then CRC32 of
 * source, target and the patch itself; a BPS patch refuses the wrong ROM.
 *
 * `applyIps` and `applyBps` exist so the tests check the writers against an
 * independent reading of the formats, never against the writers' own
 * round trip alone.
 */

import type { EditEntry, RomMemory } from "./store.js";

// ---------------------------------------------------------------------------
// iNES layout

export interface InesLayout {
  headerSize: number;
  trainerSize: number;
  prgSize: number;
  chrSize: number;
  /** File offset of PRG ROM byte 0. */
  prgStart: number;
  /** File offset of CHR ROM byte 0 (equals prgStart + prgSize). */
  chrStart: number;
  fileSize: number;
}

/** Parse the 16-byte iNES header; throws on anything that is not iNES. */
export function inesLayout(rom: Uint8Array): InesLayout {
  if (rom.length < 16 || rom[0] !== 0x4e || rom[1] !== 0x45 || rom[2] !== 0x53 || rom[3] !== 0x1a) {
    throw new Error("not an iNES file (missing NES\\x1A header)");
  }
  const headerSize = 16;
  const trainerSize = rom[6] & 0x04 ? 512 : 0;
  const prgSize = rom[4] * 16384;
  const chrSize = rom[5] * 8192;
  const prgStart = headerSize + trainerSize;
  const chrStart = prgStart + prgSize;
  if (chrStart + chrSize > rom.length) {
    throw new Error(`iNES header claims ${prgSize + chrSize} ROM bytes but the file has ${rom.length - prgStart}`);
  }
  return { headerSize, trainerSize, prgSize, chrSize, prgStart, chrStart, fileSize: rom.length };
}

/** File offset of a ROM-memory offset, or a thrown error when it is outside that memory. */
export function fileOffset(layout: InesLayout, mem: RomMemory, offset: number, length = 1): number {
  const size = mem === "prgRom" ? layout.prgSize : layout.chrSize;
  if (offset < 0 || offset + length > size) throw new Error(`${mem} offset 0x${offset.toString(16)} (+${length}) is outside the ${size}-byte ${mem}`);
  return (mem === "prgRom" ? layout.prgStart : layout.chrStart) + offset;
}

/** Apply the ledger to a copy of the original file; later entries win. */
export function applyEdits(original: Uint8Array, edits: EditEntry[]): Uint8Array {
  const layout = inesLayout(original);
  const target = new Uint8Array(original);
  for (const e of edits) {
    const at = fileOffset(layout, e.mem, e.offset, e.length);
    target.set(e.new, at);
  }
  return target;
}

// ---------------------------------------------------------------------------
// CRC32 (IEEE, reflected), as beat/Flips compute it

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------
// Diff: the runs where target differs from source (same length)

export interface DiffRun {
  offset: number;
  bytes: Uint8Array;
}

/** Contiguous differing runs; runs separated by fewer than `joinGap` equal bytes are merged (smaller IPS). */
export function diffRuns(source: Uint8Array, target: Uint8Array, joinGap = 4): DiffRun[] {
  if (source.length !== target.length) throw new Error("diffRuns needs equal-length source and target");
  const runs: DiffRun[] = [];
  let i = 0;
  while (i < target.length) {
    if (source[i] === target[i]) { i++; continue; }
    const start = i;
    let end = i;
    while (end < target.length) {
      if (source[end] !== target[end]) { end++; continue; }
      let gap = 0;
      while (end + gap < target.length && source[end + gap] === target[end + gap] && gap < joinGap) gap++;
      if (end + gap < target.length && gap < joinGap) end += gap; else break;
    }
    runs.push({ offset: start, bytes: target.slice(start, end) });
    i = end;
  }
  return runs;
}

// ---------------------------------------------------------------------------
// IPS

const IPS_EOF = 0x454f46;
const IPS_MAX_OFFSET = 0x1000000;
const IPS_MAX_RECORD = 0xffff;

function be24(n: number): number[] { return [(n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]; }
function be16(n: number): number[] { return [(n >>> 8) & 0xff, n & 0xff]; }

/** Encode a same-length diff as IPS. Records never start at 0x454F46 ("EOF"); a run that would is begun one byte earlier. */
export function encodeIps(source: Uint8Array, target: Uint8Array): Uint8Array {
  const out: number[] = [0x50, 0x41, 0x54, 0x43, 0x48];
  for (const run of diffRuns(source, target)) {
    let offset = run.offset;
    let bytes = run.bytes;
    if (offset === IPS_EOF) {
      // Include the unchanged byte before so no record header reads as EOF.
      offset -= 1;
      bytes = new Uint8Array([source[offset], ...bytes]);
    }
    if (offset + bytes.length > IPS_MAX_OFFSET) throw new Error(`IPS cannot address offset 0x${(offset + bytes.length).toString(16)} (limit 16 MiB)`);
    for (let pos = 0; pos < bytes.length; pos += IPS_MAX_RECORD) {
      const chunk = bytes.subarray(pos, Math.min(pos + IPS_MAX_RECORD, bytes.length));
      let at = offset + pos;
      if (at === IPS_EOF) {
        // A split boundary landing on the forbidden offset: nudge back one byte (re-emitting one byte is harmless).
        at -= 1;
        out.push(...be24(at), ...be16(chunk.length + 1), target[at], ...chunk);
      } else {
        out.push(...be24(at), ...be16(chunk.length), ...chunk);
      }
    }
  }
  out.push(0x45, 0x4f, 0x46);
  return Uint8Array.from(out);
}

/** Independent IPS reader for the tests and for `export_patch --check`. */
export function applyIps(source: Uint8Array, patch: Uint8Array): Uint8Array {
  if (String.fromCharCode(...patch.subarray(0, 5)) !== "PATCH") throw new Error("not an IPS file");
  let out = new Uint8Array(source);
  let p = 5;
  const ensure = (n: number) => {
    if (n > out.length) { const grown = new Uint8Array(n); grown.set(out); out = grown; }
  };
  while (p < patch.length) {
    if (patch[p] === 0x45 && patch[p + 1] === 0x4f && patch[p + 2] === 0x46 && p + 3 >= patch.length - 3) break;
    const offset = (patch[p] << 16) | (patch[p + 1] << 8) | patch[p + 2];
    const size = (patch[p + 3] << 8) | patch[p + 4];
    p += 5;
    if (size === 0) {
      const rle = (patch[p] << 8) | patch[p + 1];
      const value = patch[p + 2];
      p += 3;
      ensure(offset + rle);
      out.fill(value, offset, offset + rle);
    } else {
      ensure(offset + size);
      out.set(patch.subarray(p, p + size), offset);
      p += size;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// BPS (linear: SourceRead over equal bytes, TargetRead over differing bytes)

function bpsVarint(value: number, out: number[]): void {
  let data = value;
  for (;;) {
    const x = data & 0x7f;
    data = Math.floor(data / 128);
    if (data === 0) { out.push(0x80 | x); return; }
    out.push(x);
    data -= 1;
  }
}

function le32(n: number): number[] { return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]; }

export function encodeBps(source: Uint8Array, target: Uint8Array, metadata = ""): Uint8Array {
  const out: number[] = [0x42, 0x50, 0x53, 0x31];
  bpsVarint(source.length, out);
  bpsVarint(target.length, out);
  const meta = new TextEncoder().encode(metadata);
  bpsVarint(meta.length, out);
  out.push(...meta);
  let i = 0;
  const n = target.length;
  while (i < n) {
    const same = i < source.length && source[i] === target[i];
    let j = i + 1;
    if (same) {
      while (j < n && j < source.length && source[j] === target[j]) j++;
      bpsVarint(((j - i - 1) << 2) | 0, out); // SourceRead
    } else {
      while (j < n && !(j < source.length && source[j] === target[j])) j++;
      bpsVarint(((j - i - 1) << 2) | 1, out); // TargetRead
      for (let k = i; k < j; k++) out.push(target[k]);
    }
    i = j;
  }
  out.push(...le32(crc32(source)), ...le32(crc32(target)));
  const body = Uint8Array.from(out);
  return Uint8Array.from([...body, ...le32(crc32(body))]);
}

function readVarint(buf: Uint8Array, pos: { p: number }): number {
  let data = 0;
  let shift = 1;
  for (;;) {
    const x = buf[pos.p++];
    data += (x & 0x7f) * shift;
    if (x & 0x80) break;
    shift *= 128;
    data += shift;
  }
  return data;
}

function readLe32(buf: Uint8Array, at: number): number {
  return (buf[at] | (buf[at + 1] << 8) | (buf[at + 2] << 16) | (buf[at + 3] << 24)) >>> 0;
}

/** Independent BPS reader supporting all four actions; verifies all three CRC32s. */
export function applyBps(source: Uint8Array, patch: Uint8Array): { target: Uint8Array; metadata: string } {
  if (String.fromCharCode(...patch.subarray(0, 4)) !== "BPS1") throw new Error("not a BPS file");
  const patchCrc = readLe32(patch, patch.length - 4);
  if (crc32(patch.subarray(0, patch.length - 4)) !== patchCrc) throw new Error("BPS patch CRC32 mismatch");
  const sourceCrc = readLe32(patch, patch.length - 12);
  const targetCrc = readLe32(patch, patch.length - 8);
  if (crc32(source) !== sourceCrc) throw new Error(`BPS source CRC32 mismatch: patch expects ${sourceCrc.toString(16)}, file is ${crc32(source).toString(16)}`);
  const pos = { p: 4 };
  const sourceSize = readVarint(patch, pos);
  const targetSize = readVarint(patch, pos);
  const metaSize = readVarint(patch, pos);
  if (sourceSize !== source.length) throw new Error(`BPS source size mismatch: ${sourceSize} vs ${source.length}`);
  const metadata = new TextDecoder().decode(patch.subarray(pos.p, pos.p + metaSize));
  pos.p += metaSize;
  const target = new Uint8Array(targetSize);
  let outputOffset = 0;
  let sourceRelative = 0;
  let targetRelative = 0;
  const end = patch.length - 12;
  while (pos.p < end) {
    const action = readVarint(patch, pos);
    const length = (action >>> 2) + 1;
    const command = action & 3;
    if (command === 0) {
      target.set(source.subarray(outputOffset, outputOffset + length), outputOffset);
      outputOffset += length;
    } else if (command === 1) {
      target.set(patch.subarray(pos.p, pos.p + length), outputOffset);
      pos.p += length;
      outputOffset += length;
    } else {
      const rel = readVarint(patch, pos);
      const delta = (rel & 1 ? -1 : 1) * (rel >>> 1);
      if (command === 2) {
        sourceRelative += delta;
        for (let k = 0; k < length; k++) target[outputOffset++] = source[sourceRelative++];
      } else {
        targetRelative += delta;
        for (let k = 0; k < length; k++) target[outputOffset++] = target[targetRelative++];
      }
    }
  }
  if (crc32(target) !== targetCrc) throw new Error("BPS target CRC32 mismatch after applying");
  return { target, metadata };
}
