/**
 * `promote_mappings`: write this session's confirmed `record_mapping`
 * discoveries into the ROM's shareable mapping file (mappings/sha1-*.json).
 * dsh-specific because the discovery ledger lives on the Mesen service; the
 * merge and file format are core (src/mappings/loader.ts). Discoveries are
 * per process until roadmap item 5 moves them into a storage domain.
 */
import { defineTool, type ToolDefinition } from "@deepseek-ai/dsh-tools";
import { loadMapping, mergeMappings, saveMapping, type DiscoveredEntry } from "../../mappings/loader.js";
import type { GameMapping } from "../../mappings/types.js";
import type { RomInfoResult } from "../../bridge/mesen/protocol.js";

export interface PromoteDeps {
  romInfo: () => RomInfoResult | null;
  discoveries: () => DiscoveredEntry[];
  /** Called after a successful write so the service can swap in the merged mapping and clear the ledger. */
  onPromoted: (merged: GameMapping) => void;
  mappingsDir: () => string | undefined;
}

/** Parse a `record_mapping` tool result into a ledger entry, or null if it is not a confirmed discovery. */
export function discoveryFromRecordResult(text: string): DiscoveredEntry | null {
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(text) as Record<string, unknown>; } catch { return null; }
  if (parsed.recorded !== true) return null;
  const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 1;
  return {
    mapping_type: parsed.mapping_type as DiscoveredEntry["mapping_type"],
    id: String(parsed.id),
    name: String(parsed.name),
    ...(parsed.category ? { category: String(parsed.category) } : {}),
    ...(parsed.group ? { group: String(parsed.group) } : {}),
    ...(parsed.notes ? { notes: String(parsed.notes) } : {}),
    confidence,
  };
}

export function makePromoteMappingsTool(deps: PromoteDeps): ToolDefinition {
  return defineTool({
    name: "promote_mappings",
    description:
      "Save this session's confirmed discoveries (record_mapping calls with confidence 1) into the ROM's "
      + "mapping file so future sessions and other people start with them. Hypotheses (confidence < 1) are "
      + "not promoted. Call it when the user confirms the discoveries are right.",
    parameters: {},
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          promoted: { type: "integer", required: true },
          skipped_hypotheses: { type: "integer", required: true },
          rom_sha1: { type: "string", required: true },
          rom_name: { type: "string", required: true },
          total_tiles: { type: "integer", required: true },
          total_palettes: { type: "integer", required: true },
          total_sprites: { type: "integer", required: true },
          total_addresses: { type: "integer", required: true },
        },
      },
      render: (_args, v) => [{
        type: "text",
        text: v.promoted === 0
          ? `No confirmed discoveries to promote (${v.skipped_hypotheses} hypotheses skipped).`
          : `Promoted ${v.promoted} discoveries to mappings/sha1-${v.rom_sha1}.json for ${v.rom_name}. `
            + `File now has ${v.total_tiles} tiles, ${v.total_palettes} palettes, ${v.total_sprites} sprites, ${v.total_addresses} addresses. `
            + `${v.skipped_hypotheses} hypotheses skipped.`,
      }],
    },
    async execute() {
      const rom = deps.romInfo();
      if (!rom?.sha1) throw new Error("Cannot determine the ROM SHA1: the emulator is not connected.");
      const sha1 = rom.sha1.toLowerCase();
      const all = deps.discoveries();
      const confirmed = all.filter((d) => d.confidence >= 1);
      const skipped = all.length - confirmed.length;
      if (confirmed.length === 0) {
        return { promoted: 0, skipped_hypotheses: skipped, rom_sha1: sha1, rom_name: rom.name, total_tiles: 0, total_palettes: 0, total_sprites: 0, total_addresses: 0 };
      }
      const existing = loadMapping(sha1, deps.mappingsDir());
      const merged = mergeMappings(existing, confirmed, sha1, rom.name);
      saveMapping(merged, deps.mappingsDir());
      deps.onPromoted(merged);
      return {
        promoted: confirmed.length,
        skipped_hypotheses: skipped,
        rom_sha1: sha1,
        rom_name: rom.name,
        total_tiles: Object.keys(merged.tiles).length,
        total_palettes: Object.keys(merged.palettes ?? {}).length,
        total_sprites: Object.keys(merged.sprites ?? {}).length,
        total_addresses: Object.keys(merged.addresses).length,
      };
    },
  });
}
