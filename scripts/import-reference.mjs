#!/usr/bin/env node
// Import a reference (a disassembly's cc65 .dbg file, an assembler source's
// equates, or a wiki table as CSV/TSV) into hacks/sha1-<sha1>/reference.json
// for lookup_symbol (ADR-0017). The reference stays in the gitignored hack
// directory; nothing here touches mappings/.
//
// Usage:
//   scripts/import-reference.mjs import <file> --sha1 <sha1> --source "<credit>" [--kind dbg|asm|wiki] [--append]
//   scripts/import-reference.mjs near  <address> --sha1 <sha1>
//   scripts/import-reference.mjs find  <name>    --sha1 <sha1>
//   scripts/import-reference.mjs stats           --sha1 <sha1>
// Options: --hacks <dir> (default ./hacks). Run `npm run build` first; this
// script uses the built core (dist/agent/reference.js).
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
const mod = resolve(repo, "dist/agent/reference.js");
if (!existsSync(mod)) { console.error("[import-reference] dist/agent/reference.js missing; run `npm run build` first"); process.exit(2); }
const ref = await import(mod);

const args = process.argv.slice(2);
const cmd = args.shift();
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); if (i < 0) return dflt; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = (name) => { const i = args.indexOf(`--${name}`); if (i < 0) return false; args.splice(i, 1); return true; };
const hacks = resolve(opt("hacks", resolve(repo, "hacks")));
const sha1 = (opt("sha1", "") || "").toLowerCase();
const source = opt("source", "");
const kindOpt = opt("kind", "");
const append = flag("append");
if (!cmd || !sha1 || !/^[0-9a-f]{40}$/.test(sha1)) {
  console.error("usage: import-reference.mjs <import|near|find|stats> ... --sha1 <40-hex sha1> (see header)"); process.exit(2);
}
const dir = resolve(hacks, `sha1-${sha1}`);

if (cmd === "import") {
  const file = args[0];
  if (!file) { console.error("import needs a file"); process.exit(2); }
  const text = readFileSync(file, "utf8");
  const kind = kindOpt || (file.endsWith(".dbg") ? "dbg" : /\.(csv|tsv|txt)$/i.test(file) ? "wiki" : "asm");
  const symbols = kind === "dbg" ? ref.parseCc65Dbg(text) : kind === "wiki" ? ref.parseWikiTable(text) : ref.parseAsmEquates(text, basename(file));
  if (symbols.length === 0) { console.error(`[import-reference] no symbols found in ${file} as ${kind}`); process.exit(1); }
  const existing = append ? ref.loadReference(dir) : null;
  const merged = existing ? [...existing.symbols, ...symbols] : symbols;
  const credit = source || existing?.source || `${basename(file)} (${kind})`;
  const path = ref.saveReference(dir, { source: credit, imported_at: new Date().toISOString(), symbols: dedupe(merged) });
  console.log(`[import-reference] ${symbols.length} symbols from ${file} (${kind}) → ${path}${existing ? ` (now ${dedupe(merged).length} total)` : ""}`);
  console.log(`[import-reference] source credited as: ${credit}`);
} else {
  const loaded = ref.loadReference(dir);
  if (!loaded) { console.error(`[import-reference] no reference.json under ${dir}`); process.exit(1); }
  if (cmd === "stats") {
    const kinds = {};
    for (const s of loaded.symbols) kinds[s.kind] = (kinds[s.kind] ?? 0) + 1;
    console.log(JSON.stringify({ source: loaded.source, imported_at: loaded.imported_at, symbols: loaded.symbols.length, kinds }, null, 2));
  } else if (cmd === "near") {
    const addr = parseInt(String(args[0]).replace(/^(0x|\$)/i, ""), 16);
    const n = ref.nearestSymbol(loaded.symbols, addr, 0x1000);
    console.log(n ? `${ref.formatSymbol(n.symbol)}${n.offset ? ` +$${n.offset.toString(16).toUpperCase()}` : ""}` : "no symbol within $1000 below that address");
  } else if (cmd === "find") {
    for (const s of ref.findSymbols(loaded.symbols, String(args[0] ?? ""), 40)) console.log(ref.formatSymbol(s));
  } else {
    console.error(`unknown command ${cmd}`); process.exit(2);
  }
}

function dedupe(symbols) {
  const seen = new Set();
  return symbols.filter((s) => { const k = `${s.name}@${s.address}`; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => a.address - b.address || a.name.localeCompare(b.name));
}
