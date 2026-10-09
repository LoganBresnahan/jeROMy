#!/usr/bin/env node
// Grade one eval run (ADR-0020): the record_mapping claims in the run's
// streams, each assigned to a spec line, graded by scripts/score-mapping.mjs
// and held to its proof step. Writes grades.json, grades.md and
// distribution.md into the run directory; Claude then fills the needs-judge
// rows from the saved images and writes report.md.
//
// Usage: scripts/eval-grade.mjs <eval/runs/<id>>
//   Reads <run>/run.json (written by scripts/eval-run.sh) and <run>/streams/*.jsonl.
//   Re-running overwrites grades.json and distribution.md; grades.md is only
//   written when absent or when it holds no claude verdicts yet (pass --force
//   to overwrite those too).
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { claimsFromStream, gradeClaim } from "./score-mapping.mjs";

/** A claim the reference agrees with still fails without its proof step (eval/README.md). */
export const PROVEN = new Set(["write+look", "watch", "trace", "write+reset+look", "disassemble", "look"]);

export function finalVerdict(row) {
  if (row.verdict === "needs-judge" || row.verdict === "unplaced") return row.verdict;
  if (!PROVEN.has(row.proof ?? "")) return "unproven";
  return row.verdict;
}

/** Per-line stages for the lines in scope, from graded rows (ADR-0020 §4: the distribution, not a scalar). */
export function distribution(lines, rows) {
  const per = lines.map((line) => {
    const mine = rows.filter((r) => r.line === line.id);
    const best = mine.find((r) => r.final === "agrees" || r.final === "confirmed") ?? mine.find((r) => PROVEN.has(r.proof ?? "")) ?? mine[0] ?? null;
    return {
      id: line.id,
      name: line.name,
      recorded: mine.length > 0,
      proof: mine.some((r) => PROVEN.has(r.proof ?? "")),
      promoted: mine.some((r) => r.promoted),
      derived: mine.some((r) => r.derived),
      right: mine.some((r) => r.final === "agrees" || r.final === "confirmed"),
      wrong: mine.length > 0 && !mine.some((r) => r.final === "agrees" || r.final === "confirmed") && mine.some((r) => r.final === "disagrees" || r.final === "rejected"),
      unproven: mine.length > 0 && mine.every((r) => r.final === "unproven"),
      best,
    };
  });
  const count = (k) => per.filter((p) => p[k]).length;
  return { per, stages: { in_scope: lines.length, reached_proof: count("proof"), recorded: count("recorded"), derived: count("derived"), promoted: count("promoted"), right: count("right"), wrong: count("wrong"), unproven: count("unproven") } };
}

function usage(text) {
  let calls = 0, inTok = 0, outTok = 0, steps = 0;
  for (const l of text.split("\n")) {
    if (!l.startsWith("{")) continue;
    let e; try { e = JSON.parse(l); } catch { continue; }
    if (e.type === "tool_call") calls++;
    if (e.type === "status" && e.phase === "step_end") { steps++; const u = e.usage ?? {}; inTok += (u.inputTokens ?? 0) + (u.cacheReadTokens ?? 0); outTok += u.outputTokens ?? 0; }
  }
  return { calls, steps, inTok, outTok };
}

const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

function main(argv) {
  const dir = resolve(argv[2] ?? "");
  const force = argv.includes("--force");
  const runFile = join(dir, "run.json");
  if (!argv[2] || !existsSync(runFile)) { console.error("usage: scripts/eval-grade.mjs <eval/runs/<id>> (needs run.json from scripts/eval-run.sh)"); process.exit(2); }
  const run = JSON.parse(readFileSync(runFile, "utf8"));
  const spec = JSON.parse(readFileSync(resolve(run.spec), "utf8"));
  const refFile = resolve("hacks", `sha1-${spec.sha1}`, "reference.json");
  const reference = existsSync(refFile) ? JSON.parse(readFileSync(refFile, "utf8")) : { source: "none", symbols: [] };
  const inScope = spec.lines.filter((l) => run.lines.includes(l.id));

  const streamsDir = join(dir, "streams");
  const files = existsSync(streamsDir) ? readdirSync(streamsDir).filter((f) => f.endsWith(".jsonl")).sort() : [];
  // A resumed session (task-1.r1.jsonl after a provider error) is one task: its proof may sit in the first stream.
  const tasks = new Map();
  for (const f of files) {
    const task = f.replace(/(\.r\d+)?\.jsonl$/, "");
    tasks.set(task, (tasks.get(task) ?? "") + readFileSync(join(streamsDir, f), "utf8") + "\n");
  }
  const rows = [];
  const totals = { calls: 0, steps: 0, inTok: 0, outTok: 0 };
  for (const [task, text] of tasks) {
    const u = usage(text);
    for (const k of Object.keys(totals)) totals[k] += u[k];
    for (const c of claimsFromStream(text, task).claims) {
      const g = gradeClaim(c, reference, spec);
      rows.push({ ...g, reference_verdict: g.verdict, final: finalVerdict(g) });
    }
  }
  const dist = distribution(inScope, rows);
  writeFileSync(join(dir, "grades.json"), JSON.stringify({ run: run.id, spec: `${spec.game} v${spec.spec_version}`, reference: reference.source, totals, stages: dist.stages, rows }, null, 2) + "\n");

  const gradesMd = join(dir, "grades.md");
  const judged = existsSync(gradesMd) && /\| claude \| (confirmed|rejected)/.test(readFileSync(gradesMd, "utf8"));
  if (!judged || force) {
    const out = [
      `# Grades: ${run.id}`,
      "",
      `Reference: ${reference.source}. Spec: ${spec.game} v${spec.spec_version}. One row per claim (eval/README.md); \`final\` is the reference verdict held to the proof step.`,
      "",
      "| line | claim | at | evidence (proof) | reference | final | grader | image |",
      "|---|---|---|---|---|---|---|---|",
      ...rows.map((r) => `| ${r.line ?? "(none)"} | ${cell(r.name)}${r.notes ? ` — ${cell(r.notes).slice(0, 120)}` : ""} | ${r.loc ?? r.id} | ${r.proof ?? "none"}${r.derived === true ? ", derived by diff" : r.derived === false ? ", not in any diff" : ""}${r.promoted ? ", promoted" : ""} | ${r.reference_verdict}${r.expected ? ` (expected ${cell(r.expected)}; here: ${cell(r.reference_at_claim)})` : ""} | ${r.final === "needs-judge" ? "pending" : r.final} | ${r.grader} | |`),
      "",
    ];
    writeFileSync(gradesMd, out.join("\n"));
  }

  const s = dist.stages;
  const md = [
    `## Distribution`,
    "",
    "| Stage | Count |",
    "|---|---|",
    `| lines in scope | ${s.in_scope} |`,
    `| attempted (from the replay) | see below |`,
    `| reached proof | ${s.reached_proof} |`,
    `| recorded | ${s.recorded} |`,
    `| derived (the address was in a diff before it was recorded) | ${s.derived} |`,
    `| promoted | ${s.promoted} |`,
    `| graded right | ${s.right} |`,
    `| graded wrong | ${s.wrong} |`,
    `| unproven | ${s.unproven} |`,
    `| cost (USD), tool calls, wall time | ${run.cost_usd ?? "?"}, ${totals.calls}, ${run.wall_seconds ? `${Math.round(run.wall_seconds)} s` : "?"} |`,
    "",
    "| line | recorded | proof | derived | promoted | final | claim |",
    "|---|---|---|---|---|---|---|",
    ...dist.per.map((p) => `| ${p.id} | ${p.recorded ? "yes" : "no"} | ${p.best?.proof ?? "—"} | ${p.derived ? "yes" : "no"} | ${p.promoted ? "yes" : "no"} | ${p.best?.final ?? "—"} | ${p.best ? `${cell(p.best.name)} @ ${p.best.loc ?? p.best.id}` : "—"} |`),
    "",
    `Tokens in ${totals.inTok}, out ${totals.outTok}, steps ${totals.steps}. Claims outside the lines in scope: ${rows.filter((r) => !run.lines.includes(r.line)).length}.`,
    "",
  ];
  writeFileSync(join(dir, "distribution.md"), md.join("\n"));
  console.log(`[eval-grade] ${rows.length} claim(s) · in scope ${s.in_scope} · proof ${s.reached_proof} · recorded ${s.recorded} · promoted ${s.promoted} · right ${s.right} · wrong ${s.wrong} · unproven ${s.unproven}${judged && !force ? " · grades.md kept (has claude verdicts)" : ""}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv);
