import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findSymbols, formatSymbol, loadReference, nearestSymbol, parseAsmEquates, parseCc65Dbg, parseWikiTable, saveReference } from "./reference.js";

// Shapes hand-copied from a cc65 v2 dbgfile and from smbdis-style sources (Claude, 2026-10-05); values are illustrative.
const DBG = `version\tmajor=2,minor=0
file\tid=0,name="src/main.asm",size=1,mtime=0x0,mod=0
sym\tid=1,name="NumberOfLives",addrsize=absolute,size=1,scope=0,def=5,ref=7+9,val=0x75A,type=equ
sym\tid=2,name="NonMaskableInterrupt",addrsize=absolute,scope=0,def=11,ref=12,val=0x8082,seg=0,type=lab
sym\tid=3,name="@loop",addrsize=absolute,scope=0,def=13,val=0x8090,seg=0,type=lab
sym\tid=4,name="AreaPalette",addrsize=absolute,size=16,scope=0,def=20,val=0x8CBB,seg=0,type=lab
sym\tid=5,name="NumberOfLives",addrsize=absolute,size=1,scope=0,def=5,val=0x75A,type=equ
seg\tid=0,name="CODE",start=0x8000,size=0x8000,addrsize=absolute,type=ro
`;

describe("reference symbols (ADR-0017)", () => {
  it("parses cc65 dbg sym records, drops local labels and duplicates, sorts by address", () => {
    const syms = parseCc65Dbg(DBG);
    expect(syms.map((s) => [s.name, s.address, s.kind])).toEqual([
      ["NumberOfLives", 0x75a, "equ"],
      ["NonMaskableInterrupt", 0x8082, "label"],
      ["AreaPalette", 0x8cbb, "label"],
    ]);
    expect(syms[2].size).toBe(16);
  });

  it("gives a banked label its PRG offset from its segment, less a header segment, and keeps same-address labels of different banks", () => {
    // Shape of aldonunez/zelda1-disassembly's Z.dbg (MMC1, eight 16 KiB banks), hand-checked by Claude 2026-10-09.
    const banked = `seg\tid=0,name="HEADER",start=0x000000,size=0x0010,addrsize=absolute,type=ro,oname="z.nes",ooffs=0
seg\tid=6,name="BANK_00_00",start=0x008D60,size=0x1299,addrsize=absolute,type=ro,oname="z.nes",ooffs=3440
seg\tid=9,name="BANK_01_00",start=0x008000,size=0x2500,addrsize=absolute,type=ro,oname="z.nes",ooffs=16400
sym\tid=0,name="NoteLengthTable4",addrsize=absolute,scope=0,def=480,val=0x9FF1,seg=6,type=lab
sym\tid=1,name="IsrReset",addrsize=absolute,scope=0,def=1,val=0x8000,seg=9,type=lab
sym\tid=2,name="IsrReset",addrsize=absolute,scope=0,def=1,val=0x8000,seg=6,type=lab
sym\tid=3,name="Lives",addrsize=absolute,scope=0,def=1,val=0x75A,type=equ
`;
    const syms = parseCc65Dbg(banked);
    expect(syms.find((s) => s.name === "NoteLengthTable4")?.rom_offset).toBe(0xd60 + (0x9ff1 - 0x8d60));
    expect(syms.filter((s) => s.name === "IsrReset").map((s) => s.rom_offset).sort((a, b) => a! - b!)).toEqual([0xd60 - 0xd60, 0x4000]);
    expect(syms.find((s) => s.name === "Lives")?.rom_offset).toBeUndefined();
  });

  it("parses assembler equates with comments, and wiki CSV/TSV tables", () => {
    const asm = parseAsmEquates("NumberOfLives = $075a ; lives, minus one\n  lda #$00\nFrameCounter   .equ $09\nTimerControl EQU $0747\n", "smb1.asm");
    expect(asm.map((s) => [s.name, s.address, s.notes])).toEqual([["FrameCounter", 9, undefined], ["TimerControl", 0x747, undefined], ["NumberOfLives", 0x75a, "lives, minus one"]]);
    expect(asm[0].file).toBe("smb1.asm");
    const wiki = parseWikiTable("Address,Name,Notes\n0x075A,Lives,Number of lives minus one\n$075E\tCoins\tBCD, two digits\n75F,World,zero-based\n");
    expect(wiki.map((s) => [s.address, s.name, s.kind])).toEqual([[0x75a, "Lives", "wiki"], [0x75e, "Coins", "wiki"], [0x75f, "World", "wiki"]]);
    expect(wiki[1].notes).toBe("BCD, two digits");
    // Data Crystal's Zelda RAM map writes ranges; the start is the symbol and the span its size (2026-10-09).
    const ranges = parseWikiTable("0300-034F\tPPU update queue\tnametable writes\n$6000\u2013$6010\tPlayer names\t\n0070\tLink X\t0x00 left to 0xF0 right\n");
    expect(ranges.map((s) => [s.address, s.name, s.size])).toEqual([[0x70, "Link X", undefined], [0x300, "PPU update queue", 0x50], [0x6000, "Player names", 0x11]]);
    expect(ranges[1].notes).toBe("nametable writes");
    expect(ranges[2].notes).toBeUndefined();
  });

  it("finds the nearest label at or below an address, within a bound, preferring labels on ties", () => {
    const syms = parseCc65Dbg(DBG);
    expect(nearestSymbol(syms, 0x8082)).toMatchObject({ symbol: { name: "NonMaskableInterrupt" }, offset: 0 });
    expect(nearestSymbol(syms, 0x80a0)).toMatchObject({ symbol: { name: "NonMaskableInterrupt" }, offset: 0x1e });
    expect(nearestSymbol(syms, 0x75a)).toMatchObject({ symbol: { name: "NumberOfLives" }, offset: 0 });
    expect(nearestSymbol(syms, 0x7000)).toBeUndefined();
    expect(nearestSymbol(syms, 0x9000)).toMatchObject({ symbol: { name: "AreaPalette" }, offset: 0x345 });
    expect(nearestSymbol(syms, 0x9200)).toBeUndefined();
    expect(nearestSymbol(syms, 0x9200, 0x1000)?.symbol.name).toBe("AreaPalette");
  });

  it("finds by name exactly first, then by substring", () => {
    const syms = parseCc65Dbg(DBG);
    expect(findSymbols(syms, "numberoflives").map((s) => s.name)).toEqual(["NumberOfLives"]);
    expect(findSymbols(syms, "area").map((s) => s.name)).toEqual(["AreaPalette"]);
    expect(findSymbols(syms, "nothing")).toEqual([]);
    expect(formatSymbol(syms[2])).toBe("AreaPalette = $8CBB (label, 16 bytes)");
  });

  it("round-trips reference.json in a hack directory", () => {
    const dir = join(mkdtempSync(join(tmpdir(), "jeromy-ref-")), "sha1-abc");
    expect(loadReference(dir)).toBeNull();
    const p = saveReference(dir, { source: "test", imported_at: "2026-10-05T00:00:00Z", symbols: parseCc65Dbg(DBG) });
    expect(p.endsWith("reference.json")).toBe(true);
    expect(loadReference(dir)?.symbols).toHaveLength(3);
  });
});
