// ADR-0020: a run must not start from its own lines' earlier answers.
import { describe, expect, it } from "vitest";
import { stripLines } from "./eval-mapping-in.mjs";

describe("eval-mapping-in", () => {
  it("holds back the in-scope lines' entries and keeps everything else", () => {
    const mapping = { addresses: { "0x07DE": { description: "score" }, "0x075A": { description: "lives" } }, routines: { "0x8082": { name: "nmi" } }, notes: ["x"] };
    const spec = { lines: [
      { id: "C1.score", entry: "addresses.0x07DE" },
      { id: "C1.lives", entry: "addresses.0x075A" },
      { id: "E1.nmi", entry: "routines.0x8082" },
    ] };
    const { mapping: out, removed } = stripLines(mapping, spec, ["C1.score", "E1.nmi"]);
    expect(removed).toEqual(["addresses.0x07DE", "routines.0x8082"]);
    expect(Object.keys(out.addresses)).toEqual(["0x075A"]);
    expect(out.notes).toEqual(["x"]);
    expect(Object.keys(mapping.addresses)).toHaveLength(2);
  });

  it("also holds back entries and notes that name a held-back address", () => {
    const mapping = { addresses: { "0x0086": { description: "x" }, "0x03AD": { description: "screen x = $0086 - scroll" }, "0x0860": { description: "unrelated" } }, notes: ["page 0x006D + low 0x0086", "other"] };
    const spec = { lines: [{ id: "x", entry: "addresses.0x0086" }] };
    const { mapping: out } = stripLines(mapping, spec, ["x"]);
    expect(Object.keys(out.addresses)).toEqual(["0x0860"]);
    expect(out.notes).toEqual(["other"]);
  });

  it("holds back mentions of a held-back entry's ROM origin, as a PRG offset or a CPU address", () => {
    const mapping = { tiles: { "0x53-0x56": { name: "? block", rom_origins: [{ mem: "prgRom", offset: 0xc8c, length: 4 }] } },
      routines: { "0x8B00": { name: "draws from $8C8C" } }, notes: ["table at prgRom 0xC8C", "other"] };
    const spec = { prg_base: 0x8000, lines: [{ id: "m", entry: "tiles.0x53-0x56" }] };
    const { mapping: out } = stripLines(mapping, spec, ["m"]);
    expect(out.routines).toEqual({});
    expect(out.notes).toEqual(["other"]);
  });
});
