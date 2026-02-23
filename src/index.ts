/**
 * jeROMiah — Server
 *
 * Starts an HTTP server that serves the web UI, plus a WebSocket server
 * that handles both direct emulator commands and AI agent chat.
 *
 * Architecture:
 *   TypeScript (WSL2) runs a TCP server on port 9001.
 *   Lua script in Mesen2 (Windows) connects as a TCP client.
 *   Browser connects to HTTP/WS on port 3000.
 *
 * Usage:
 *   1. Run: npm run dev
 *   2. Load bridge.lua in Mesen2 (it connects to localhost:9001)
 *   3. Open http://localhost:3000 in a browser
 */

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { MesenAdapter } from "./bridge/mesen/index.js";
import { Agent, AnthropicProvider } from "./agent/index.js";
import { Disassembler } from "./agent/disassembler.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTTP_PORT = 3000;
const BRIDGE_PORT = 9001;

// -- Mesen Bridge (TCP server — Lua connects to us) ------------------------

const mesen = new MesenAdapter({
  port: BRIDGE_PORT,
  requestTimeout: 15_000,
});

// -- Agent (LLM + tool loop) ------------------------------------------------

const provider = new AnthropicProvider({
  log: (text) => broadcastLog(text),
});
let agent: Agent; // initialized in start()

// -- HTTP Server -----------------------------------------------------------

// Resolve the dist/web directory for serving built frontend assets
const distWebDir = resolve(__dirname, "..", "dist", "web");

const httpServer = createServer((req, res) => {
  const url = req.url ?? "/";

  // Serve index.html for root
  if (url === "/" || url === "/index.html") {
    try {
      const html = readFileSync(resolve(distWebDir, "index.html"), "utf-8");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    } catch {
      // Fallback: serve from src/web if dist/web hasn't been built yet
      const html = readFileSync(resolve(__dirname, "web/index.html"), "utf-8");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    }
    return;
  }

  // Serve chat.js bundle
  if (url === "/chat.js") {
    try {
      const js = readFileSync(resolve(distWebDir, "chat.js"), "utf-8");
      res.writeHead(200, { "Content-Type": "application/javascript" });
      res.end(js);
    } catch {
      res.writeHead(404);
      res.end("chat.js not found — run npm run build:web");
    }
    return;
  }

  if (url === "/favicon.ico") {
    res.writeHead(204);
    res.end();
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

// -- WebSocket Server ------------------------------------------------------

const wss = new WebSocketServer({ server: httpServer });

// -- Unified Logging (server → browser) ------------------------------------

/**
 * Log to the server console AND broadcast to all connected browser clients.
 * The browser gateway routes these to the sidebar log panel.
 */
function broadcastLog(text: string, level: "info" | "error" | "success" = "info"): void {
  // Always log to server console
  if (level === "error") {
    console.error(text);
  } else {
    console.log(text);
  }

  // Broadcast to all connected WS clients
  const payload = JSON.stringify({
    action: "server_log",
    text,
    level,
    timestamp: new Date().toISOString(),
  });

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

wss.on("connection", (ws: WebSocket) => {
  broadcastLog("[WS] Browser connected", "success");

  ws.on("message", async (raw: Buffer) => {
    let msg: { action: string; message?: string; images?: Array<{ data: string; media_type: string }>; params?: Record<string, unknown> };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ error: "invalid JSON" }));
      return;
    }

    // -- Agent Chat ----------------------------------------------------------
    if (msg.action === "chat") {
      if (!msg.message) {
        ws.send(JSON.stringify({ action: "agent_error", message: "No message provided" }));
        return;
      }
      const hasImages = msg.images && msg.images.length > 0;
      broadcastLog(`[Agent] User: ${msg.message.slice(0, 80)}${msg.message.length > 80 ? "..." : ""}${hasImages ? ` (+${msg.images!.length} image${msg.images!.length > 1 ? "s" : ""})` : ""}`);

      try {
        const runOptions = hasImages ? { images: msg.images } : undefined;
        for await (const event of agent.run(msg.message, runOptions)) {
          if (ws.readyState !== WebSocket.OPEN) break;

          switch (event.type) {
            case "text_delta":
              ws.send(JSON.stringify({ action: "agent_text", text: event.text }));
              break;
            case "tool_call":
              // Detailed logging handled by agent.ts via log callback
              ws.send(JSON.stringify({ action: "agent_tool_call", name: event.name, input: event.input }));
              break;
            case "tool_result":
              // Detailed logging handled by agent.ts via log callback
              ws.send(JSON.stringify({ action: "agent_tool_result", name: event.name, result: event.result, is_error: event.is_error }));
              break;
            case "screenshot":
              ws.send(JSON.stringify({ action: "agent_screenshot", png_base64: event.png_base64 }));
              break;
            case "done":
              ws.send(JSON.stringify({ action: "agent_done", text: event.text, usage: event.usage }));
              break;
            case "error":
              broadcastLog(`[Agent] Error: ${event.message}`, "error");
              ws.send(JSON.stringify({ action: "agent_error", message: event.message }));
              break;
          }
        }
      } catch (err: any) {
        broadcastLog(`[Agent] Unhandled error: ${err.message}`, "error");
        ws.send(JSON.stringify({ action: "agent_error", message: err.message }));
      }
      return;
    }

    if (msg.action === "chat_abort") {
      agent.abort();
      broadcastLog("[Agent] Aborted by user");
      return;
    }

    if (msg.action === "chat_reset") {
      agent.resetHistory();
      broadcastLog("[Agent] History cleared");
      ws.send(JSON.stringify({ action: "chat_reset", result: "ok" }));
      return;
    }

    // -- Direct Emulator Commands (Phase 1 passthrough) ----------------------

    if (!mesen.isConnected) {
      ws.send(JSON.stringify({ action: msg.action, error: "Mesen bridge not connected — load bridge.lua in Mesen2" }));
      return;
    }

    try {
      let result: unknown;
      // Log non-trivial emulator commands from the browser sidebar
      if (msg.action !== "screenshot" && msg.action !== "ping") {
        broadcastLog(`[Emu] ${msg.action}${msg.params ? " " + JSON.stringify(msg.params) : ""}`);
      }

      switch (msg.action) {
        case "screenshot":
          result = await mesen.screenshot();
          break;
        case "get_tile_at_pixel":
          result = await mesen.getTileAtPixel(
            msg.params!.x as number,
            msg.params!.y as number
          );
          break;
        case "get_palette":
          result = await mesen.getPalette(msg.params!.palette_id as number);
          break;
        case "write_palette":
          result = await mesen.writePalette(
            msg.params!.palette_id as number,
            msg.params!.color_index as number,
            msg.params!.nes_color as number
          );
          break;
        case "get_all_palettes":
          result = await mesen.getAllPalettes();
          break;
        case "clear_palette_overrides":
          result = await mesen.clearPaletteOverrides(
            msg.params?.palette_id as number | undefined,
            msg.params?.color_index as number | undefined
          );
          break;
        case "get_cpu_state":
          result = await mesen.getCpuState();
          break;
        case "get_rom_info":
          result = await mesen.getRomInfo();
          break;
        case "read_memory":
          result = await mesen.readMemory(
            msg.params!.address as number,
            msg.params!.length as number | undefined,
            msg.params!.mem_type as any
          );
          break;
        case "ping":
          result = await mesen.ping();
          break;
        case "get_lua_logs":
          result = await mesen.getLuaLogs(
            (msg.params?.since as number) ?? 0
          );
          break;
        case "debug_state":
          // Pass through directly to the bridge for state inspection
          result = await mesen.rawRequest("debug_state", msg.params ?? {});
          break;
        default:
          result = { error: `unknown action: ${msg.action}` };
      }

      ws.send(JSON.stringify({ action: msg.action, result }));
    } catch (err: any) {
      ws.send(
        JSON.stringify({ action: msg.action, error: err.message })
      );
    }
  });

  ws.on("close", () => {
    broadcastLog("[WS] Browser disconnected");
  });
});

// -- Start -----------------------------------------------------------------

async function start() {
  // 1. Try to load the Capstone disassembler (optional)
  const disassembler = await Disassembler.init();
  if (disassembler) {
    console.log("[jeROMiah] Capstone disassembler loaded");
  }

  // 2. Create the agent with all dependencies
  agent = new Agent(provider, mesen, {
    log: (text) => broadcastLog(text),
  }, disassembler);

  // 3. Start the bridge TCP server (Lua will connect to this)
  await mesen.listen();

  // 4. Start the HTTP + WebSocket server for the browser
  httpServer.listen(HTTP_PORT, "0.0.0.0", () => {
    console.log(`[jeROMiah] Web UI at http://localhost:${HTTP_PORT}`);
    console.log("[jeROMiah] Waiting for Mesen2 to connect (load bridge.lua)...");
  });
}

start().catch((err) => {
  console.error("[jeROMiah] Failed to start:", err);
  process.exit(1);
});
