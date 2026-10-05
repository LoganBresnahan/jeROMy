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

  it("parses assembler equates with comments, and wiki CSV/TSV tables", () => {
    const asm = parseAsmEquates("NumberOfLives = $075a ; lives, minus one\n  lda #$00\nFrameCounter   .equ $09\nTimerControl EQU $0747\n", "smb1.asm");
    expect(asm.map((s) => [s.name, s.address, s.notes])).toEqual([["FrameCounter", 9, undefined], ["TimerControl", 0x747, undefined], ["NumberOfLives", 0x75a, "lives, minus one"]]);
    expect(asm[0].file).toBe("smb1.asm");
    const wiki = parseWikiTable("Address,Name,Notes\n0x075A,Lives,Number of lives minus one\n$075E\tCoins\tBCD, two digits\n75F,World,zero-based\n");
    expect(wiki.map((s) => [s.address, s.name, s.kind])).toEqual([[0x75a, "Lives", "wiki"], [0x75e, "Coins", "wiki"], [0x75f, "World", "wiki"]]);
    expect(wiki[1].notes).toBe("BCD, two digits");
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
