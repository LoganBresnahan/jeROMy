// ADR-0020 §7: the grader is falsified before any grade is trusted. A
// synthetic reference pins the rules on every machine; the SMB fixtures in
// eval/spec/falsify/ run against the imported smbdis reference when it is
// present (it lives in the gitignored hacks/ and is never vendored, ADR-0017).
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { claimsFromRecord, claimsFromStream, gradeClaim, lineFor, resolveRefs, spanOf, words } from "./score-mapping.mjs";

const REF = {
  source: "synthetic",
  symbols: [
    { name: "Lives", address: 0x10, kind: "equ" },
    { name: "Coins", address: 0x11, kind: "equ" },
    { name: "Hero_Y_Position", address: 0x20, kind: "equ" },
    { name: "Foe_Y_Position", address: 0x21, kind: "equ" },
    { name: "Clock", address: 0x30, kind: "equ" },
    { name: "GrassPal", address: 0x8100, kind: "label" },
    { name: "CavePal", address: 0x8110, kind: "label" },
    { name: "Stage1", address: 0x9000, kind: "label" },
    { name: "Stage2", address: 0x9040, kind: "label" },
    { name: "OnVblank", address: 0x8050, kind: "label" },
    { name: "OnVblankLoop", address: 0x8058, kind: "label" },
  ],
};
const SPEC = {
  mapper: "NROM", prg_base: 0x8000,
  lines: [
    { id: "lives", type: "address", match: [["live"]], ref: ["Lives"] },
    { id: "coins", type: "address", match: [["coin"]], ref: ["Coins"] },
    { id: "hero_y", type: "address", match: [["player", "y"]], exclude: ["speed"], ref: ["Hero_Y_Position"] },
    { id: "clock", type: "address", match: [["timer"]], ref: ["Clock"], span: 3 },
    { id: "grass_pal", type: "origin", match: [["palette"]], exclude: ["cave"], ref: ["GrassPal"] },
    { id: "cave_pal", type: "origin", match: [["cave", "palette"]], ref: ["CavePal"] },
    { id: "stage1", type: "level", match: [["1-1"]], ref: ["Stage1"] },
    { id: "nmi", type: "routine", match: [["nmi"]], ref: ["OnVblank"] },
    { id: "hero_pic", type: "picture", match: [["hero"]] },
  ],
};
// A palette or tile entry with rom_origins is two claims, the picture (for Claude) and the origin; these cases grade the origin.
const placed = (rec, rows) => (rec.rom_origins ? rows.filter((r) => r.verdict !== "needs-judge") : rows);
const grade = (rec) => placed(rec, claimsFromRecord(rec, "test").map((c) => gradeClaim(c, REF, SPEC)));

describe("score-mapping words", () => {
  it("splits camelCase and snake_case, expands xpos, drops a plural s, keeps a world-level id", () => {
    expect(words("Player_XPos")).toEqual(["player", "x", "position"]);
    expect(words("NumberOfLives")).toEqual(["number", "of", "live"]);
    expect(words("1-1 area")).toEqual(["1-1", "area"]);
  });
});

describe("score-mapping lines", () => {
  it("assigns by the longest matching group and honours exclude", () => {
    expect(lineFor({ kind: "origin", name: "cave palette" }, SPEC.lines)?.id).toBe("cave_pal");
    expect(lineFor({ kind: "origin", name: "grass palette" }, SPEC.lines)?.id).toBe("grass_pal");
    expect(lineFor({ kind: "address", name: "player y speed" }, SPEC.lines)).toBeNull();
  });
  it("lets the head of the name decide over a parenthetical", () => {
    const lines = [...SPEC.lines, { id: "scroll", type: "address", match: [["scroll"]], ref: [] }, { id: "level", type: "address", match: [["level"]], ref: [] }];
    expect(lineFor({ kind: "address", name: "screen_scroll_x (level's left edge, mod 256)" }, lines)?.id).toBe("scroll");
    expect(lineFor({ kind: "address", name: "the (level) number" }, lines)?.id).toBe("level");
  });
  it("only gives a claim to a line of its own kind", () => {
    expect(lineFor({ kind: "routine", name: "lives" }, SPEC.lines)).toBeNull();
  });
  it("takes an origin's parent entry type as vocabulary", () => {
    const c = claimsFromRecord({ mapping_type: "palette", id: "0", name: "green", rom_origins: [{ mem: "prgRom", offset: 0x102, length: 1 }] }, "t").find((k) => k.kind === "origin");
    expect(lineFor(c, SPEC.lines)?.id).toBe("grass_pal");
  });
  it("resolves Name+offset:span references for bytes reached only through a label", () => {
    const line = { id: "x", type: "address", match: [["coin"]], ref: ["Lives+0x1:1", "Clock"] };
    const refs = resolveRefs(line, REF.symbols);
    expect(refs.map((r) => [r.name, r.address, r.refSpan])).toEqual([["Lives+0x1:1", 0x11, 1], ["Clock", 0x30, undefined]]);
    expect(spanOf(refs[0], REF.symbols, { span: 3 })).toBe(1);
  });
  it("sizes a label by the gap to the next label, an equate by the line span", () => {
    expect(spanOf(REF.symbols[5], REF.symbols, null)).toBe(0x10);
    expect(spanOf(REF.symbols[4], REF.symbols, SPEC.lines[3])).toBe(3);
  });
});

describe("score-mapping falsification (synthetic)", () => {
  const cases = [
    ["right address", { mapping_type: "address", id: "0x11", name: "coin count" }, "agrees"],
    ["address one off", { mapping_type: "address", id: "0x10", name: "coins" }, "disagrees"],
    ["one off onto a symbol sharing a word", { mapping_type: "address", id: "0x21", name: "player y" }, "disagrees"],
    ["inside a declared span", { mapping_type: "address", id: "0x32", name: "timer ones" }, "agrees"],
    ["past a declared span", { mapping_type: "address", id: "0x33", name: "timer" }, "disagrees"],
    ["claim longer than the span", { mapping_type: "address", id: "0x30", name: "timer", length: 4 }, "disagrees"],
    ["origin in its table", { mapping_type: "palette", id: "0", name: "grass palette", rom_origins: [{ mem: "prgRom", offset: 0x10f, length: 1 }] }, "agrees"],
    ["origin in the neighbouring table", { mapping_type: "palette", id: "0", name: "grass palette", rom_origins: [{ mem: "prgRom", offset: 0x110, length: 1 }] }, "disagrees"],
    ["level inside its data", { mapping_type: "level", id: "1-1", name: "objects", rom_origins: [{ mem: "prgRom", offset: 0x1000, length: 0x40 }] }, "agrees"],
    ["level range spanning two levels", { mapping_type: "level", id: "1-1", name: "objects", rom_origins: [{ mem: "prgRom", offset: 0x1030, length: 0x20 }] }, "disagrees"],
    ["routine entry", { mapping_type: "routine", id: "0x8050", name: "NMI" }, "agrees"],
    ["routine one byte in", { mapping_type: "routine", id: "0x8051", name: "NMI" }, "disagrees"],
    ["picture claim", { mapping_type: "tile", id: "0x01", name: "hero head" }, "needs-judge"],
  ];
  it.each(cases)("%s", (_label, rec, verdict) => {
    expect(grade(rec).map((r) => r.verdict)).toEqual([verdict]);
  });
  it("a claim no line takes falls back to the loose name match, which is why lines exist", () => {
    const loose = claimsFromRecord({ mapping_type: "address", id: "0x21", name: "player y position" }, "t").map((c) => gradeClaim(c, REF, null));
    expect(loose[0].verdict).toBe("agrees");
  });
  it("a banked reference grades origins by PRG offset, so the same CPU address in another bank disagrees", () => {
    const banked = { source: "synthetic banked", symbols: [
      { name: "OverworldPal", address: 0x8100, kind: "label", rom_offset: 0x0100 },
      { name: "DungeonPal", address: 0x8100, kind: "label", rom_offset: 0x4100 },
      { name: "Next0", address: 0x8110, kind: "label", rom_offset: 0x0110 },
      { name: "Next1", address: 0x8110, kind: "label", rom_offset: 0x4110 },
    ] };
    const spec = { mapper: "MMC1", lines: [{ id: "ow", type: "origin", match: [["overworld", "palette"]], ref: ["OverworldPal"] }] };
    const g = (offset) => gradeClaim(claimsFromRecord({ mapping_type: "palette", id: "0", name: "overworld palette", rom_origins: [{ mem: "prgRom", offset, length: 4 }] }, "t").find((k) => k.kind === "origin"), banked, spec);
    expect(g(0x0104).verdict).toBe("agrees");
    expect(g(0x4104).verdict).toBe("disagrees");
    expect(g(0x010e).verdict).toBe("disagrees");
  });

  it("an unplaceable origin (banked game) is unplaced, never agrees", () => {
    const c = claimsFromRecord({ mapping_type: "palette", id: "0", name: "grass palette", rom_origins: [{ mem: "prgRom", offset: 0x10f, length: 1 }] }, "t").find((k) => k.kind === "origin");
    expect(gradeClaim(c, REF, { ...SPEC, mapper: "MMC1" }).verdict).toBe("unplaced");
  });
});

describe("score-mapping streams", () => {
  const ev = (o) => JSON.stringify(o);
  const stream = [
    ev({ type: "tool_call", callId: "a", tool: "write_memory", input: { address: 0x11, bytes: [9] } }),
    ev({ type: "tool_result", callId: "a", status: "completed", result: "{}" }),
    ev({ type: "tool_call", callId: "b", tool: "screenshot", input: {} }),
    ev({ type: "tool_result", callId: "b", status: "completed", result: "{}" }),
    ev({ type: "tool_call", callId: "c", tool: "record_mapping", input: { mapping_type: "address", id: "0x11", name: "coins" } }),
    ev({ type: "tool_result", callId: "c", status: "completed", result: "{\"recorded\":true}" }),
    ev({ type: "tool_call", callId: "d", tool: "record_mapping", input: { mapping_type: "address", id: "0x10", name: "lives" } }),
    ev({ type: "tool_result", callId: "d", status: "completed", result: "{\"recorded\":true}" }),
    ev({ type: "tool_call", callId: "e", tool: "promote_mappings", input: {} }),
    ev({ type: "tool_result", callId: "e", status: "completed", result: "Promoted 2 discoveries to mappings/sha1-x.json" }),
  ].join("\n");
  it("reads record_mapping calls with the proof each rests on and whether they were promoted", () => {
    const { claims } = claimsFromStream(stream, "s");
    expect(claims.map((c) => [c.name, c.proof, c.promoted])).toEqual([["coins", "write+look", true], ["lives", null, true]]);
    expect(claims.map((c) => c.derived)).toEqual([false, false]);
  });
  it("marks a claim derived only when a diff before the record listed its address", () => {
    const diff = [
      ev({ type: "tool_call", callId: "x", tool: "diff_memory", input: { a: "s0", b: "s1", filter: "increased" } }),
      ev({ type: "tool_result", callId: "x", status: "completed", result: JSON.stringify({ matched: 2, hits: [{ address: 0x11, old: 0, new: 1 }, { address: 0x40, old: 3, new: 4 }] }) }),
    ].join("\n");
    const { claims } = claimsFromStream(diff + "\n" + stream, "s");
    expect(claims.map((c) => [c.name, c.derived])).toEqual([["coins", true], ["lives", false]]);
  });
});

const SMB = "33d23c2f2cfa4c9efec87f7bc1321ce3ce6c89bd";
const refFile = resolve(`hacks/sha1-${SMB}/reference.json`);
describe.skipIf(!existsSync(refFile))("score-mapping falsification (SMB, eval/spec/falsify)", () => {
  const ref = existsSync(refFile) ? JSON.parse(readFileSync(refFile, "utf8")) : null;
  const spec = JSON.parse(readFileSync(resolve("eval/spec/smb.json"), "utf8"));
  const fx = JSON.parse(readFileSync(resolve("eval/spec/falsify/smb-claims.json"), "utf8"));
  it.each(fx.claims.map((c) => [c.why, c]))("%s", (_why, c) => {
    const rows = placed(c.rec, claimsFromRecord(c.rec, "falsify").map((cl) => gradeClaim(cl, ref, spec)));
    expect(rows.map((r) => r.verdict)).toEqual([c.expect]);
  });
});
