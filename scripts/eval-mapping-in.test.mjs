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
});
