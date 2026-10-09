#!/usr/bin/env node
// Turn a RAM/ROM map copied from a wiki's text rendering (Data Crystal: columns
// aligned with runs of spaces or tabs, a dashed rule under the header,
// continuation lines, "addr -> target" pointer rows) into the TSV that
// scripts/import-reference.mjs reads: address<TAB>name<TAB>details (ADR-0017).
//
// Usage: scripts/wiki-table-to-tsv.mjs <in.txt> <out.tsv>
//   Prints what it kept and what it dropped, so the person can check the
//   dropped lines; a map is reference material, and silence here would hide
//   a mis-split row until the grader blamed a run for it.
import { readFileSync, writeFileSync } from "node:fs";

const [input, output] = process.argv.slice(2);
if (!input || !output) { console.error("usage: wiki-table-to-tsv.mjs <in.txt> <out.tsv>"); process.exit(2); }

const ADDR = /^(?:0x|\$)?[0-9A-Fa-f]{1,6}(?:\s*[-–]\s*(?:0x|\$)?[0-9A-Fa-f]{1,6})?$/;
const JUNK = /^[\s?.]*$/;
const rows = [];
const dropped = [];
for (const raw of readFileSync(input, "utf8").split(/\r?\n/)) {
  const line = raw.replace(/\t/g, "  ").trimEnd();
  if (!line.trim() || /^-{3,}/.test(line) || /^(address|ram|rom)\s+function/i.test(line)) continue;
  const cells = line.trim().split(/\s{2,}/);
  const head = cells[0];
  if (!ADDR.test(head)) {
    // A pointer row written without alignment ("6827 -> 19D0F") or a continuation of the previous row.
    const ptr = /^((?:0x|\$)?[0-9A-Fa-f]{1,6}(?:-[0-9A-Fa-f]{1,6})?)\s*->\s*(.*)$/.exec(line.trim());
    if (ptr) { rows.push(pointerRow(ptr[1], ptr[2])); continue; }
    if (rows.length && /^\s/.test(raw) && !/^(PRG|LD[AXY]|ST[AXY]|DEY|DEX|INY|INX|JSR|RTS)\b/.test(line.trim())) {
      rows[rows.length - 1].details = [rows[rows.length - 1].details, line.trim()].filter(Boolean).join("; ");
      continue;
    }
    dropped.push(raw);
    continue;
  }
  const rest = cells.slice(1);
  if (rest[0]?.startsWith("->")) { rows.push(pointerRow(head, rest.join("  ").replace(/^->\s*/, ""))); continue; }
  const name = rest[0] ?? "";
  if (JUNK.test(name)) { dropped.push(raw); continue; }
  rows.push({ address: head.replace(/\s/g, ""), name, details: rest.slice(1).join(", ") });
}

/** "687E -> 8A00  2182  Screen Attributes - Table 0" → name from the description, target and size in details. */
function pointerRow(address, tail) {
  const parts = tail.trim().split(/\s{2,}|\s+(?=[0-9A-Fa-f]{3,5}\b)/).map((p) => p.trim()).filter(Boolean);
  const target = /^[0-9A-Fa-f]{3,5}$/.test(parts[0] ?? "") ? parts.shift() : undefined;
  const size = /^[0-9A-Fa-f]{2,5}$/.test(parts[0] ?? "") && parts.length > 0 && target ? parts.shift() : undefined;
  const desc = parts.join(" ");
  const name = desc || (target ? `pointer to $${target}` : "pointer");
  const details = [target ? `-> $${target}` : "", size ? `size $${size}` : "", desc && target ? "" : ""].filter(Boolean).join(", ");
  return { address: address.replace(/\s/g, ""), name, details };
}

writeFileSync(output, rows.map((r) => `${r.address}\t${r.name}\t${r.details}`).join("\n") + "\n");
console.log(`[wiki-table-to-tsv] ${rows.length} rows → ${output}; ${dropped.length} line(s) dropped`);
for (const d of dropped) console.log(`  dropped: ${d.trim().slice(0, 100)}`);
