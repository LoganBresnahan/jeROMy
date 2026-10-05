#!/usr/bin/env node
// Read-only reader for dsh's persisted session logs (ADR-0011): the DeepSeek
// agent's reasoning, tool calls, tool results, images and token usage, as
// dsh wrote them. jeROMy keeps no log of its own; this reads dsh's.
//
//   scripts/dsh-log.mjs list [--all] [--cwd SUBSTR] [--json]
//   scripts/dsh-log.mjs show   <id|latest> [--turn N] [--full] [--system] [--images DIR] [--no-reasoning]
//   scripts/dsh-log.mjs tail   <id|latest> [--since SEQ] [--follow]
//   scripts/dsh-log.mjs stats  <id|latest> [--json]
//   scripts/dsh-log.mjs events <id|latest> [--type T] [--since SEQ]
//   scripts/dsh-log.mjs path   <id|latest>
//
// <id> is a session id or any unique prefix of it; `latest` is the most
// recently written session across every cwd key.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";

export const DSH_HOME = process.env.DSH_HOME ?? path.join(os.homedir(), ".dsh");
export const SESSIONS_DIR = path.join(DSH_HOME, "sessions");
export const ATTACHMENTS_DIR = path.join(DSH_HOME, "attachments", "v1", "objects");

// deepseek-flash list prices per 1M tokens (2026-09-10 release notes). Cache
// reads are an assumption at a tenth of input; the report labels the result
// an estimate.
export const PRICES = { input: 0.3, cacheRead: 0.03, output: 1.2 };

const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

/**
 * Decompress a dsh session log. The file is a sequence of independent zstd
 * frames appended as the session runs; node's one-shot decoder stops after
 * the first frame, so each frame is decoded on its own (ADR-0011).
 */
export function decompressFrames(buf) {
  if (buf.length === 0) return "";
  const parts = [];
  let off = 0;
  while (off < buf.length) {
    let end = buf.indexOf(ZSTD_MAGIC, off + 4);
    if (end === -1) end = buf.length;
    try {
      parts.push(zlib.zstdDecompressSync(buf.subarray(off, end)));
      off = end;
    } catch (err) {
      // The magic can occur inside compressed payload; extend to the next candidate.
      const next = buf.indexOf(ZSTD_MAGIC, end + 4);
      if (next === -1) throw err;
      const merged = zlib.zstdDecompressSync(buf.subarray(off, next));
      parts.push(merged);
      off = next;
    }
  }
  return Buffer.concat(parts).toString("utf8");
}

export function readLogText(file) {
  if (!file.endsWith(".zstd")) return fs.readFileSync(file, "utf8");
  if (typeof zlib.zstdDecompressSync !== "function") {
    // Node before 22.15 has no zstd binding; the zstd CLI handles concatenated frames natively.
    return execFileSync("zstd", ["-dc", file], { maxBuffer: 1 << 30 }).toString("utf8");
  }
  return decompressFrames(fs.readFileSync(file));
}

export function parseEvents(text) {
  const events = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // A torn final line while dsh is still writing; ignore it until the next read.
    }
  }
  return events;
}

/** Find the canonical log file inside a session directory, newest format first. */
export function logFileIn(dir) {
  const names = fs.readdirSync(dir).filter((n) => /^session(\.v\d+)?\.jsonl(\.zstd)?$/.test(n));
  if (names.length === 0) return null;
  const version = (n) => Number((n.match(/\.v(\d+)\./) ?? [0, 0])[1]);
  names.sort((a, b) => version(b) - version(a));
  return path.join(dir, names[0]);
}

export function listSessions(root = SESSIONS_DIR) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const key of fs.readdirSync(root)) {
    const keyDir = path.join(root, key);
    if (!fs.statSync(keyDir).isDirectory()) continue;
    for (const name of fs.readdirSync(keyDir)) {
      if (!name.startsWith("session-")) continue;
      const dir = path.join(keyDir, name);
      const file = logFileIn(dir);
      if (!file) continue;
      const st = fs.statSync(file);
      out.push({ id: name, key, dir, file, mtimeMs: st.mtimeMs, bytes: st.size });
    }
  }
  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return out;
}

export function resolveSession(ref, root = SESSIONS_DIR) {
  const all = listSessions(root);
  if (all.length === 0) throw new Error(`no sessions under ${root}`);
  if (!ref || ref === "latest") return all[0];
  const needle = ref.startsWith("session-") ? ref : `session-${ref}`;
  const hits = all.filter((s) => s.id === needle || s.id.startsWith(needle));
  if (hits.length === 1) return hits[0];
  if (hits.length === 0) throw new Error(`no session matching ${ref}`);
  throw new Error(`ambiguous: ${hits.map((h) => h.id).join(", ")}`);
}

export function attachmentPath(attachmentId, root = ATTACHMENTS_DIR) {
  const hex = String(attachmentId).replace(/^sha256:/, "");
  return path.join(root, hex.slice(0, 2), hex);
}

// ---------------------------------------------------------------------------
// Summary

export function summarize(events) {
  const header = events.find((e) => e.type === "session") ?? {};
  const s = {
    id: header.id ?? null,
    cwd: header.cwd ?? null,
    createdAt: header.createdAt ?? null,
    agentPreset: header.agentPreset ?? null,
    title: null,
    model: null,
    turns: 0,
    steps: 0,
    toolCalls: 0,
    toolErrors: 0,
    toolsByName: {},
    images: 0,
    usage: { inputTokens: 0, cacheReadTokens: 0, outputTokens: 0 },
    turnEnds: {},
    firstUser: null,
    lastSeq: -1,
    lastTime: null,
    injectedKinds: {},
  };
  for (const e of events) {
    if (typeof e.seq === "number" && e.seq > s.lastSeq) s.lastSeq = e.seq;
    if (e.time) s.lastTime = e.time;
    switch (e.type) {
      case "session/title":
        s.title = e.data?.title ?? s.title;
        break;
      case "request/context":
        s.model = e.data?.model ?? s.model;
        break;
      case "turn/start":
        s.turns++;
        break;
      case "turn/end": {
        const k = e.data?.reason?.kind ?? "?";
        s.turnEnds[k] = (s.turnEnds[k] ?? 0) + 1;
        break;
      }
      case "step/start":
        s.steps++;
        break;
      case "tool/call":
        s.toolCalls++;
        s.toolsByName[e.data.name] = (s.toolsByName[e.data.name] ?? 0) + 1;
        break;
      case "tool/result": {
        if (e.data?.message?.isError) s.toolErrors++;
        for (const b of e.data?.message?.content ?? []) if (b.type === "image") s.images++;
        break;
      }
      case "assistant/message": {
        const u = e.data?.usage;
        if (u) {
          s.usage.inputTokens += u.inputTokens ?? 0;
          s.usage.cacheReadTokens += u.cacheReadTokens ?? 0;
          s.usage.outputTokens += u.outputTokens ?? 0;
        }
        break;
      }
      case "user/message": {
        const kind = e.data?.source?.kind ?? "?";
        s.injectedKinds[kind] = (s.injectedKinds[kind] ?? 0) + 1;
        if (!s.firstUser && kind === "user") s.firstUser = textOf(e.data.content);
        break;
      }
    }
  }
  s.costUsd =
    (s.usage.inputTokens * PRICES.input + s.usage.cacheReadTokens * PRICES.cacheRead + s.usage.outputTokens * PRICES.output) / 1e6;
  return s;
}

function textOf(content) {
  return (content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Transcript rendering

const LIMITS = { result: 600, args: 400, reasoning: 1200, text: 4000, system: 400 };

function clip(str, n, full) {
  if (full || str.length <= n) return str;
  return `${str.slice(0, n)}… [+${str.length - n} chars]`;
}

function indent(str, pad = "    ") {
  return str
    .split("\n")
    .map((l) => pad + l)
    .join("\n");
}

function hhmmss(ms) {
  const d = new Date(ms);
  return d.toTimeString().slice(0, 8);
}

/**
 * Render events as a transcript. Options: turn (only that turn), full (no
 * clipping), system (print system messages), reasoning (default true),
 * images (dir to copy PNGs into), since (skip events with seq <= since).
 */
export function renderTranscript(events, opts = {}) {
  const lines = [];
  const reasoning = opts.reasoning !== false;
  const calls = new Map();
  for (const e of events) if (e.type === "tool/call") calls.set(e.data.callId, e.data);
  const header = events.find((e) => e.type === "session");
  if (header && opts.since == null && !opts.turn) {
    const sum = summarize(events);
    lines.push(`# ${header.id} · ${sum.title ?? "(untitled)"}`);
    lines.push(`# cwd ${header.cwd} · preset ${header.agentPreset ?? "?"} · model ${sum.model ?? "?"} · created ${new Date(header.createdAt).toISOString()}`);
    lines.push("");
  }
  for (const e of events) {
    if (opts.since != null && !(e.seq > opts.since)) continue;
    const turn = e.data?.turn;
    if (opts.turn && turn !== undefined && turn !== opts.turn) continue;
    if (opts.turn && turn === undefined && !["user/message", "agent/inbox/spliced"].includes(e.type)) continue;
    const t = e.time ? hhmmss(e.time) : "--:--:--";
    const tag = `[${String(e.seq).padStart(4)} ${t}]`;
    switch (e.type) {
      case "turn/start":
        lines.push(`${tag} ━━━ turn ${e.data.turn} ━━━`);
        break;
      case "turn/end":
        lines.push(`${tag} ─── turn ${e.data.turn} end: ${JSON.stringify(e.data.reason)}`);
        lines.push("");
        break;
      case "system/message":
        if (opts.system) {
          lines.push(`${tag} SYSTEM (turn ${turn} step ${e.data.step})`);
          lines.push(indent(clip(textOf(e.data.message.content), LIMITS.system, opts.full)));
        }
        break;
      case "user/message": {
        const kind = e.data.source?.kind ?? "?";
        lines.push(`${tag} USER <${kind}>`);
        lines.push(indent(clip(textOf(e.data.content), LIMITS.text, opts.full)));
        for (const b of e.data.content ?? []) if (b.type === "image") lines.push(indent(imageLine(b, opts)));
        break;
      }
      case "assistant/message": {
        const m = e.data.message;
        const u = e.data.usage;
        const usage = u ? ` · in ${u.inputTokens} (cache ${u.cacheReadTokens ?? 0}) out ${u.outputTokens}` : "";
        lines.push(`${tag} ASSISTANT (turn ${turn} step ${e.data.step})${usage}`);
        for (const b of m.content ?? []) {
          if (b.type === "reasoning") {
            if (reasoning) lines.push(indent(`▷ ${clip(b.text ?? "", LIMITS.reasoning, opts.full)}`));
          } else if (b.type === "text") {
            lines.push(indent(clip(b.text ?? "", LIMITS.text, opts.full)));
          } else if (b.type === "tool-call") {
            lines.push(indent(`→ ${b.name} ${clip(b.arguments ?? "", LIMITS.args, opts.full)}`));
          }
        }
        break;
      }
      case "tool/result": {
        const m = e.data.message;
        const call = calls.get(m.toolCallId);
        const name = call?.name ?? "?";
        const flag = m.isError ? " ERROR" : "";
        lines.push(`${tag} RESULT ${name}${flag}`);
        for (const b of m.content ?? []) {
          if (b.type === "text") lines.push(indent(clip(b.text ?? "", LIMITS.result, opts.full)));
          else if (b.type === "image") lines.push(indent(imageLine(b, opts)));
          else lines.push(indent(`(${b.type})`));
        }
        break;
      }
      case "agent/inbox/spliced": {
        for (const msg of e.data.inserted ?? []) {
          lines.push(`${tag} QUEUED <${msg.source?.kind ?? "?"}> for ${e.data.target}: ${clip(textOf(msg.content), 200, opts.full)}`);
        }
        break;
      }
      case "command/run":
        lines.push(`${tag} COMMAND /${e.data.name}${e.data.args ?? ""}`);
        break;
      case "deliverables/presented":
        lines.push(`${tag} DELIVERABLES ${(e.data.files ?? []).map((f) => f.path).join(", ")}`);
        break;
      default:
        break;
    }
  }
  return lines.join("\n");
}

function imageLine(block, opts) {
  const a = block.attachment ?? {};
  const src = attachmentPath(a.attachmentId);
  let note = fs.existsSync(src) ? src : `${src} (missing)`;
  if (opts.images && fs.existsSync(src)) {
    fs.mkdirSync(opts.images, { recursive: true });
    const ext = (a.mediaType ?? "image/png").split("/")[1] ?? "png";
    const dest = path.join(opts.images, `${String(a.attachmentId).replace(/^sha256:/, "").slice(0, 12)}.${ext}`);
    if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
    note = dest;
  }
  return `🖼 ${a.width ?? "?"}x${a.height ?? "?"} ${a.mediaType ?? ""} ${note}`;
}

// ---------------------------------------------------------------------------
// CLI

function parseArgs(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (key.startsWith("no-")) flags[key.slice(3)] = false;
      else if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else flags[key] = true;
    } else pos.push(a);
  }
  return { pos, flags };
}

function fmtAge(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  if (s < 172800) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function loadEvents(session) {
  return parseEvents(readLogText(session.file));
}

function cmdList(flags) {
  let sessions = listSessions();
  if (flags.cwd) sessions = sessions.filter((s) => s.key.includes(String(flags.cwd).replace(/\//g, "-")));
  if (!flags.all) sessions = sessions.slice(0, 15);
  const rows = sessions.map((s) => {
    const sum = summarize(loadEvents(s));
    return { ...s, ...sum, age: fmtAge(s.mtimeMs) };
  });
  if (flags.json) {
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    return;
  }
  for (const r of rows) {
    const title = (r.title ?? r.firstUser ?? "(untitled)").replace(/\s+/g, " ").slice(0, 48);
    const tools = Object.entries(r.toolsByName)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([n, c]) => `${n}×${c}`)
      .join(" ");
    console.log(
      `${r.id.slice(8, 16)}  ${r.age.padStart(8)}  ${String(r.turns).padStart(2)}t ${String(r.toolCalls).padStart(3)}c ${r.toolErrors ? `${r.toolErrors}e ` : "   "} ${r.model ?? "-"}  ${r.cwd ?? r.key}  "${title}"  ${tools}`,
    );
  }
}

function cmdShow(ref, flags) {
  const session = resolveSession(ref);
  const events = loadEvents(session);
  const out = renderTranscript(events, {
    turn: flags.turn ? Number(flags.turn) : undefined,
    full: Boolean(flags.full),
    system: Boolean(flags.system),
    reasoning: flags.reasoning !== false,
    images: flags.images ? String(flags.images) : undefined,
  });
  process.stdout.write(`${out}\n`);
}

async function cmdTail(ref, flags) {
  const session = resolveSession(ref);
  let since = flags.since !== undefined ? Number(flags.since) : -1;
  let lastSize = -1;
  const emit = () => {
    const st = fs.statSync(session.file);
    if (st.size === lastSize) return;
    lastSize = st.size;
    const events = loadEvents(session).filter((e) => typeof e.seq === "number" && e.seq > since);
    if (events.length === 0) return;
    const out = renderTranscript(events, { since, full: Boolean(flags.full), reasoning: flags.reasoning !== false, images: flags.images ? String(flags.images) : undefined });
    if (out.trim()) process.stdout.write(`${out}\n`);
    since = Math.max(since, ...events.map((e) => e.seq));
  };
  emit();
  if (!flags.follow) {
    console.log(`# last seq ${since}`);
    return;
  }
  const interval = Number(flags.interval ?? 1000);
  await new Promise(() => setInterval(emit, interval));
}

function cmdStats(ref, flags) {
  const session = resolveSession(ref);
  const sum = summarize(loadEvents(session));
  if (flags.json) {
    process.stdout.write(`${JSON.stringify({ ...sum, file: session.file }, null, 2)}\n`);
    return;
  }
  console.log(`${sum.id} · ${sum.title ?? "(untitled)"}`);
  console.log(`  file      ${session.file}`);
  console.log(`  cwd       ${sum.cwd} · preset ${sum.agentPreset ?? "?"} · model ${sum.model ?? "?"}`);
  console.log(`  turns     ${sum.turns} · steps ${sum.steps} · ends ${JSON.stringify(sum.turnEnds)}`);
  console.log(`  tools     ${sum.toolCalls} calls · ${sum.toolErrors} errors · ${sum.images} images`);
  for (const [n, c] of Object.entries(sum.toolsByName).sort((a, b) => b[1] - a[1])) console.log(`            ${String(c).padStart(3)}  ${n}`);
  console.log(`  inputs    ${JSON.stringify(sum.injectedKinds)}`);
  console.log(`  tokens    in ${sum.usage.inputTokens} · cache ${sum.usage.cacheReadTokens} · out ${sum.usage.outputTokens}`);
  console.log(`  est. cost $${sum.costUsd.toFixed(4)} (deepseek-flash list prices; cache read assumed 0.1× input)`);
  console.log(`  last seq  ${sum.lastSeq} at ${sum.lastTime ? new Date(sum.lastTime).toISOString() : "?"}`);
}

function cmdEvents(ref, flags) {
  const session = resolveSession(ref);
  let events = loadEvents(session);
  if (flags.type) events = events.filter((e) => e.type === flags.type);
  if (flags.since !== undefined) events = events.filter((e) => e.seq > Number(flags.since));
  for (const e of events) process.stdout.write(`${JSON.stringify(e)}\n`);
}

function usage() {
  console.error(fs.readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 15).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(2);
}

async function main() {
  const { pos, flags } = parseArgs(process.argv.slice(2));
  const [cmd, ref] = pos;
  switch (cmd) {
    case "list":
      return cmdList(flags);
    case "show":
      return cmdShow(ref, flags);
    case "tail":
      return cmdTail(ref, flags);
    case "stats":
      return cmdStats(ref, flags);
    case "events":
      return cmdEvents(ref, flags);
    case "path":
      return console.log(resolveSession(ref).file);
    default:
      return usage();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (isMain) {
  main().catch((err) => {
    console.error(`[dsh-log] ${err.message}`);
    process.exit(1);
  });
}
