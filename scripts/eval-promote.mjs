#!/usr/bin/env node
// Move graded lines from eval runs into the campaign mapping (ADR-0022).
// A run promotes only into its own copy (<run>/mapping-in/); this script,
// run by Claude after grading, decides per spec line what mappings/ keeps:
// a line graded right and proven replaces the mapping's entry for it; a
// line graded wrong removes the mapping's entry when it is that same wrong
// claim; anything else changes nothing. Given several runs (the three
// repeats of a re-run, eval/README.md), the majority decides.
//
// Usage: scripts/eval-promote.mjs <eval/runs/<id>> [<eval/runs/<id>> ...] [--dry-run] [--skip <line,ids>]
//   --skip: lines a run graded right but must not promote (their answer leaked into the run; they get a clean re-run).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PROVEN } from "./eval-grade.mjs";

// Picture claims (sheet 1) promote by Claude's judgment like any other verdict.
const RECORD = { address: "addresses", routine: "routines", level: "levels", scene: "scenes", tile: "tiles", sprite: "sprites", palette: "palettes", note: "notes" };
// An origin claim lives on its parent entry (score-mapping.mjs `context`); promoting the line promotes that entry.
const PARENT = { tile: "tiles", sprite: "sprites", palette: "palettes", address: "addresses", note: "notes" };
const recordOf = (x) => (x.kind === "origin" ? PARENT[x.context] : RECORD[x.kind]);
const RIGHT = new Set(["agrees", "confirmed"]);
const WRONG = new Set(["disagrees", "rejected"]);

/** Per line in scope: the decision across runs. `runs` = [{ id, rows, copy }] with copy the run's promoted mapping copy. */
export function decide(lines, runs) {
  return lines.map((line) => {
    const outcomes = runs.map((r) => {
      const mine = r.rows.filter((x) => x.line === line.id && recordOf(x));
      const right = mine.find((x) => RIGHT.has(x.final) && PROVEN.has(x.proof ?? ""));
      const wrong = !right && mine.find((x) => WRONG.has(x.final));
      return { run: r, right, wrong };
    });
    const nRight = outcomes.filter((o) => o.right).length;
    const nWrong = outcomes.filter((o) => o.wrong).length;
    const need = Math.floor(runs.length / 2) + 1;
    if (nRight >= need) {
      // A real entry beats a note: look in every repeat for a right claim whose entry the run promoted.
      const entryOf = (o) => o.run.rows.filter((x) => x.line === line.id && RIGHT.has(x.final) && PROVEN.has(x.proof ?? "") && recordOf(x) !== "notes").find((x) => o.run.copy?.[recordOf(x)]?.[x.id]);
      // Of the repeats that got the line right, the one with the most right entries (a font of 23 tiles beats one of 21).
      const rightCount = (x) => new Set(x.run.rows.filter((y) => y.line === line.id && RIGHT.has(y.final) && PROVEN.has(y.proof ?? "")).map((y) => y.id)).size;
      const o = outcomes.filter((x) => x.right && entryOf(x)).sort((a, b) => rightCount(b) - rightCount(a))[0];
      if (o) {
        const x = entryOf(o);
        // A picture line is often several entries (a bush is five tiles): the same run's other right entries on the line go with it.
        const more = o.run.rows.filter((y) => y !== x && y.line === line.id && recordOf(y) === recordOf(x) && y.id !== x.id && RIGHT.has(y.final) && PROVEN.has(y.proof ?? "") && o.run.copy?.[recordOf(y)]?.[y.id])
          .filter((y, i, a) => a.findIndex((z) => z.id === y.id) === i).map((y) => ({ key: y.id, entry: o.run.copy[recordOf(y)][y.id] }));
        return { line, action: "replace", record: recordOf(x), key: x.id, entry: o.run.copy[recordOf(x)][x.id], more, from: o.run.id, votes: `${nRight}/${runs.length} right` };
      }
      const noted = outcomes.find((x) => x.right && recordOf(x.right) === "notes");
      return noted ? { line, action: "note", from: noted.run.id, votes: `${nRight}/${runs.length} right` }
        : { line, action: "none", why: "graded right, but no run promoted the entry into its copy", votes: `${nRight}/${runs.length} right` };
    }
    if (nWrong >= need) {
      const keys = outcomes.filter((o) => o.wrong).map((o) => `${recordOf(o.wrong)}.${o.wrong.id}`);
      return { line, action: "remove-if-same", keys, votes: `${nWrong}/${runs.length} wrong` };
    }
    return { line, action: "none", why: "no majority", votes: `${nRight} right, ${nWrong} wrong of ${runs.length}` };
  });
}

/** Apply decisions to a mapping and its spec lines; returns what changed. Side entries of the copies fill gaps. */
export function apply(mapping, spec, decisions, runs, skip = []) {
  const changes = [];
  const inScope = new Set(decisions.map((d) => d.line.id));
  const owned = new Set(spec.lines.flatMap((l) => [l.entry, ...(l.entries ?? [])]).filter(Boolean));
  for (const d of decisions) {
    const line = spec.lines.find((l) => l.id === d.line.id);
    if (d.action === "replace") {
      const now = new Set([d.key, ...(d.more ?? []).map((m) => m.key)].map((k) => `${d.record}.${k}`));
      // Only the line's own answer is replaced; its `holds` (other lines' entries it is held back with) stay.
      for (const old of [line.entry, ...(line.entries ?? [])].filter(Boolean)) {
        if (now.has(old) || old === "notes") continue;
        const [rec, k] = [old.slice(0, old.indexOf(".")), old.slice(old.indexOf(".") + 1)];
        if (mapping[rec]?.[k]) { delete mapping[rec][k]; changes.push(`- ${old} (${line.id}, replaced)`); }
      }
      mapping[d.record] ??= {};
      mapping[d.record][d.key] = d.entry;
      changes.push(`+ ${d.record}.${d.key} (${line.id}, ${d.votes}, from ${d.from})`);
      for (const m of d.more ?? []) { mapping[d.record][m.key] = m.entry; changes.push(`+ ${d.record}.${m.key} (${line.id}, with ${d.key})`); }
      Object.assign(line, { status: "promoted", run: d.from, verdict: "agrees", entry: `${d.record}.${d.key}` });
      if (d.more?.length) line.entries = d.more.map((m) => `${d.record}.${m.key}`); else delete line.entries;
    } else if (d.action === "note") {
      // The note itself arrives with the run's notes below; the line points at the notes.
      Object.assign(line, { status: "promoted", run: d.from, verdict: "agrees", entry: "notes" });
      changes.push(`= ${line.id} (${d.votes}, a note from ${d.from})`);
    } else if (d.action === "remove-if-same") {
      if (line.entry && d.keys.includes(line.entry)) {
        const [rec, k] = [line.entry.slice(0, line.entry.indexOf(".")), line.entry.slice(line.entry.indexOf(".") + 1)];
        if (mapping[rec]?.[k]) { delete mapping[rec][k]; changes.push(`- ${line.entry} (${line.id}, ${d.votes})`); }
        delete line.entry;
      }
      Object.assign(line, { status: "attempted", verdict: "disagrees", run: runs[runs.length - 1].id });
    }
  }
  // Side discoveries (ADR-0022 §3): entries a run promoted that no in-scope line owns fill gaps only.
  for (const r of runs) {
    // A claim this run graded wrong never enters as a side discovery (20261009-1414: a mis-assigned claim nearly did).
    const wrongKeys = new Set(r.rows.filter((x) => WRONG.has(x.final) && recordOf(x)).map((x) => `${recordOf(x)}.${x.id}`));
    for (const rec of ["addresses", "routines", "levels", "scenes", "tiles", "sprites", "palettes"]) {
      for (const [k, v] of Object.entries(r.copy?.[rec] ?? {})) {
        const key = `${rec}.${k}`;
        if (owned.has(key) || decisions.some((d) => d.action === "replace" && [d.key, ...(d.more ?? []).map((m) => m.key)].some((k) => `${d.record}.${k}` === key))) continue;
        if (spec.lines.some((l) => inScope.has(l.id) && l.entry === key)) continue;
        if (wrongKeys.has(key)) { changes.push(`  skipped ${key} (graded wrong in ${r.id})`); continue; }
        // A skipped line's claims stay out entirely, or its own leaked answer would be in the mapping its re-run starts from.
        if (r.rows.some((x) => skip.includes(x.line) && `${recordOf(x)}.${x.id}` === key)) { changes.push(`  skipped ${key} (line skipped)`); continue; }
        // A claim on a line that got a decision is that line's candidate; only the decision's entry goes in, never a twin.
        const decided = new Set(decisions.filter((d) => d.action === "replace" || d.action === "note").map((d) => d.line.id));
        if (r.rows.some((x) => x.line && decided.has(x.line) && `${recordOf(x)}.${x.id}` === key)) continue;
        mapping[rec] ??= {};
        if (!mapping[rec][k]) {
          mapping[rec][k] = v; changes.push(`+ ${key} (side discovery, from ${r.id})`);
          // An entry that answers a spec line must be held back when that line runs (ledger F10), so the line names it.
          const owner = r.rows.find((x) => x.line && `${recordOf(x)}.${x.id}` === key);
          const line = owner && spec.lines.find((l) => l.id === owner.line);
          if (line && !line.entry) { line.entry = key; changes.push(`  ${line.id} entry = ${key} (held back when it runs)`); }
        }
      }
    }
    for (const n of r.copy?.notes ?? []) {
      if (mapping.notes.includes(n)) continue;
      // A note recorded as a claim ("HUD layout: ...") enters only if judged right, from the repeat that decided its line,
      // and never for a skipped line: a rejected HUD note and three copies of the right one nearly went in (sheet1-rerun).
      const x = r.rows.find((y) => y.kind === "note" && n.startsWith(`${y.id}:`));
      if (x) {
        const d = decisions.find((dd) => dd.line.id === x.line);
        if (!RIGHT.has(x.final) || skip.includes(x.line) || (d && d.action === "note" && d.from !== r.id)) { changes.push(`  skipped note ${x.id} (from ${r.id})`); continue; }
      }
      mapping.notes.push(n); changes.push(`+ note (from ${r.id})`);
    }
  }
  if (changes.length) mapping.version = (mapping.version ?? 1) + 1;
  return changes;
}

function main(argv) {
  const si = argv.indexOf("--skip");
  const skip = si > 0 ? (argv[si + 1] ?? "").split(",") : [];
  const dirs = argv.slice(2).filter((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--skip");
  if (dirs.length === 0) { console.error("usage: scripts/eval-promote.mjs <eval/runs/<id>> [...] [--dry-run]"); process.exit(2); }
  const runs = dirs.map((d) => {
    const dir = resolve(d);
    const run = JSON.parse(readFileSync(join(dir, "run.json"), "utf8"));
    const grades = JSON.parse(readFileSync(join(dir, "grades.json"), "utf8"));
    const spec = JSON.parse(readFileSync(resolve(run.spec), "utf8"));
    const copyFile = join(dir, "mapping-in", `sha1-${spec.sha1}.json`);
    return { id: run.id, run, specPath: resolve(run.spec), rows: grades.rows, copy: existsSync(copyFile) ? JSON.parse(readFileSync(copyFile, "utf8")) : null };
  });
  const specPath = runs[0].specPath;
  const spec = JSON.parse(readFileSync(specPath, "utf8"));
  const lines = spec.lines.filter((l) => runs[0].run.lines.includes(l.id) && !skip.includes(l.id));
  if (skip.length) console.log(`[eval-promote] skipped (not promoted): ${skip.join(", ")}`);
  const mapFile = resolve("mappings", `sha1-${spec.sha1}.json`);
  const mapping = JSON.parse(readFileSync(mapFile, "utf8"));
  const decisions = decide(lines, runs);
  for (const d of decisions) console.log(`[eval-promote] ${d.line.id}: ${d.action} (${d.votes})${d.why ? ` ${d.why}` : ""}`);
  const changes = apply(mapping, spec, decisions, runs, skip);
  for (const c of changes) console.log(`  ${c}`);
  if (argv.includes("--dry-run")) { console.log("[eval-promote] dry run; nothing written"); return; }
  writeFileSync(mapFile, JSON.stringify(mapping, null, 2) + "\n");
  writeFileSync(specPath, JSON.stringify(spec, null, 2) + "\n");
  console.log(`[eval-promote] ${changes.length} change(s) to ${mapFile} and ${specPath}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv);
