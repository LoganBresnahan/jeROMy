#!/usr/bin/env node
// The mapping a run starts from (ADR-0020): the committed mapping minus the
// entries of the lines in scope, so a re-run does not find its own earlier
// answer (right or wrong) in the prompt's Known Addresses. Writes
// <out>/sha1-<sha1>.json; eval-run.sh points the plugin's mappingsDir there,
// and the run promotes into that copy, never into mappings/.
//
// Usage: scripts/eval-mapping-in.mjs <spec.json> <line,ids> <out-dir>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Remove the entries a spec line names (`entry: "addresses.0x07DE"`), and
 * any other entry of the same record at the same key; notes are kept.
 */
export function stripLines(mapping, spec, ids) {
  const out = JSON.parse(JSON.stringify(mapping));
  const removed = [];
  const named = [];
  for (const line of spec.lines ?? []) {
    if (!ids.includes(line.id) || !line.entry) continue;
    const [record, key] = [line.entry.slice(0, line.entry.indexOf(".")), line.entry.slice(line.entry.indexOf(".") + 1)];
    if (out[record] && key in out[record]) {
      // Its ROM origins name the answer too, as a PRG offset or (fixed-bank PRG at $8000) a CPU address.
      for (const o of out[record][key].rom_origins ?? []) if (o.mem === "prgRom") named.push(o.offset, (spec.prg_base ?? 0x8000) + o.offset);
      delete out[record][key]; removed.push(line.entry);
    }
  }
  // Other entries and notes that name a held-back address give the answer away too ("$03AD = $0086 - $071C",
  // "page 0x006D + low 0x0086"): hold them back as well (ledger F10, found before sheet3-x-rerun).
  const addrs = [...removed.map((e) => e.slice(e.indexOf(".") + 1)).filter((k) => /^0x[0-9a-f]+$/i.test(k)).map((k) => parseInt(k, 16)), ...named];
  if (addrs.length) {
    const re = new RegExp(`(0x|\\$)0*(${addrs.map((n) => n.toString(16)).join("|")})(?![0-9a-f])`, "i");
    for (const record of ["tiles", "palettes", "sprites", "addresses", "scenes", "levels", "routines"]) {
      for (const [k, v] of Object.entries(out[record] ?? {})) if (re.test(JSON.stringify(v))) { delete out[record][k]; removed.push(`${record}.${k} (names it)`); }
    }
    const kept = (out.notes ?? []).filter((n) => !re.test(n));
    if (kept.length < (out.notes ?? []).length) removed.push(`${(out.notes ?? []).length - kept.length} note(s) (name it)`);
    out.notes = kept;
  }
  return { mapping: out, removed };
}

function main(argv) {
  const [specPath, ids, outDir] = argv.slice(2);
  if (!specPath || !ids || !outDir) { console.error("usage: scripts/eval-mapping-in.mjs <spec.json> <line,ids> <out-dir>"); process.exit(2); }
  const spec = JSON.parse(readFileSync(resolve(specPath), "utf8"));
  const file = resolve("mappings", `sha1-${spec.sha1}.json`);
  mkdirSync(resolve(outDir), { recursive: true });
  if (!existsSync(file)) { console.log("[eval-mapping-in] no committed mapping; the run starts from none"); return; }
  const { mapping, removed } = stripLines(JSON.parse(readFileSync(file, "utf8")), spec, ids.split(","));
  writeFileSync(join(resolve(outDir), `sha1-${spec.sha1}.json`), JSON.stringify(mapping, null, 2) + "\n");
  console.log(`[eval-mapping-in] ${removed.length ? `held back ${removed.join(", ")}` : "no in-scope entries to hold back"}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv);
