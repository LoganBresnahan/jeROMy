// ADR-0022: the campaign mapping takes a line only from runs that graded it right, by majority;
// a majority-wrong line removes the mapping's same wrong entry; side discoveries fill gaps.
import { describe, expect, it } from "vitest";
import { apply, decide } from "./eval-promote.mjs";

const row = (line, id, final, proof = "write+look") => ({ line, kind: "address", id, final, proof });
const copy = (entries) => ({ addresses: entries, notes: [] });

describe("eval-promote", () => {
  it("replaces a line's wrong entry when two of three repeats graded it right", () => {
    const spec = { lines: [{ id: "score", entry: "addresses.0x07DE" }] };
    const runs = [
      { id: "r1", rows: [row("score", "0x07DD", "agrees")], copy: copy({ "0x07DD": { description: "score r1" } }) },
      { id: "r2", rows: [row("score", "0x07DE", "disagrees")], copy: copy({ "0x07DE": { description: "score r2" } }) },
      { id: "r3", rows: [row("score", "0x07DD", "agrees")], copy: copy({ "0x07DD": { description: "score r3" } }) },
    ];
    const mapping = { version: 3, addresses: { "0x07DE": { description: "old wrong" } }, notes: [] };
    const d = decide(spec.lines, runs);
    expect(d[0]).toMatchObject({ action: "replace", key: "0x07DD", from: "r1", votes: "2/3 right" });
    apply(mapping, spec, d, runs);
    expect(Object.keys(mapping.addresses)).toEqual(["0x07DD"]);
    expect(mapping.addresses["0x07DD"].description).toBe("score r1");
    expect(spec.lines[0]).toMatchObject({ entry: "addresses.0x07DD", status: "promoted", run: "r1" });
    expect(mapping.version).toBe(4);
  });

  it("removes the mapping's entry when a majority grades that same claim wrong, and never promotes an unproven right", () => {
    const spec = { lines: [{ id: "score", entry: "addresses.0x07DE" }, { id: "coins" }] };
    const runs = [
      { id: "r1", rows: [row("score", "0x07DE", "disagrees"), row("coins", "0x07ED", "agrees", null)], copy: copy({}) },
    ];
    const mapping = { addresses: { "0x07DE": { description: "old wrong" } }, notes: [] };
    const d = decide(spec.lines, runs);
    expect(d.map((x) => x.action)).toEqual(["remove-if-same", "none"]);
    apply(mapping, spec, d, runs);
    expect(mapping.addresses).toEqual({});
    expect(spec.lines[0].entry).toBeUndefined();
  });

  it("promotes a picture line Claude confirmed from the images (sheet 1)", () => {
    const spec = { lines: [{ id: "A3.brick" }] };
    const runs = [{ id: "r1", rows: [{ line: "A3.brick", kind: "tile", id: "chr:0x145", final: "confirmed", proof: "look" }], copy: { tiles: { "chr:0x145": { name: "brick" } }, notes: [] } }];
    const mapping = { tiles: {}, notes: [] };
    const d = decide(spec.lines, runs);
    expect(d[0]).toMatchObject({ action: "replace", record: "tiles", key: "chr:0x145" });
    apply(mapping, spec, d, runs);
    expect(mapping.tiles["chr:0x145"]).toEqual({ name: "brick" });
    expect(spec.lines[0]).toMatchObject({ status: "promoted", entry: "tiles.chr:0x145" });
  });

  it("takes every right tile of a picture line from the deciding run, and replaces all of the line's old ones", () => {
    const spec = { lines: [{ id: "A3.bush", entry: "tiles.0x35", entries: ["tiles.0x36"] }] };
    const t = (id) => ({ line: "A3.bush", kind: "tile", id, final: "confirmed", proof: "look" });
    const runs = [{ id: "r1", rows: [t("chr:0x135"), t("chr:0x136"), t("chr:0x125")], copy: { tiles: { "chr:0x135": { name: "a" }, "chr:0x136": { name: "b" }, "chr:0x125": { name: "c" } }, notes: [] } }];
    const mapping = { tiles: { "0x35": {}, "0x36": {} }, notes: [] };
    const d = decide(spec.lines, runs);
    apply(mapping, spec, d, runs);
    expect(Object.keys(mapping.tiles).sort()).toEqual(["chr:0x125", "chr:0x135", "chr:0x136"]);
    expect(spec.lines[0]).toMatchObject({ entry: "tiles.chr:0x135", entries: ["tiles.chr:0x136", "tiles.chr:0x125"] });
  });

  it("keeps a skipped line's claims out of the mapping, side discoveries included", () => {
    const spec = { lines: [{ id: "A3.hill" }, { id: "A3.bush" }] };
    const t = (line, id) => ({ line, kind: "tile", id, final: "confirmed", proof: "look" });
    const runs = [{ id: "r1", rows: [t("A3.hill", "chr:0x130"), t("A3.bush", "chr:0x135")], copy: { tiles: { "chr:0x130": {}, "chr:0x135": {} }, notes: [] } }];
    const mapping = { tiles: {}, notes: [] };
    apply(mapping, spec, decide([spec.lines[0]], runs), runs, ["A3.bush"]);
    expect(Object.keys(mapping.tiles)).toEqual(["chr:0x130"]);
  });

  it("adds side discoveries only where the mapping has nothing", () => {
    const spec = { lines: [{ id: "x" }] };
    const runs = [{ id: "r1", rows: [], copy: copy({ "0x03AD": { description: "new" }, "0x075A": { description: "lives from run" } }) }];
    const mapping = { addresses: { "0x075A": { description: "lives" } }, notes: [] };
    apply(mapping, spec, decide(spec.lines, runs), runs);
    expect(mapping.addresses["0x03AD"].description).toBe("new");
    expect(mapping.addresses["0x075A"].description).toBe("lives");
  });

  it("names a side entry on the spec line it answers, so a later run holds it back", () => {
    const spec = { lines: [{ id: "metatiles" }] };
    const runs = [{ id: "r1", rows: [{ line: "metatiles", kind: "origin", context: "tile", id: "chr:0x153", final: "unproven", proof: null }],
      copy: { tiles: { "chr:0x153": { name: "? block" } }, notes: [] } }];
    apply({ tiles: {}, notes: [] }, spec, decide(spec.lines, runs), runs);
    expect(spec.lines[0].entry).toBe("tiles.chr:0x153");
  });

  it("promotes an origin line by the parent entry that carries the origin", () => {
    const spec = { lines: [{ id: "metatiles" }] };
    const runs = [{ id: "r1", rows: [{ line: "metatiles", kind: "origin", context: "tile", id: "chr:0x153", final: "agrees", proof: "write+reset+look" }],
      copy: { tiles: { "chr:0x153": { name: "? block", rom_origins: [{ mem: "prgRom", offset: 0xc8c, length: 4 }] } }, notes: [] } }];
    const mapping = { tiles: {}, notes: [] };
    const d = decide(spec.lines, runs);
    expect(d[0]).toMatchObject({ action: "replace", record: "tiles", key: "chr:0x153" });
    apply(mapping, spec, d, runs);
    expect(mapping.tiles["chr:0x153"].name).toBe("? block");
  });

  it("prefers a real entry over a note, and never adds an in-scope line's other candidates as side entries", () => {
    const spec = { lines: [{ id: "frame" }] };
    const runs = [
      { id: "r1", rows: [{ line: "frame", kind: "origin", context: "note", id: "n", final: "agrees", proof: "write+reset+look" }], copy: { sprites: {}, notes: ["n"] } },
      { id: "r2", rows: [{ line: "frame", kind: "origin", context: "sprite", id: "mario_a", final: "agrees", proof: "write+reset+look" }], copy: { sprites: { mario_a: { tiles: [] } }, notes: [] } },
      { id: "r3", rows: [{ line: "frame", kind: "origin", context: "sprite", id: "mario_b", final: "agrees", proof: "write+reset+look" }], copy: { sprites: { mario_b: { tiles: [] } }, notes: [] } },
    ];
    const mapping = { sprites: {}, notes: [] };
    const d = decide(spec.lines, runs);
    expect(d[0]).toMatchObject({ action: "replace", record: "sprites", key: "mario_a", from: "r2" });
    apply(mapping, spec, d, runs);
    expect(Object.keys(mapping.sprites)).toEqual(["mario_a"]);
  });

  it("never adds a side entry its own run graded wrong", () => {
    const spec = { lines: [{ id: "x" }] };
    const runs = [{ id: "r1", rows: [row("y", "0x03AD", "disagrees")], copy: copy({ "0x03AD": { description: "wrong" } }) }];
    const mapping = { addresses: {}, notes: [] };
    apply(mapping, spec, decide(spec.lines, runs), runs);
    expect(mapping.addresses).toEqual({});
  });
});
