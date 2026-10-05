/**
 * jeROMy — Server
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
import {
  JeromyDatabase,
  EventStore,
  SessionManager,
  SnapshotManager,
} from "./db/index.js";
import type {
  NewEvent,
  UserInstructionData,
  AssistantResponseData,
  ToolCallData,
  ToolResultData,
  MappingDiscoveredData,
  MappingHypothesisData,
  SpriteEditData,
} from "./db/index.js";
import {
  loadMapping,
  saveMapping,
  mergeMappings,
  type DiscoveredEntry,
} from "./mappings/index.js";

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
  model: process.env.JEROMY_MODEL,
  log: (text) => broadcastLog(text),
});
let agent: Agent; // initialized in start()

// -- Database (event-sourced session store) ---------------------------------

let db: JeromyDatabase;
let eventStore: EventStore;
let sessionManager: SessionManager;
let snapshotManager: SnapshotManager;
let activeSessionId: string | null = null;

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

      // Auto-create session if none active
      if (!activeSessionId) {
        const session = sessionManager.createSession("New Session");
        activeSessionId = session.id;
        broadcastLog(`[DB] Auto-created session ${session.id}`);
      }

      const hasImages = msg.images && msg.images.length > 0;
      broadcastLog(`[Agent] User: ${msg.message.slice(0, 80)}${msg.message.length > 80 ? "..." : ""}${hasImages ? ` (+${msg.images!.length} image${msg.images!.length > 1 ? "s" : ""})` : ""}`);

      // Record user instruction event
      eventStore.append(activeSessionId, {
        type: "user_instruction",
        data: {
          message: msg.message,
          has_images: hasImages ?? false,
          images: hasImages ? msg.images : undefined,
        },
        asset_type: null,
      } as NewEvent<"user_instruction">);

      // Track tool calls for recording tool_use_id
      let lastToolUseId: string | undefined;

      try {
        const runOptions = hasImages ? { images: msg.images } : undefined;
        for await (const event of agent.run(msg.message, runOptions)) {
          if (ws.readyState !== WebSocket.OPEN) break;

          switch (event.type) {
            case "text_delta":
              ws.send(JSON.stringify({ action: "agent_text", text: event.text }));
              break;
            case "tool_call":
              // Record tool_call event (tool_use_id comes from the agent internals;
              // we use the tool name + timestamp as a surrogate since the agent
              // doesn't expose tool_use_id in AgentEvent)
              lastToolUseId = `tu_${Date.now()}_${event.name}`;
              eventStore.append(activeSessionId!, {
                type: "tool_call",
                data: {
                  tool_use_id: lastToolUseId,
                  name: event.name,
                  input: event.input,
                },
                asset_type: null,
              } as NewEvent<"tool_call">);
              ws.send(JSON.stringify({ action: "agent_tool_call", name: event.name, input: event.input }));
              break;
            case "tool_result":
              eventStore.append(activeSessionId!, {
                type: "tool_result",
                data: {
                  tool_use_id: lastToolUseId ?? "unknown",
                  name: event.name,
                  result: event.result,
                  is_error: event.is_error,
                },
                asset_type: null,
              } as NewEvent<"tool_result">);

              // Extract domain events from tool results
              extractDomainEvents(activeSessionId!, event.name, event.result);

              ws.send(JSON.stringify({ action: "agent_tool_result", name: event.name, result: event.result, is_error: event.is_error }));
              break;
            case "screenshot":
              // Record screenshot as blob
              eventStore.append(
                activeSessionId!,
                {
                  type: "screenshot_captured",
                  data: { context: "tool_result" },
                  asset_type: null,
                } as NewEvent<"screenshot_captured">,
                Buffer.from(event.png_base64, "base64")
              );
              ws.send(JSON.stringify({ action: "agent_screenshot", png_base64: event.png_base64 }));
              break;
            case "done":
              // Record assistant response with full content blocks
              eventStore.append(activeSessionId!, {
                type: "assistant_response",
                data: {
                  text: event.text,
                  content_blocks: agent.getHistory().at(-1)?.content ?? [],
                  usage: event.usage,
                },
                asset_type: null,
              } as NewEvent<"assistant_response">);
              sessionManager.touch(activeSessionId!);
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
      // Create a new session (old one is preserved in DB)
      const session = sessionManager.createSession("New Session");
      activeSessionId = session.id;
      broadcastLog("[Agent] History cleared, new session created");
      ws.send(JSON.stringify({ action: "chat_reset", result: "ok" }));
      return;
    }

    // -- Session Management --------------------------------------------------

    if (msg.action === "session_create") {
      const name = (msg.params?.name as string) ?? "New Session";
      const metadata = msg.params?.metadata as Record<string, unknown> | undefined;
      const session = sessionManager.createSession(name, metadata);
      activeSessionId = session.id;
      agent.resetHistory();
      broadcastLog(`[DB] Created session "${session.name}" (${session.id})`);
      ws.send(JSON.stringify({ action: "session_create", result: session }));
      return;
    }

    if (msg.action === "session_list") {
      const sessions = sessionManager.listSessions();
      ws.send(JSON.stringify({ action: "session_list", result: { sessions, active_session_id: activeSessionId } }));
      return;
    }

    if (msg.action === "session_switch") {
      const id = msg.params?.id as string;
      if (!id) {
        ws.send(JSON.stringify({ action: "session_switch", error: "Missing session id" }));
        return;
      }
      const session = sessionManager.getSession(id);
      if (!session) {
        ws.send(JSON.stringify({ action: "session_switch", error: "Session not found" }));
        return;
      }
      // Rebuild agent history from DB events
      const history = sessionManager.rebuildHistory(id);
      agent.setHistory(history);
      activeSessionId = id;
      const turns = buildRichTurns(id);
      const eventCount = eventStore.getEventCount(id);
      broadcastLog(`[DB] Switched to session "${session.name}" (${id}, ${history.length} messages)`);
      ws.send(JSON.stringify({ action: "session_switch", result: { session, message_count: history.length, event_count: eventCount, turns } }));
      return;
    }

    if (msg.action === "session_fork") {
      const parentId = msg.params?.parent_id as string ?? activeSessionId;
      const forkSeq = msg.params?.fork_seq as number;
      const name = msg.params?.name as string ?? "Fork";
      if (!parentId) {
        ws.send(JSON.stringify({ action: "session_fork", error: "No active session to fork" }));
        return;
      }
      if (forkSeq == null) {
        ws.send(JSON.stringify({ action: "session_fork", error: "Missing fork_seq" }));
        return;
      }
      try {
        const child = sessionManager.forkSession(parentId, forkSeq, name);
        // Switch to the forked session
        const history = sessionManager.rebuildHistory(child.id);
        agent.setHistory(history);
        activeSessionId = child.id;
        broadcastLog(`[DB] Forked session at seq ${forkSeq} → "${child.name}" (${child.id})`);
        ws.send(JSON.stringify({ action: "session_fork", result: child }));
      } catch (err: any) {
        ws.send(JSON.stringify({ action: "session_fork", error: err.message }));
      }
      return;
    }

    if (msg.action === "session_delete") {
      const id = msg.params?.id as string;
      if (!id) {
        ws.send(JSON.stringify({ action: "session_delete", error: "Missing session id" }));
        return;
      }
      const wasActive = activeSessionId === id;
      sessionManager.deleteSession(id);
      if (wasActive) {
        activeSessionId = null;
        agent.resetHistory();
      }
      broadcastLog(`[DB] Deleted session ${id}`);
      ws.send(JSON.stringify({ action: "session_delete", result: { ok: true, was_active: wasActive } }));
      return;
    }

    if (msg.action === "session_history") {
      const id = msg.params?.id as string ?? activeSessionId;
      if (!id) {
        ws.send(JSON.stringify({ action: "session_history", error: "No session specified" }));
        return;
      }
      const afterSeq = msg.params?.after_seq as number | undefined;
      const limit = msg.params?.limit as number | undefined;
      const events = eventStore.getSessionEvents(id, afterSeq, limit);
      ws.send(JSON.stringify({ action: "session_history", result: { session_id: id, events } }));
      return;
    }

    // -- Snapshot Management -------------------------------------------------

    if (msg.action === "snapshot_create") {
      const sessionId = msg.params?.session_id as string ?? activeSessionId;
      const summary = msg.params?.summary as string ?? "Checkpoint";
      if (!sessionId) {
        ws.send(JSON.stringify({ action: "snapshot_create", error: "No session specified" }));
        return;
      }
      const snapshot = snapshotManager.createSnapshot(sessionId, summary, msg.params?.metadata as any);
      broadcastLog(`[DB] Snapshot created at seq ${snapshot.seq}`);
      ws.send(JSON.stringify({ action: "snapshot_create", result: snapshot }));
      return;
    }

    if (msg.action === "snapshot_list") {
      const sessionId = msg.params?.session_id as string ?? activeSessionId;
      if (!sessionId) {
        ws.send(JSON.stringify({ action: "snapshot_list", error: "No session specified" }));
        return;
      }
      const snapshots = snapshotManager.getSnapshots(sessionId);
      ws.send(JSON.stringify({ action: "snapshot_list", result: snapshots }));
      return;
    }

    // -- Mapping Promotion -----------------------------------------------------

    if (msg.action === "promote_mappings") {
      const sessionId = msg.params?.session_id as string ?? activeSessionId;
      if (!sessionId) {
        ws.send(JSON.stringify({ action: "promote_mappings", error: "No active session" }));
        return;
      }

      try {
        // Get ROM info for the SHA1
        let romSha1: string | undefined;
        let romName: string | undefined;
        if (mesen.isConnected) {
          const info = await mesen.getRomInfo().catch(() => null);
          romSha1 = info?.sha1;
          romName = info?.name;
        }
        if (!romSha1) {
          ws.send(JSON.stringify({ action: "promote_mappings", error: "Cannot determine ROM SHA1 — emulator not connected" }));
          return;
        }

        // Collect mapping_discovered events from the session
        const events = eventStore.getSessionEvents(sessionId);
        const discoveries: DiscoveredEntry[] = [];
        for (const event of events) {
          if (event.type === "mapping_discovered") {
            const data = event.data as MappingDiscoveredData;
            // Parse the description format: "type:id → name (notes)"
            const match = data.description.match(/^(\w+):(.+?) → (.+?)(?:\s*\((.+)\))?$/);
            if (match) {
              discoveries.push({
                mapping_type: match[1] as DiscoveredEntry["mapping_type"],
                id: match[2],
                name: match[3],
                notes: match[4],
                confidence: 1,
              });
            }
          }
        }

        if (discoveries.length === 0) {
          ws.send(JSON.stringify({ action: "promote_mappings", result: { promoted: 0, message: "No confirmed discoveries to promote" } }));
          return;
        }

        // Load existing mapping and merge
        const existing = loadMapping(romSha1);
        const merged = mergeMappings(existing, discoveries, romSha1, romName ?? "Unknown");
        saveMapping(merged);

        broadcastLog(`[DB] Promoted ${discoveries.length} discoveries to mapping file for ${romName ?? romSha1}`);
        ws.send(JSON.stringify({
          action: "promote_mappings",
          result: {
            promoted: discoveries.length,
            rom_sha1: romSha1,
            rom_name: romName,
            total_tiles: Object.keys(merged.tiles).length,
            total_addresses: Object.keys(merged.addresses).length,
          },
        }));
      } catch (err: any) {
        ws.send(JSON.stringify({ action: "promote_mappings", error: err.message }));
      }
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
        case "pause_emulator":
          result = await mesen.pauseEmulator();
          break;
        case "resume_emulator":
          result = await mesen.resumeEmulator();
          break;
        case "step_frame":
          result = await mesen.stepFrame(
            (msg.params?.count as number) ?? 1
          );
          break;
        case "get_emulator_status":
          result = await mesen.getEmulatorStatus();
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

// -- Rich History Turns (for UI session switching) --------------------------

interface ToolEntry {
  name: string;
  detail: string;
  result: string;
  isError: boolean;
}

interface RichTurn {
  role: "user" | "assistant";
  text: string;
  hasImages?: boolean;
  toolBatches?: ToolEntry[][];
  usage?: { input_tokens: number; output_tokens: number };
}

/**
 * Build structured turn data from session events for the UI to render.
 * Groups raw events into user/assistant turns with tool calls and results.
 */
function buildRichTurns(sessionId: string): RichTurn[] {
  const events = eventStore.getSessionEvents(sessionId);
  const turns: RichTurn[] = [];
  let currentAssistant: RichTurn | null = null;
  let currentBatch: ToolEntry[] | null = null;
  let lastEventWasToolResult = false;
  const toolMap = new Map<string, ToolEntry>();

  for (const event of events) {
    switch (event.type) {
      case "user_instruction": {
        if (currentAssistant) {
          turns.push(currentAssistant);
          currentAssistant = null;
        }
        const data = event.data as UserInstructionData;
        turns.push({ role: "user", text: data.message, hasImages: data.has_images });
        toolMap.clear();
        currentBatch = null;
        lastEventWasToolResult = false;
        break;
      }
      case "tool_call": {
        if (!currentAssistant) {
          currentAssistant = { role: "assistant", text: "", toolBatches: [] };
        }
        if (!currentAssistant.toolBatches) currentAssistant.toolBatches = [];

        // Start a new batch if this is the first tool call or if previous event
        // was a tool_result (meaning a new iteration started)
        if (!currentBatch || lastEventWasToolResult) {
          currentBatch = [];
          currentAssistant.toolBatches.push(currentBatch);
        }

        const data = event.data as ToolCallData;
        const detail = Object.entries(data.input)
          .slice(0, 3)
          .map(([k, v]) => {
            const val =
              typeof v === "string"
                ? v.length > 40
                  ? v.substring(0, 40) + "..."
                  : v
                : JSON.stringify(v);
            return `${k}: ${val}`;
          })
          .join(", ");
        const toolEntry: ToolEntry = { name: data.name, detail, result: "", isError: false };
        currentBatch.push(toolEntry);
        toolMap.set(data.tool_use_id, toolEntry);
        lastEventWasToolResult = false;
        break;
      }
      case "tool_result": {
        const data = event.data as ToolResultData;
        const tool = toolMap.get(data.tool_use_id);
        if (tool) {
          tool.result = data.result;
          tool.isError = data.is_error;
        }
        lastEventWasToolResult = true;
        break;
      }
      case "assistant_response": {
        if (!currentAssistant) {
          currentAssistant = { role: "assistant", text: "" };
        }
        const data = event.data as AssistantResponseData;
        currentAssistant.text = data.text;
        currentAssistant.usage = data.usage;
        turns.push(currentAssistant);
        currentAssistant = null;
        currentBatch = null;
        lastEventWasToolResult = false;
        toolMap.clear();
        break;
      }
    }
  }

  // Push any dangling assistant turn (e.g. agent errored before assistant_response)
  if (currentAssistant) {
    turns.push(currentAssistant);
  }

  return turns;
}

/**
 * Extract domain-specific events from tool results and record them in the DB.
 * For example, a write_palette tool result means a palette_edit event.
 */
function extractDomainEvents(sessionId: string, toolName: string, resultJson: string): void {
  try {
    const result = JSON.parse(resultJson);
    if (toolName === "write_palette" && result.palette_id != null) {
      eventStore.append(sessionId, {
        type: "palette_edit",
        data: {
          palette_id: result.palette_id,
          color_index: result.color_index,
          old_color: result.old_color,
          new_color: result.new_color,
        },
        asset_type: "palette",
      } as NewEvent<"palette_edit">);
    }
    if (toolName === "read_memory" && result.address != null) {
      eventStore.append(sessionId, {
        type: "memory_read",
        data: {
          address: result.address,
          length: result.bytes?.length ?? 0,
          mem_type: result.mem_type ?? "cpu",
          bytes: result.bytes ?? [],
        },
        asset_type: null,
      } as NewEvent<"memory_read">);
    }
    if (toolName === "write_tile" && result.tile_id != null) {
      eventStore.append(sessionId, {
        type: "sprite_edit",
        data: {
          tile_id: result.tile_id,
          description: `Wrote tile ${result.tile_id} to ${result.target ?? "chrRam"}`,
        } as SpriteEditData,
        asset_type: "tile",
      } as NewEvent<"sprite_edit">);
    }
    if (toolName === "record_mapping" && result.recorded) {
      const confidence = result.confidence ?? 1;
      if (confidence >= 1) {
        eventStore.append(sessionId, {
          type: "mapping_discovered",
          data: {
            address: 0,
            asset_type: result.mapping_type === "address" ? null : result.mapping_type,
            description: `${result.mapping_type}:${result.id} → ${result.name}${result.notes ? ` (${result.notes})` : ""}`,
            confirmed: true,
          } as MappingDiscoveredData,
          asset_type: result.mapping_type === "tile" ? "tile"
            : result.mapping_type === "palette" ? "palette"
            : result.mapping_type === "sprite" ? "sprite"
            : null,
        } as NewEvent<"mapping_discovered">);
      } else {
        eventStore.append(sessionId, {
          type: "mapping_hypothesis",
          data: {
            address: 0,
            asset_type: result.mapping_type === "address" ? null : result.mapping_type,
            description: `${result.mapping_type}:${result.id} → ${result.name}${result.notes ? ` (${result.notes})` : ""}`,
            confidence,
          } as MappingHypothesisData,
          asset_type: result.mapping_type === "tile" ? "tile"
            : result.mapping_type === "palette" ? "palette"
            : result.mapping_type === "sprite" ? "sprite"
            : null,
        } as NewEvent<"mapping_hypothesis">);
      }
    }
  } catch {
    // Non-JSON result or missing fields — skip domain event extraction
  }
}

async function start() {
  // 1. Initialize the database (required — fails fast if it can't init)
  db = new JeromyDatabase({ path: "./data/jeromy.db" });
  eventStore = new EventStore(db.db);
  sessionManager = new SessionManager(db.db, eventStore);
  snapshotManager = new SnapshotManager(db.db, eventStore);
  console.log("[jeROMy] Database initialized");

  // Resume most recently updated session if one exists
  const lastSession = sessionManager.getMostRecentSession();
  if (lastSession) {
    activeSessionId = lastSession.id;
    console.log(`[jeROMy] Resumed session "${lastSession.name}" (${lastSession.id})`);
  }

  // 2. Try to load the Capstone disassembler (optional)
  const disassembler = await Disassembler.init();
  if (disassembler) {
    console.log("[jeROMy] Capstone disassembler loaded");
  }

  // 3. Create the agent with all dependencies
  agent = new Agent(provider, mesen, {
    log: (text) => broadcastLog(text),
  }, disassembler);

  // If resuming a session, rebuild agent history from DB
  if (activeSessionId) {
    const history = sessionManager.rebuildHistory(activeSessionId);
    agent.setHistory(history);
    console.log(`[jeROMy] Rebuilt ${history.length} messages from session`);
  }

  // 4. Start the bridge TCP server (Lua will connect to this)
  await mesen.listen();

  // 5. Start the HTTP + WebSocket server for the browser
  httpServer.listen(HTTP_PORT, "0.0.0.0", () => {
    console.log(`[jeROMy] Web UI at http://localhost:${HTTP_PORT}`);
    console.log("[jeROMy] Waiting for Mesen2 to connect (load bridge.lua)...");
  });
}

start().catch((err) => {
  console.error("[jeROMy] Failed to start:", err);
  process.exit(1);
});
