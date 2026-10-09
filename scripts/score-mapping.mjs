#!/usr/bin/env node
// Grade mapping claims against an imported reference (ADR-0019, ADR-0020 §3).
// The reference is calibration: a verdict says whether what a blind session
// found matches what a human assigned, so the method can be trusted on games
// that have no reference at all.
//
// Usage: scripts/score-mapping.mjs <sha1> [--spec <spec.json>] [--stream <run.jsonl> ...]
//                                  [--discoveries] [--no-mapping] [--hacks <root>] [--json]
//   Claims come from mappings/sha1-<sha1>.json (unless --no-mapping), the
//   game's unpromoted discoveries (--discoveries), and the record_mapping
//   calls of dsh JSON streams (--stream, repeatable: one run's own claims,
//   with the proof each one rests on). With --spec every claim is assigned to
//   a spec line by its words and graded against that line's reference
//   symbols; without it, or for a claim no line takes, the old loose name
//   match against whatever the reference has at the address.
//   Reference: <root>/sha1-<sha1>/reference.json (scripts/import-reference.mjs).
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Lowercased words of a claim or keyword: camelCase and punctuation split, `xpos` → `x pos`, a plural s dropped. */
export function words(text) {
  const raw = String(text ?? "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/(\d)-(\d)/g, "$1-$2")
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .flatMap((w) => (/^\d+-\d+$/.test(w) ? [w] : w.split("-")))
    .filter(Boolean);
  const out = [];
  for (const w of raw) {
    const m = /^([xy])(pos|position|speed|spd|vel|velocity|coord|coordinate)$/.exec(w);
    if (m) { out.push(m[1], stem(m[2])); continue; }
    out.push(stem(w));
  }
  return out;
}
function stem(w) {
  if (w === "pos") return "position";
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us")) return w.slice(0, -1);
  return w;
}

/** Does a keyword (already a word) occur in the claim's words? Prefixes of 5+ letters count (`invincib` ~ `invincibility`). */
function has(claimWords, kw) {
  const k = stem(kw.toLowerCase());
  return claimWords.some((w) => w === k || (k.length >= 5 && w.startsWith(k)));
}

/** Which kinds of claim a line of a given type can grade. */
const LINE_TAKES = { address: ["address"], origin: ["origin"], level: ["level", "origin"], routine: ["routine"], picture: ["tile", "palette", "sprite", "scene", "note"] };

/** The spec line a claim belongs to, by vocabulary: the longest matching word group wins; null when no line takes it. */
export function lineFor(claim, lines) {
  const tryText = (text) => {
    const cw = words(text);
    let best = null;
    for (const line of lines) {
      if (!(LINE_TAKES[line.type] ?? []).includes(claim.kind)) continue;
      if ((line.exclude ?? []).some((x) => has(cw, x))) continue;
      for (const group of line.match ?? []) {
        if (group.every((kw) => words(kw).every((k) => has(cw, k)))) {
          const score = group.length;
          if (!best || score > best.score) best = { line, score };
        }
      }
    }
    return best?.line ?? null;
  };
  const ctx = claim.context ? ` ${claim.context}` : "";
  // The head of the name decides; a parenthetical is description, like notes ("screen_scroll_x (level's left
  // edge)" is the scroll, not the level: eval/runs/20261009-1135-sheet3-hud-position).
  const head = String(claim.name ?? "").replace(/\([^)]*\)/g, " ");
  return tryText(`${head}${ctx}`) ?? tryText(`${claim.name}${ctx}`) ?? tryText(`${claim.name}${ctx} ${claim.notes ?? ""}`);
}

/** A reference symbol's extent in bytes: the line's span, the symbol's size, or for a PRG label the gap to the next label (capped). */
export function spanOf(sym, symbols, line) {
  if (sym.refSpan) return sym.refSpan;
  if (line?.span) return line.span;
  if (sym.size) return sym.size;
  if (sym.kind === "label") {
    let next = Infinity;
    for (const s of symbols) if (s.kind === "label" && s.address > sym.address && s.address < next) next = s.address;
    return Number.isFinite(next) ? Math.min(next - sym.address, 0x800) : 1;
  }
  return 1;
}

const hex = (n) => `$${n.toString(16).toUpperCase().padStart(4, "0")}`;
const prgHex = (n) => `PRG 0x${n.toString(16).toUpperCase()}`;

/**
 * Put a claim and the reference in one address space: CPU space for RAM and
 * routines; for a PRG origin, PRG-offset space when the reference's labels
 * carry rom_offset (a banked game's .dbg import), else CPU space through the
 * spec's fixed prg_base (NROM). Null when it cannot be placed.
 */
function place(claim, symbols, spec) {
  const len = Math.max(1, claim.length ?? 1);
  if (claim.kind === "address" || claim.kind === "routine") return { lo: claim.address, hi: claim.address + len, syms: symbols, prg: false, fmt: hex };
  if (claim.kind !== "origin" && claim.kind !== "level") return null;
  if (claim.mem !== "prgRom") return null;
  const banked = symbols.filter((s) => s.rom_offset !== undefined);
  if (banked.length) return { lo: claim.offset, hi: claim.offset + len, syms: banked.map((s) => ({ ...s, address: s.rom_offset, size: s.size, kind: "label" })), prg: true, fmt: prgHex };
  if ((spec?.mapper ?? "NROM") !== "NROM") return null;
  const cpu = (spec?.prg_base ?? 0x8000) + claim.offset;
  return { lo: cpu, hi: cpu + len, syms: symbols, prg: false, fmt: hex };
}

/**
 * A spec line's reference entries: a symbol name, or `Name+offset:span` for
 * bytes the reference reaches only through a label (SMB's coin display
 * digits are `DisplayDigits+0x16:2`, from `OutputNumbers` in the source).
 */
export function resolveRefs(line, symbols) {
  const out = [];
  for (const ref of line.ref ?? []) {
    const m = /^(.+?)(?:\+(0x[0-9a-f]+|\d+))?(?::(\d+))?$/i.exec(ref);
    if (!m) continue;
    const off = m[2] ? Number(m[2]) : 0;
    for (const s of symbols) {
      if (s.name !== m[1]) continue;
      out.push(off || m[3] ? { ...s, name: ref, address: s.address + off, ...(m[3] ? { refSpan: Number(m[3]) } : {}) } : s);
    }
  }
  return out;
}

/** Loose name agreement for claims no spec line takes (the pre-spec scorer, kept for out-of-spec claims). */
function looseAgrees(symbols, claim) {
  const cw = new Set(words(`${claim.name} ${claim.context ?? ""} ${claim.notes ?? ""}`).filter((w) => w.length >= 3));
  for (const s of symbols) {
    const parts = words(s.name).filter((w) => w.length >= 3);
    if (parts.some((p) => cw.has(p) || [...cw].some((w) => w.includes(p) || p.includes(w)))) return s;
  }
  return null;
}

/**
 * Grade one claim. Verdicts are ADR-0020's vocabulary: agrees, disagrees,
 * unknown-to-reference, needs-judge (a picture claim for Claude), unplaced
 * (an origin the scorer cannot put in CPU space).
 */
export function gradeClaim(claim, reference, spec) {
  const line = spec ? lineFor(claim, spec.lines ?? []) : null;
  const base = { ...claim, line: line?.id ?? null };
  if (["tile", "palette", "sprite", "scene", "note"].includes(claim.kind)) return { ...base, verdict: "needs-judge", grader: "claude" };
  const p = place(claim, reference.symbols ?? [], spec);
  if (!p) return { ...base, verdict: "unplaced", grader: "reference", why: "a PRG origin in a banked game needs symbol ROM offsets (import the .dbg)" };
  const { lo, hi, syms: symbols, fmt } = p;
  const at = symbols.filter((s) => s.address <= lo && lo < s.address + spanOf(s, symbols, null) && (p.prg ? s.kind === "label" : (s.kind === "label") === (lo >= 0x8000)));
  const exactAt = symbols.filter((s) => s.address === lo);
  const loc = fmt(lo) + (hi - lo > 1 ? `-${fmt(hi - 1)}` : "");
  if (line) {
    const refs = resolveRefs(line, symbols);
    if (refs.length === 0) return { ...base, loc, verdict: "unknown-to-reference", grader: "reference", why: `spec names ${line.ref?.join(", ")} but the reference has none of them` };
    const hit = refs.find((s) => {
      const span = spanOf(s, symbols, line);
      if (claim.kind === "routine") return lo === s.address || (hi - lo > 1 && lo <= s.address && s.address < hi);
      return lo >= s.address && hi <= s.address + span;
    });
    const expected = refs.map((s) => `${s.name} ${fmt(s.address)}${spanOf(s, symbols, line) > 1 ? `+${spanOf(s, symbols, line)}` : ""}`).join(" | ");
    const found = (exactAt.length ? exactAt : at).map((s) => s.name).slice(0, 4).join(" | ") || "none";
    return { ...base, loc, verdict: hit ? "agrees" : "disagrees", grader: "reference", symbol: hit?.name ?? null, expected, reference_at_claim: found };
  }
  const cands = exactAt.length ? exactAt : at;
  if (cands.length === 0) return { ...base, loc, verdict: "unknown-to-reference", grader: "reference", symbol: null };
  const ok = looseAgrees(cands, claim);
  return { ...base, loc, verdict: ok ? "agrees" : "disagrees", grader: "reference", symbol: (ok ?? cands[0]).name, reference_at_claim: cands.map((s) => s.name).slice(0, 4).join(" | ") };
}

/** Claims of one record_mapping input (the tool's own fields), one per origin as well. */
export function claimsFromRecord(rec, where, extra = {}) {
  const out = [];
  const kind = rec.mapping_type;
  const name = String(rec.name ?? "");
  const notes = rec.notes ?? "";
  const common = { where, name, notes, source: rec.source, confidence: rec.confidence ?? 1, id: String(rec.id ?? ""), ...extra };
  if (kind === "address" || kind === "routine") {
    const address = parseAddr(rec.id);
    if (Number.isFinite(address)) out.push({ ...common, kind, address, length: rec.length ?? (rec.stride && rec.count ? rec.stride * rec.count : undefined) });
  } else if (["tile", "palette", "sprite", "scene", "note"].includes(kind)) {
    out.push({ ...common, kind });
  }
  for (const o of rec.rom_origins ?? []) {
    // The parent entry's type is vocabulary too: an origin recorded on a palette entry is a palette table.
    out.push({ ...common, kind: kind === "level" ? "level" : "origin", context: kind, mem: o.mem, offset: o.offset, length: o.length, name: kind === "level" ? `${rec.id} ${name}` : name });
  }
  return out;
}
function parseAddr(v) {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim();
  if (/^(0x|\$)[0-9a-f]+$/i.test(s)) return parseInt(s.replace(/^(0x|\$)/i, ""), 16);
  if (/^[0-9]+$/.test(s)) return Number(s);
  if (/^[0-9a-f]+$/i.test(s)) return parseInt(s, 16);
  return NaN;
}

/**
 * The record_mapping calls of a dsh `--json` stream, each with the proof it
 * rests on (ADR-0020: a claim without its proof step is unproven): for RAM,
 * a write_memory covering the address followed by a screenshot, or a
 * play_input watch / trace_writes on it; for ROM, a ledgered write covering
 * the bytes, a reset_emulator and a screenshot after it; for a routine, a
 * disassemble or trace that reached it. Also says whether promote_mappings
 * wrote anything after the record.
 */
export function claimsFromStream(text, label = "stream") {
  const calls = [];
  const byId = new Map();
  for (const lineText of text.split("\n")) {
    const l = lineText.trim();
    if (!l.startsWith("{")) continue;
    let e; try { e = JSON.parse(l); } catch { continue; }
    if (e.type === "tool_call") { const c = { tool: e.tool, input: e.input ?? e.args ?? {}, result: null, ok: true }; calls.push(c); byId.set(e.callId, c); }
    if (e.type === "tool_result" && byId.has(e.callId)) {
      const c = byId.get(e.callId);
      const txt = typeof e.result === "string" ? e.result : JSON.stringify(e.result);
      c.result = txt; c.ok = (e.status ?? "completed") === "completed" && !String(txt).startsWith("Error");
    }
  }
  const promotedAt = calls.findIndex((c) => c.tool === "promote_mappings" && c.ok && /"promoted":\s*[1-9]|Promoted [1-9]/.test(c.result ?? ""));
  const out = [];
  calls.forEach((c, i) => {
    if (c.tool !== "record_mapping" || !c.ok) return;
    for (const claim of claimsFromRecord(c.input, label)) {
      out.push({ ...claim, proof: proofFor(claim, calls.slice(0, i)), derived: derivedFor(claim, calls.slice(0, i)), promoted: promotedAt > i });
    }
  });
  return { claims: out, calls: calls.length, tools: calls.map((c) => c.tool) };
}

/**
 * Did the address come out of the session's own search before it was
 * recorded? True when a diff_memory result listed it (or search_memory, for
 * a ROM origin). The worker model has read SMB's RAM map in training
 * (eval/runs/20261009-1135-sheet3-hud-position), so a proven claim it never
 * derived measures its memory, not the method.
 */
export function derivedFor(claim, before) {
  const listed = (c, lo, hi) => {
    try {
      const r = JSON.parse(c.result ?? "");
      if (c.tool === "diff_memory") return (r.hits ?? []).some((h) => h.address >= lo && h.address < hi);
      if (c.tool === "search_memory") return (Array.isArray(r.offsets) ? r.offsets : []).some((m) => { const a = typeof m === "number" ? m : m.offset ?? m.address; return a >= lo && a < hi; });
    } catch { /* a non-JSON result lists nothing */ }
    return false;
  };
  if (claim.kind === "address") return before.some((c) => c.ok && listed(c, claim.address, claim.address + Math.max(1, claim.length ?? 1)));
  if (claim.kind === "origin" || claim.kind === "level") return before.some((c) => c.ok && c.tool === "search_memory" && listed(c, claim.offset, claim.offset + Math.max(1, claim.length ?? 1)));
  return null;
}

function covers(input, lo, hi) {
  const a = Number(input.address); const n = Array.isArray(input.bytes) ? input.bytes.length : 1;
  return Number.isFinite(a) && a < hi && lo < a + n;
}
const RAM = (m) => !m || ["cpu", "cpuDebug", "nesInternalRam", "workRam", "saveRam", "nesWorkRam", "nesSaveRam"].includes(m);
const LOOK = new Set(["screenshot", "get_tile_at_pixel", "get_region", "read_nametable", "list_sprites", "get_pixel_color"]);

export function proofFor(claim, before) {
  const last = (pred) => { for (let i = before.length - 1; i >= 0; i--) if (pred(before[i])) return i; return -1; };
  const lookAfter = (i) => before.slice(i + 1).some((c) => LOOK.has(c.tool) && c.ok);
  if (claim.kind === "address") {
    const lo = claim.address, hi = lo + Math.max(1, claim.length ?? 1);
    const w = last((c) => c.tool === "write_memory" && c.ok && RAM(c.input.mem_type) && covers(c.input, lo, hi));
    if (w >= 0 && lookAfter(w)) return "write+look";
    if (before.some((c) => c.tool === "play_input" && c.ok && (c.input.watch ?? []).some((a) => a >= lo && a < hi))) return "watch";
    if (before.some((c) => c.tool === "trace_writes" && c.ok && Number(c.input.address) >= lo && Number(c.input.address) < hi)) return "trace";
    return w >= 0 ? "write-no-look" : null;
  }
  if (claim.kind === "origin" || claim.kind === "level") {
    const lo = claim.offset, hi = lo + Math.max(1, claim.length ?? 1);
    const w = last((c) => c.tool === "write_memory" && c.ok && c.input.mem_type === claim.mem && covers(c.input, lo, hi));
    if (w < 0) return null;
    const r = before.findIndex((c, i) => i > w && c.tool === "reset_emulator" && c.ok);
    return r >= 0 && lookAfter(r) ? "write+reset+look" : "write-no-reset";
  }
  if (claim.kind === "routine") {
    if (before.some((c) => c.tool === "disassemble" && c.ok && Number(c.input.address) <= claim.address && claim.address < Number(c.input.address) + 0x200)) return "disassemble";
    if (before.some((c) => c.tool === "trace_writes" && c.ok && String(c.result ?? "").includes(claim.address.toString(16).toUpperCase()))) return "trace";
    return null;
  }
  return before.some((c) => LOOK.has(c.tool) && c.ok) ? "look" : null;
}

/** Claims from a mapping file (already promoted; the proof is not in the file). */
export function claimsFromMapping(m) {
  const out = [];
  for (const [key, e] of Object.entries(m.addresses ?? {})) {
    const [name, ...rest] = String(e.description ?? key).split(": ");
    out.push(...claimsFromRecord({ mapping_type: "address", id: e.address ?? key, name, notes: rest.join(": "), source: e.source, rom_origins: e.rom_origins, length: e.length, stride: e.stride, count: e.count }, "mapping"));
  }
  for (const [key, e] of Object.entries(m.routines ?? {})) out.push(...claimsFromRecord({ mapping_type: "routine", id: key, name: e.name, notes: e.notes, length: e.length }, "mapping"));
  for (const [key, e] of Object.entries(m.levels ?? {})) out.push(...claimsFromRecord({ mapping_type: "level", id: key, name: e.name ?? key, notes: e.notes, rom_origins: e.rom_origins }, "mapping"));
  for (const [key, e] of Object.entries(m.palettes ?? {})) for (const o of e.rom_origins ?? []) out.push({ where: "mapping", kind: "origin", context: "palette", id: key, name: e.name, notes: e.notes ?? "", mem: o.mem, offset: o.offset, length: o.length });
  for (const [key, e] of Object.entries(m.tiles ?? {})) for (const o of e.rom_origins ?? []) out.push({ where: "mapping", kind: "origin", context: "tile", id: key, name: e.name, notes: e.notes ?? "", mem: o.mem, offset: o.offset, length: o.length });
  return out;
}

export function tally(rows) {
  const t = {};
  for (const r of rows) t[r.verdict] = (t[r.verdict] ?? 0) + 1;
  return t;
}

function main(argv) {
  const args = argv.slice(2);
  const sha1 = args.find((a, i) => !a.startsWith("--") && !(i > 0 && ["--spec", "--stream", "--hacks"].includes(args[i - 1])))?.toLowerCase();
  if (!sha1) {
    console.error("usage: scripts/score-mapping.mjs <sha1> [--spec <spec.json>] [--stream <run.jsonl> ...] [--discoveries] [--no-mapping] [--hacks <root>] [--json]");
    process.exit(2);
  }
  const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const all = (name) => args.flatMap((a, i) => (a === name && args[i + 1] ? [args[i + 1]] : []));
  const root = resolve(flag("--hacks") ?? "hacks");
  const gameDir = join(root, `sha1-${sha1}`);
  const refFile = join(gameDir, "reference.json");
  if (!existsSync(refFile)) { console.error(`no reference at ${refFile}; import one first`); process.exit(2); }
  const reference = JSON.parse(readFileSync(refFile, "utf8"));
  const spec = flag("--spec") ? JSON.parse(readFileSync(resolve(flag("--spec")), "utf8")) : null;

  const claims = [];
  const mapFile = resolve("mappings", `sha1-${sha1}.json`);
  if (!args.includes("--no-mapping") && existsSync(mapFile)) claims.push(...claimsFromMapping(JSON.parse(readFileSync(mapFile, "utf8"))));
  if (args.includes("--discoveries")) {
    const dFile = join(gameDir, "discoveries.json");
    if (existsSync(dFile)) for (const d of JSON.parse(readFileSync(dFile, "utf8")).discoveries ?? []) claims.push(...claimsFromRecord(d, "discovery"));
  }
  for (const s of all("--stream")) claims.push(...claimsFromStream(readFileSync(resolve(s), "utf8"), s.split("/").pop()).claims);

  const rows = claims.map((c) => gradeClaim(c, reference, spec));
  const t = tally(rows);
  if (args.includes("--json")) {
    console.log(JSON.stringify({ sha1, reference: reference.source, spec: spec ? `${spec.game} v${spec.spec_version}` : null, claims: rows.length, tally: t, rows }, null, 2));
    return;
  }
  console.log(`[score-mapping] ${rows.length} claim(s) for sha1-${sha1} against "${reference.source}" (${reference.symbols?.length ?? 0} symbols)${spec ? ` · spec ${spec.game} v${spec.spec_version}` : ""}`);
  for (const r of rows) {
    const tag = { agrees: "OK ", disagrees: "?? ", "needs-judge": "JJ " }[r.verdict] ?? "-- ";
    const proof = r.proof !== undefined ? ` proof:${r.proof ?? "none"}` : "";
    console.log(`${tag}${(r.loc ?? r.kind).padEnd(11)}  ${(r.line ?? "(no line)").padEnd(18)}  "${r.name}" (${r.kind}, ${r.where}${r.source ? `, ${r.source}` : ""})${proof}  ${r.verdict}${r.expected ? `  expected ${r.expected}` : ""}${r.reference_at_claim ? `  reference here: ${r.reference_at_claim}` : ""}`);
  }
  console.log(`[score-mapping] ${Object.entries(t).map(([k, v]) => `${k} ${v}`).join(", ") || "nothing to score yet"}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv);
