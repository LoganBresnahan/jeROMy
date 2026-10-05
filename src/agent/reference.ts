/**
 * Reference symbols for a ROM (ADR-0017): labels and equates imported from a
 * disassembly's cc65 debug file, an assembler source, or a wiki table, kept
 * in the gitignored hack directory as `reference.json`. They tell the model
 * where to look; nothing here is a verified mapping. Pure parsers plus the
 * nearest-label lookup; file IO is at the bottom and small.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export type SymbolKind = "label" | "equ" | "wiki";

export interface ReferenceSymbol {
  name: string;
  address: number;
  kind: SymbolKind;
  size?: number;
  file?: string;
  line?: number;
  /** Free text from the source (wiki description, equate comment). */
  notes?: string;
}

export interface ReferenceFile {
  /** Where the symbols came from, in the words the person wants credited. */
  source: string;
  imported_at: string;
  symbols: ReferenceSymbol[];
}

export const REFERENCE_FILE = "reference.json";

/**
 * cc65/ld65 debug file (`--dbgfile`, version 2): one record per line,
 * `sym id=12,name="NumberOfLives",addrsize=absolute,size=1,scope=0,def=5,ref=7+9,val=0x75A,type=equ`
 * for equates and `type=lab` for labels. Only `sym` records with a `val`
 * are symbols; segments and lines are skipped. Names are unquoted.
 */
export function parseCc65Dbg(text: string): ReferenceSymbol[] {
  const out: ReferenceSymbol[] = [];
  const files = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("file\t") || line.startsWith("file ")) {
      const id = /\bid=(\d+)/.exec(line)?.[1];
      const name = /\bname="([^"]*)"/.exec(line)?.[1];
      if (id && name) files.set(id, name);
    }
  }
  for (const line of text.split(/\r?\n/)) {
    if (!(line.startsWith("sym\t") || line.startsWith("sym "))) continue;
    const name = /\bname="([^"]*)"/.exec(line)?.[1];
    const val = /\bval=(0x[0-9A-Fa-f]+|\d+)/.exec(line)?.[1];
    if (!name || val === undefined) continue;
    const type = /\btype=(\w+)/.exec(line)?.[1];
    const size = /\bsize=(\d+)/.exec(line)?.[1];
    // Local labels (@loop) and cheap locals are noise for a lookup table.
    if (name.startsWith("@") || name.startsWith(".")) continue;
    out.push({ name, address: Number(val), kind: type === "equ" ? "equ" : "label", ...(size ? { size: Number(size) } : {}) });
  }
  return dedupe(out);
}

/**
 * Assembler source equates and absolute labels, the fallback when no debug
 * file was built: `Name = $075A`, `Name .equ $075A`, `Name EQU $075A`, and
 * `Name:` lines that follow a `.org $xxxx` by counting is NOT attempted
 * (needs an assembler). Comments after `;` become notes.
 */
export function parseAsmEquates(text: string, file?: string): ReferenceSymbol[] {
  const out: ReferenceSymbol[] = [];
  const re = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:=|\.equ\b|\bEQU\b|\.set\b)\s*\$([0-9A-Fa-f]+)\s*(?:;\s*(.*))?$/i;
  text.split(/\r?\n/).forEach((line, i) => {
    const m = re.exec(line);
    if (!m) return;
    out.push({ name: m[1], address: parseInt(m[2], 16), kind: "equ", ...(file ? { file } : {}), line: i + 1, ...(m[3] ? { notes: m[3].trim() } : {}) });
  });
  return dedupe(out);
}

/**
 * A wiki table pasted as CSV or TSV: `address,name,notes` per line, address
 * as `0x75A`, `$75A` or `75A`. Header lines and blanks are skipped.
 */
export function parseWikiTable(text: string): ReferenceSymbol[] {
  const out: ReferenceSymbol[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cells = (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) => c.trim());
    const addr = /^(?:0x|\$)?([0-9A-Fa-f]{1,6})$/.exec(cells[0] ?? "");
    if (!addr || !cells[1]) continue;
    out.push({ name: cells[1], address: parseInt(addr[1], 16), kind: "wiki", ...(cells[2] ? { notes: cells.slice(2).join(", ") } : {}) });
  }
  return dedupe(out);
}

function dedupe(symbols: ReferenceSymbol[]): ReferenceSymbol[] {
  const seen = new Set<string>();
  return symbols.filter((s) => { const k = `${s.name}@${s.address}`; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => a.address - b.address || a.name.localeCompare(b.name));
}

export interface NearestSymbol {
  symbol: ReferenceSymbol;
  /** Bytes from the symbol's address to the queried one; 0 is an exact hit. */
  offset: number;
}

/** The nearest symbol at or below `address`, preferring labels for code addresses and an exact hit of any kind. */
export function nearestSymbol(symbols: ReferenceSymbol[], address: number, maxDistance = 0x400): NearestSymbol | undefined {
  let best: NearestSymbol | undefined;
  for (const s of symbols) {
    if (s.address > address) continue;
    const offset = address - s.address;
    if (offset > maxDistance) continue;
    if (!best || offset < best.offset || (offset === best.offset && s.kind === "label" && best.symbol.kind !== "label")) best = { symbol: s, offset };
  }
  return best;
}

/** Case-insensitive name match: exact first, then substring, capped. */
export function findSymbols(symbols: ReferenceSymbol[], query: string, max = 20): ReferenceSymbol[] {
  const q = query.toLowerCase();
  const exact = symbols.filter((s) => s.name.toLowerCase() === q);
  if (exact.length) return exact;
  return symbols.filter((s) => s.name.toLowerCase().includes(q)).slice(0, max);
}

export function referencePath(hackDir: string): string {
  return join(hackDir, REFERENCE_FILE);
}

export function loadReference(hackDir: string): ReferenceFile | null {
  const p = referencePath(hackDir);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as ReferenceFile;
}

export function saveReference(hackDir: string, ref: ReferenceFile): string {
  mkdirSync(hackDir, { recursive: true });
  const p = referencePath(hackDir);
  writeFileSync(p, JSON.stringify(ref, null, 2) + "\n");
  return p;
}

/** Render one symbol for the model, always labelled as reference. */
export function formatSymbol(s: ReferenceSymbol): string {
  return `${s.name} = $${s.address.toString(16).toUpperCase().padStart(4, "0")} (${s.kind}${s.size ? `, ${s.size} bytes` : ""}${s.notes ? `; ${s.notes}` : ""})`;
}
