import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { applyWrite, reconstructScrollAt, tileAddressAt, type ScrollCapture, type ScrollWrite } from "./scroll-reconstruct.js";

// Fixtures: Super Mario Bros. (World) title screen, captured by Claude on
// 2026-10-05 with `scripts/bridge-call.mjs capture_scroll_writes` through
// mesen/bridge.lua (Mesen2 2.1.1). SMB's NMI writes $2005 twice in vblank
// (status-bar scroll 0) and again at scanline 31 after the sprite-0 hit
// (playfield scroll). In the running fixture the attract demo had not
// started scrolling (playfield 0); in the paused fixture it had
// (playfield X 52 then 53 across the two stepped frames).
const running = JSON.parse(readFileSync(new URL("./fixtures/smb-title-running.json", import.meta.url), "utf8")) as ScrollCapture;
const paused = JSON.parse(readFileSync(new URL("./fixtures/smb-title-paused.json", import.meta.url), "utf8")) as ScrollCapture;

const base = { frames: 1, stepped_frames: 0, start_frame: 0, end_frame: 1, other_register_writes: 0, final: { t: 0, v: 0, x: 0, w: false, scanline: 240, cycle: 0 } };
const w = (scanline: number, cycle: number, reg: number, value: number, pre: Partial<ScrollWrite> = {}): ScrollWrite =>
  ({ frame: 0, scanline, cycle, reg, value, t: 0, v: 0, x: 0, w: false, ...pre });

describe("applyWrite (loopy registers, ADR-0010)", () => {
  it("$2005 pair sets coarse/fine X then coarse/fine Y in t, never v", () => {
    const a = applyWrite({ t: 0, v: 0x1234, x: 0, w: false }, 5, 53);
    expect(a.state).toMatchObject({ t: 6, x: 5, w: true, v: 0x1234 });
    expect(a.completedUpdate).toBe(false);
    const b = applyWrite(a.state, 5, 64 + 3);
    expect(b.state.t).toBe((3 << 12) | (8 << 5) | 6);
    expect(b.state.v).toBe(0x1234);
    expect(b.completedUpdate).toBe(true);
  });

  it("$2006 pair loads v from t and $2000 sets the nametable bits", () => {
    const a = applyWrite({ t: 0, v: 0, x: 0, w: false }, 6, 0x21);
    const b = applyWrite(a.state, 6, 0x40);
    expect(b.state.v).toBe(0x2140);
    expect(b.loadedV).toBe(true);
    const c = applyWrite(b.state, 0, 0x93);
    expect((c.state.t >> 10) & 3).toBe(3);
  });

  it("matches Mesen's own pre-write state for the next write in the recorded fixture", () => {
    // Consecutive writes within a frame: our result after write i equals Mesen's t/x before write i+1.
    const writes = paused.writes.filter((x) => x.frame === 1);
    for (let i = 0; i + 1 < writes.length; i++) {
      const r = applyWrite({ t: writes[i].t, v: writes[i].v, x: writes[i].x, w: writes[i].w }, writes[i].reg, writes[i].value);
      expect([r.state.t, r.state.x]).toEqual([writes[i + 1].t, writes[i + 1].x]);
    }
  });
});

describe("reconstructScrollAt on the SMB title fixtures", () => {
  it("running: status bar lines use the vblank scroll, playfield lines the scanline-31 pair", () => {
    const top = reconstructScrollAt(running, 20);
    expect(top.scroll_source).toBe("vblank");
    expect(top.scroll_x).toBe(0);
    const field = reconstructScrollAt(running, 100);
    expect(field.scroll_source).toBe("scanline");
    expect(field.applied_scanline).toBe(31);
    expect(field.scroll_x).toBe(0);
    expect(field.scroll_y).toBe(0);
    expect(field.v_y).toBe(100);
  });

  it("paused: uses the last stepped frame, whose playfield X is 53", () => {
    const field = reconstructScrollAt(paused, 182);
    expect(field).toMatchObject({ scroll_source: "scanline", applied_scanline: 31, coarse_x: 6, fine_x: 5, scroll_x: 53, nametable_x: 0, scroll_y: 0 });
    const top = reconstructScrollAt(paused, 10);
    expect(top).toMatchObject({ scroll_source: "vblank", scroll_x: 0 });
    expect(field.ambiguous).toBe(false);
  });
});

describe("reconstructScrollAt on hand-written write lists", () => {
  it("a mid-frame $2005 Y write does not move Y this frame", () => {
    const cap: ScrollCapture = { ...base, writes: [w(241, 10, 5, 0), w(241, 20, 5, 0, { w: true }), w(50, 10, 5, 0), w(50, 20, 5, 64, { w: true })] };
    const s = reconstructScrollAt(cap, 100);
    expect(s.scroll_y).toBe(0);
    expect(s.v_y).toBe(100);
  });

  it("a mid-frame $2006 pair moves Y immediately and increments from there", () => {
    // Load v with coarse Y 10, fine Y 0, nametable 0 at scanline 100, before dot 256.
    // (Writing $2140 would set fine Y 2: bit 13 of the address is a fine-Y bit.)
    const addr = 10 << 5;
    const cap: ScrollCapture = { ...base, writes: [w(100, 50, 6, addr >> 8), w(100, 60, 6, addr & 0xff, { w: true })] };
    const s = reconstructScrollAt(cap, 120);
    expect(s.v_y).toBe(80 + 20);
    expect(s.scroll_y).toBe((100 - 120 + 240) % 240);
    expect(s.scroll_source).toBe("scanline");
    expect(s.applied_scanline).toBe(100);
  });

  it("a $2006 load after dot 257 of the previous line still governs this line's X", () => {
    const addr = 0x2400 | 5; // nametable 1, coarse X 5
    const cap: ScrollCapture = { ...base, writes: [w(99, 300, 6, addr >> 8), w(99, 310, 6, addr & 0xff, { w: true })] };
    const s = reconstructScrollAt(cap, 100);
    expect(s.coarse_x).toBe(5);
    expect(s.nametable_x).toBe(1);
  });

  it("flags ambiguity when two completed updates land above the scanline", () => {
    const cap: ScrollCapture = { ...base, writes: [w(30, 10, 5, 8), w(30, 20, 5, 0, { w: true }), w(60, 10, 5, 16), w(60, 20, 5, 0, { w: true })] };
    expect(reconstructScrollAt(cap, 45).ambiguous).toBe(false);
    expect(reconstructScrollAt(cap, 100).ambiguous).toBe(true);
    expect(reconstructScrollAt(cap, 100).scroll_x).toBe(16);
  });

  it("a $2005 pair and a $2000 nametable switch on the same line are one split, not an ambiguity", () => {
    // SMB during the attract demo when the playfield has crossed into nametable 1 (seen 2026-10-05, session 44791c92).
    const cap: ScrollCapture = { ...base, writes: [w(241, 10, 5, 0), w(241, 20, 5, 0, { w: true }), w(31, 95, 5, 68), w(31, 119, 5, 0, { w: true }), w(31, 152, 0, 0x11)] };
    const s = reconstructScrollAt(cap, 182);
    expect(s).toMatchObject({ ambiguous: false, scroll_x: 68, nametable_x: 1, applied_scanline: 31 });
  });

  it("no writes at all: falls back to the final state as vblank", () => {
    const cap: ScrollCapture = { ...base, final: { ...base.final, t: 3, x: 4 }, writes: [] };
    expect(reconstructScrollAt(cap, 50)).toMatchObject({ scroll_source: "vblank", scroll_x: 28 });
  });
});

describe("tileAddressAt", () => {
  const at = (coarse_x: number, fine_x: number, nametable_x: number, v_y: number, nametable_y = 0) =>
    ({ coarse_x, fine_x, nametable_x, v_y, nametable_y, scroll_x: 0, scroll_y: 0, scroll_source: "vblank" as const, applied_scanline: -1, ambiguous: false, updates_in_frame: 0 });

  it("adds fine scroll before dividing, so x%8 + fine >= 8 lands on the next tile", () => {
    // Logan's click: (176,182) with playfield X 53 → absolute 229 → tile 28, row 22.
    const t = tileAddressAt(176, 182, at(6, 5, 0, 182));
    expect(t).toMatchObject({ nametable: 0, tile_x: 28, tile_y: 22, nametable_addr: 0x2000 + 22 * 32 + 28 });
    expect(tileAddressAt(7, 0, at(0, 1, 0, 0)).tile_x).toBe(1);
  });

  it("wraps into the right nametable and computes the attribute cell", () => {
    // coarse 31, fine 7, x 33 → absolute 288 → tile 36 → wraps to tile 4 of the next nametable.
    const t = tileAddressAt(33, 100, at(31, 7, 0, 100));
    expect(t).toMatchObject({ nametable: 1, tile_x: 4, tile_y: 12 });
    expect(t.attribute_addr).toBe(0x2400 + 0x3c0 + 3 * 8 + 1);
    expect(t.attribute_shift).toBe(0);
    expect(tileAddressAt(0, 0, at(0, 0, 1, 0, 1)).nametable).toBe(3);
  });
});
