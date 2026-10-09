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
  for (const line of spec.lines ?? []) {
    if (!ids.includes(line.id) || !line.entry) continue;
    const [record, key] = [line.entry.slice(0, line.entry.indexOf(".")), line.entry.slice(line.entry.indexOf(".") + 1)];
    if (out[record] && key in out[record]) { delete out[record][key]; removed.push(line.entry); }
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
