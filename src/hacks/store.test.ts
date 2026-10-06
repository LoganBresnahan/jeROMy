import { describe, it, expect } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HackStore, hackDirFor, gameDirFor } from "./store.js";

const SHA1 = "33D23C2F2CFA4C9EFEC87F7BC1321CE3CE6C89BD"; // SMB (World), as get_rom_info reports it

function fresh() {
  return new HackStore(mkdtempSync(join(tmpdir(), "hacks-")), SHA1);
}

describe("HackStore (ADR-0009)", () => {
  it("names the directory by lowercase sha1 and creates nothing until a write", () => {
    const s = fresh();
    expect(s.gameDir).toBe(hackDirFor(s.root, SHA1));
    expect(s.gameDir).toBe(gameDirFor(s.root, SHA1));
    expect(s.gameDir.endsWith(`sha1-${SHA1.toLowerCase()}`)).toBe(true);
    // ADR-0018: the ledger lives in the active hack's directory, "default" until told otherwise.
    expect(s.hackName).toBe("default");
    expect(s.dir).toBe(join(s.gameDir, "default"));
    expect(s.readEdits()).toEqual([]);
    expect(s.readDiscoveries()).toEqual([]);
    expect(existsSync(s.dir)).toBe(false);
  });

  it("appends edits with increasing seq and timestamps, atomically", () => {
    const s = fresh();
    // The $29 → $16 recolor proven live on 2026-10-05: PRG offset 0xCCC.
    const a = s.appendEdit({ tool: "write_memory", mem: "prgRom", offset: 0xccc, length: 1, old: [0x29], new: [0x16], reason: "pipes red" }, new Date("2026-10-05T04:00:00Z"));
    const b = s.appendEdit({ tool: "write_tile", mem: "chrRom", offset: 0xb60, length: 16, old: new Array(16).fill(0), new: new Array(16).fill(255) });
    expect(a).toMatchObject({ seq: 1, at: "2026-10-05T04:00:00.000Z", reason: "pipes red" });
    expect(b.seq).toBe(2);
    expect(s.readEdits().map((e) => e.seq)).toEqual([1, 2]);
    expect(readdirSync(s.dir).sort()).toEqual(["edits.json", "hack.json"]);
    const file = JSON.parse(readFileSync(s.editsFile, "utf8"));
    expect(file).toMatchObject({ format: 1, rom_sha1: SHA1 });
  });

  it("refuses an entry whose byte arrays do not match its length", () => {
    const s = fresh();
    expect(() => s.appendEdit({ tool: "write_memory", mem: "prgRom", offset: 0, length: 2, old: [1], new: [2, 3] })).toThrow(/length/);
    expect(existsSync(s.dir)).toBe(false);
  });

  it("removes an edit by seq and keeps the others' seqs stable", () => {
    const s = fresh();
    s.appendEdit({ tool: "write_memory", mem: "prgRom", offset: 1, length: 1, old: [1], new: [2] });
    s.appendEdit({ tool: "write_memory", mem: "prgRom", offset: 2, length: 1, old: [3], new: [4] });
    const removed = s.removeEdit(1);
    expect(removed.offset).toBe(1);
    expect(s.readEdits().map((e) => e.seq)).toEqual([2]);
    // A later append continues after the highest surviving seq.
    expect(s.appendEdit({ tool: "write_memory", mem: "prgRom", offset: 3, length: 1, old: [5], new: [6] }).seq).toBe(3);
    expect(() => s.removeEdit(9)).toThrow(/no edit/);
  });

  it("keeps discoveries as a separate file that can be appended, replaced and cleared", () => {
    const s = fresh();
    const entry = { mapping_type: "palette" as const, id: "0", name: "pipe_bush_hill_green", confidence: 1 };
    expect(s.appendDiscovery(entry)).toHaveLength(1);
    expect(s.readDiscoveries()).toEqual([entry]);
    s.writeDiscoveries([entry, { ...entry, id: "1" }]);
    expect(s.readDiscoveries()).toHaveLength(2);
    s.clearDiscoveries();
    expect(s.readDiscoveries()).toEqual([]);
    expect(existsSync(s.discoveriesFile)).toBe(true);
    expect(existsSync(`${s.discoveriesFile}.tmp`)).toBe(false);
  });

  it("open() migrates a pre-ADR-0018 single ledger into default/ and remembers the active hack", () => {
    const root = mkdtempSync(join(tmpdir(), "hacks-"));
    const game = gameDirFor(root, SHA1);
    mkdirSync(game, { recursive: true });
    writeFileSync(join(game, "edits.json"), JSON.stringify({ format: 1, rom_sha1: SHA1, edits: [{ seq: 1, at: "2026-10-05T00:00:00Z", tool: "write_memory", mem: "prgRom", offset: 0xccc, length: 1, old: [0x29], new: [0x16] }] }));
    writeFileSync(join(game, "patch.ips"), "PATCHEOF");
    writeFileSync(join(game, "Game.hacked.nes"), "x");
    writeFileSync(join(game, "discoveries.json"), JSON.stringify({ format: 1, rom_sha1: SHA1, discoveries: [] }));
    const log: string[] = [];
    const s = HackStore.open(root, SHA1, (m) => log.push(m));
    expect(s.hackName).toBe("default");
    expect(readdirSync(join(game, "default")).sort()).toEqual(["Game.hacked.nes", "edits.json", "hack.json", "patch.ips"]);
    expect(existsSync(join(game, "edits.json"))).toBe(false);
    expect(existsSync(join(game, "discoveries.json"))).toBe(true);
    expect(s.readEdits()).toHaveLength(1);
    expect(log[0]).toMatch(/migrated .*edits\.json.* as hack "default"/);
    expect(JSON.parse(readFileSync(join(game, "game.json"), "utf8"))).toMatchObject({ active: "default", rom_sha1: SHA1 });
    // A half-done migration (empty default/ from a crash) still migrates on the next open.
    const root2 = mkdtempSync(join(tmpdir(), "hacks-"));
    const game2 = gameDirFor(root2, SHA1);
    mkdirSync(join(game2, "default"), { recursive: true });
    writeFileSync(join(game2, "edits.json"), JSON.stringify({ format: 1, rom_sha1: SHA1, edits: [] }));
    HackStore.open(root2, SHA1);
    expect(existsSync(join(game2, "default", "edits.json"))).toBe(true);
    expect(existsSync(join(game2, "edits.json"))).toBe(false);
    // Opening again does not migrate twice and honours game.json.
    s.createHack("halloween", "pumpkins");
    s.useHack("halloween");
    expect(HackStore.open(root, SHA1).hackName).toBe("halloween");
  });

  it("creates, lists and switches named hacks, versions exports per hack, and seeds the root's .gitignore", () => {
    const s = fresh();
    expect(s.listHacks()).toEqual([]);
    s.appendEdit({ tool: "write_memory", mem: "prgRom", offset: 1, length: 1, old: [0], new: [1] });
    expect(readFileSync(join(s.root, ".gitignore"), "utf8")).toMatch(/\*\.nes/);
    const made = s.createHack("christmas", "red and green");
    expect(made).toMatchObject({ name: "christmas", description: "red and green", edits: 0, exports: 0, active: false });
    expect(() => s.createHack("christmas")).toThrow(/already exists/);
    expect(() => s.createHack("Bad Name!")).toThrow(/invalid hack name/);
    expect(s.listHacks().map((h) => [h.name, h.edits, h.active])).toEqual([["christmas", 0, false], ["default", 1, true]]);
    expect(s.nextVersion()).toBe(1);
    const e1 = s.recordExport(join(s.dir, "default-v1.bps"), "bps", 1, new Date("2026-10-05T10:00:00Z"));
    expect(e1).toEqual({ version: 1, file: "default-v1.bps", format: "bps", edits: 1, at: "2026-10-05T10:00:00.000Z" });
    expect(s.nextVersion()).toBe(2);
    s.useHack("christmas");
    expect(s.hackName).toBe("christmas");
    expect(s.dir).toBe(join(s.gameDir, "christmas"));
    expect(s.readEdits()).toEqual([]);
    expect(s.nextVersion()).toBe(1);
    expect(() => s.useHack("easter")).toThrow(/no hack "easter"/);
    expect(s.listHacks().find((h) => h.name === "default")?.last_export?.version).toBe(1);
    // Discoveries are shared at the game level, whatever hack is active.
    s.appendDiscovery({ mapping_type: "tile", id: "0x24", name: "sky" } as any);
    s.useHack("default");
    expect(s.readDiscoveries()).toHaveLength(1);
  });
});
