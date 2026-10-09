#!/usr/bin/env node
// Grade a mapping against an imported reference (ADR-0019). The reference
// is calibration: this script says how many of the `address` entries a
// session found agree with the symbols a human assigned, so the blind
// method can be trusted on games that have no reference at all.
//
// Usage: scripts/score-mapping.mjs <sha1> [--hacks <root>] [--discoveries] [--json]
//   Reads mappings/sha1-<sha1>.json (the committed mapping) and, with
//   --discoveries, the game's unpromoted hacks/sha1-<sha1>/discoveries.json.
//   Reference: <root>/sha1-<sha1>/reference.json (scripts/import-reference.mjs).
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const sha1 = args.find((a) => !a.startsWith("--"))?.toLowerCase();
if (!sha1) {
  console.error("usage: scripts/score-mapping.mjs <sha1> [--hacks <root>] [--discoveries] [--json]");
  process.exit(2);
}
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const root = resolve(flag("--hacks") ?? "hacks");
const gameDir = join(root, `sha1-${sha1}`);
const refFile = join(gameDir, "reference.json");
const mapFile = resolve("mappings", `sha1-${sha1}.json`);
if (!existsSync(refFile)) { console.error(`no reference at ${refFile}; import one first`); process.exit(2); }

const ref = JSON.parse(readFileSync(refFile, "utf8"));
const byAddress = new Map();
for (const s of ref.symbols ?? []) {
  if (!byAddress.has(s.address)) byAddress.set(s.address, []);
  byAddress.get(s.address).push(s);
}

/** Every address claim we can find: promoted entries, and discoveries when asked. */
const claims = [];
if (existsSync(mapFile)) {
  const m = JSON.parse(readFileSync(mapFile, "utf8"));
  for (const [key, e] of Object.entries(m.addresses ?? {})) {
    const address = Number(e.address);
    if (Number.isFinite(address)) claims.push({ where: "mapping", key, address, description: e.description ?? "", source: e.source });
  }
}
if (args.includes("--discoveries")) {
  const dFile = join(gameDir, "discoveries.json");
  if (existsSync(dFile)) {
    for (const d of JSON.parse(readFileSync(dFile, "utf8")).discoveries ?? []) {
      if (d.mapping_type !== "address") continue;
      const address = Number(d.id);
      if (Number.isFinite(address)) claims.push({ where: "discovery", key: d.name, address, description: d.notes ?? d.name, source: d.source, confidence: d.confidence });
    }
  }
}

/** Words in a claim that also appear in the reference symbol name, loosely (NumberofLives ~ "lives"). */
function agrees(symbols, claim) {
  const text = `${claim.key} ${claim.description}`.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  const words = new Set(text.split(" ").filter((w) => w.length >= 3));
  for (const s of symbols) {
    const parts = s.name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ").toLowerCase().split(" ").filter((w) => w.length >= 3);
    if (parts.some((p) => words.has(p) || [...words].some((w) => w.includes(p) || p.includes(w)))) return s;
  }
  return null;
}

const rows = claims.map((c) => {
  const symbols = byAddress.get(c.address) ?? [];
  const hex = `$${c.address.toString(16).toUpperCase().padStart(4, "0")}`;
  if (symbols.length === 0) return { ...c, hex, verdict: "unknown-to-reference", symbol: null };
  const hit = agrees(symbols, c);
  return { ...c, hex, verdict: hit ? "agrees" : "disagrees", symbol: (hit ?? symbols[0]).name, candidates: symbols.map((s) => s.name) };
});

const tally = { agrees: 0, disagrees: 0, "unknown-to-reference": 0 };
for (const r of rows) tally[r.verdict]++;

if (args.includes("--json")) {
  console.log(JSON.stringify({ sha1, reference: ref.source, claims: rows.length, tally, rows }, null, 2));
} else {
  console.log(`[score-mapping] ${rows.length} address claim(s) for sha1-${sha1} against "${ref.source}" (${ref.symbols?.length ?? 0} symbols)`);
  for (const r of rows) {
    const tag = r.verdict === "agrees" ? "OK " : r.verdict === "disagrees" ? "?? " : "-- ";
    console.log(`${tag}${r.hex}  ${r.key} (${r.where}${r.source ? `, ${r.source}` : ""})${r.symbol ? `  reference: ${r.candidates.join(" | ")}` : "  reference: none"}`);
  }
  console.log(`[score-mapping] agrees ${tally.agrees}, disagrees ${tally.disagrees}, unknown to reference ${tally["unknown-to-reference"]}`);
  if (rows.length === 0) console.log("[score-mapping] nothing to score yet: record_mapping an address and promote_mappings, or pass --discoveries");
}
