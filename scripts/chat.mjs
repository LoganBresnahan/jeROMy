#!/usr/bin/env node
// Headless chat client for the v0.1 server: send one instruction over the
// WebSocket, stream the agent's events to stdout, save any screenshots the
// agent took, exit when the turn ends. Used by /verify and roadmap item 0.
//
// Usage: node scripts/chat.mjs "Take a screenshot and describe it" [--out DIR] [--url ws://localhost:3000]
import WebSocket from "ws";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : dflt; };
const url = opt("--url", "ws://localhost:3000");
const out = opt("--out", "./.chat-out");
const message = args.join(" ").trim();
if (!message) { console.error("usage: chat.mjs <message> [--out DIR] [--url WS]"); process.exit(2); }
mkdirSync(out, { recursive: true });

const started = Date.now();
const ws = new WebSocket(url);
let shots = 0;
const t = () => ((Date.now() - started) / 1000).toFixed(1).padStart(5) + "s";

ws.on("open", () => {
  console.log(`[${t()}] → chat: ${message}`);
  ws.send(JSON.stringify({ action: "chat", message }));
});
ws.on("message", (raw) => {
  let m; try { m = JSON.parse(raw.toString()); } catch { return; }
  switch (m.action) {
    case "agent_text": process.stdout.write(m.text); break;
    case "agent_tool_call": console.log(`\n[${t()}] ⚙ ${m.name} ${JSON.stringify(m.input)}`); break;
    case "agent_tool_result": {
      const r = String(m.result ?? "");
      console.log(`[${t()}] ${m.is_error ? "✗" : "✓"} ${m.name}: ${r.length > 400 ? r.slice(0, 400) + ` …(${r.length} chars)` : r}`);
      break;
    }
    case "agent_screenshot": {
      const f = join(out, `shot-${++shots}.png`);
      writeFileSync(f, Buffer.from(m.png_base64, "base64"));
      console.log(`[${t()}] 📷 saved ${f} (${m.png_base64.length} b64 chars)`);
      break;
    }
    case "agent_done":
      console.log(`\n[${t()}] done · usage ${JSON.stringify(m.usage)}`);
      ws.close(); break;
    case "agent_error":
      console.log(`\n[${t()}] ERROR ${m.message}`);
      ws.close(); process.exitCode = 1; break;
    case "log": break;
    default: break;
  }
});
ws.on("error", (e) => { console.error("ws error:", e.message); process.exit(1); });
ws.on("close", () => process.exit());
setTimeout(() => { console.error("timeout after 300s"); process.exit(1); }, 300_000);
