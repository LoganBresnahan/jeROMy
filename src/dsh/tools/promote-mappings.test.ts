import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const linked = await import("@deepseek-ai/dsh-tools").then(() => true, () => false);
const exec = { signal: new AbortController().signal } as any;

describe.skipIf(!linked)("promote_mappings", async () => {
  const { makePromoteMappingsTool, discoveryFromRecordResult } = await import("./promote-mappings.js");

  it("parses a confirmed record_mapping result and ignores non-recorded text", () => {
    const d = discoveryFromRecordResult(JSON.stringify({ mapping_type: "tile", id: "182", name: "ground_brick", category: "terrain", group: null, notes: null, confidence: 1, recorded: true }));
    expect(d).toEqual({ mapping_type: "tile", id: "182", name: "ground_brick", category: "terrain", confidence: 1 });
    expect(discoveryFromRecordResult('{"paused":true}')).toBeNull();
    expect(discoveryFromRecordResult("not json")).toBeNull();
  });

  it("writes confirmed discoveries to sha1-<sha1>.json, skips hypotheses, and reports totals", async () => {
    const dir = mkdtempSync(join(tmpdir(), "jeromy-maps-"));
    const onPromoted = vi.fn();
    const tool = makePromoteMappingsTool({
      romInfo: () => ({ sha1: "ABCDEF", name: "Test ROM" }) as any,
      discoveries: () => [
        { mapping_type: "tile", id: "182", name: "ground_brick", confidence: 1 },
        { mapping_type: "address", id: "0x075A", name: "lives", confidence: 0.6 },
      ],
      onPromoted,
      mappingsDir: () => dir,
    });
    const v = (await tool.execute({}, exec)) as any;
    expect(v).toMatchObject({ promoted: 1, skipped_hypotheses: 1, rom_sha1: "abcdef", total_tiles: 1, total_addresses: 0 });
    const file = join(dir, "sha1-abcdef.json");
    expect(existsSync(file)).toBe(true);
    expect(JSON.parse(readFileSync(file, "utf8")).tiles["182"].name).toBe("ground_brick");
    expect(onPromoted).toHaveBeenCalledOnce();
  });

  it("fails clearly without a ROM", async () => {
    const tool = makePromoteMappingsTool({ romInfo: () => null, discoveries: () => [], onPromoted: () => {}, mappingsDir: () => undefined });
    await expect(tool.execute({}, exec)).rejects.toThrow(/not connected/);
  });

  it("discoveryFromRecordResult keeps source and notes (ADR-0017, ADR-0019)", () => {
    const d = discoveryFromRecordResult(JSON.stringify({ recorded: true, mapping_type: "address", id: "0x075A", name: "player_lives_counter", notes: "stores lives minus one", source: "differential search", confidence: 1 }));
    expect(d).toMatchObject({ id: "0x075A", notes: "stores lives minus one", source: "differential search", confidence: 1 });
  });
});
