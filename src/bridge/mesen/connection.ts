/**
 * TCP server that accepts connections from the Mesen2 Lua bridge client.
 * The TypeScript side is the server (runs in WSL2), and the Lua script
 * in Mesen2 (Windows) connects to it — this direction works naturally
 * with WSL2's localhost forwarding.
 *
 * Handles connection lifecycle, message framing, and request/response matching.
 */

import * as net from "node:net";
import { v4 as uuid } from "uuid";
import type { BridgeRequest, BridgeResponse } from "./protocol.js";
import { isErrorResponse } from "./protocol.js";

export interface MesenConnectionOptions {
  /** Port to listen on */
  port?: number;
  /** Timeout for individual requests in ms */
  requestTimeout?: number;
}

interface PendingRequest {
  resolve: (value: BridgeResponse) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class MesenConnection {
  private server: net.Server | null = null;
  private client: net.Socket | null = null;
  private buffer = "";
  private pending = new Map<string, PendingRequest>();
  private connected = false;
  private listening = false;

  private readonly port: number;
  private readonly requestTimeout: number;

  constructor(options: MesenConnectionOptions = {}) {
    this.port = options.port ?? 9001;
    this.requestTimeout = options.requestTimeout ?? 10_000;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  /** Start the TCP server and wait for a Lua bridge client to connect. */
  async listen(): Promise<void> {
    if (this.listening) return;

    return new Promise((resolve, reject) => {
      const server = net.createServer((socket) => {
        // Only allow one client at a time
        if (this.client) {
          console.log("[Bridge] Rejecting extra client — one already connected");
          socket.destroy();
          return;
        }

        this.client = socket;
        this.connected = true;
        this.buffer = "";
        console.log("[Bridge] Mesen Lua client connected");

        socket.on("data", (data: Buffer) => {
          this.buffer += data.toString("utf-8");
          this.processBuffer();
        });

        socket.on("close", () => {
          this.connected = false;
          this.client = null;
          this.buffer = "";
          this.rejectAllPending(new Error("Lua client disconnected"));
          console.log("[Bridge] Mesen Lua client disconnected");
        });

        socket.on("error", (err: Error) => {
          console.error("[Bridge] Client socket error:", err.message);
        });
      });

      server.on("error", (err: Error) => {
        if (!this.listening) {
          reject(err);
        } else {
          console.error("[Bridge] Server error:", err.message);
        }
      });

      server.listen(this.port, "0.0.0.0", () => {
        this.server = server;
        this.listening = true;
        console.log(`[Bridge] TCP server listening on 0.0.0.0:${this.port}`);
        resolve();
      });
    });
  }

  /** Stop the TCP server and disconnect any client. */
  shutdown(): void {
    this.rejectAllPending(new Error("Server shutting down"));
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    this.connected = false;
    this.listening = false;
  }

  /**
   * Send a request to the Mesen bridge and wait for the response.
   * Throws if the bridge returns an error or the request times out.
   */
  async request<TResult>(
    method: string,
    params: Record<string, unknown> = {}
  ): Promise<TResult> {
    if (!this.connected || !this.client) {
      throw new Error("No Mesen bridge client connected");
    }

    const id = uuid();
    const msg: BridgeRequest = { id, method, params };
    const line = JSON.stringify(msg) + "\n";

    return new Promise<TResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request ${method} timed out after ${this.requestTimeout}ms`));
      }, this.requestTimeout);

      this.pending.set(id, {
        resolve: (resp) => {
          clearTimeout(timer);
          this.pending.delete(id);
          if (isErrorResponse(resp)) {
            reject(new Error(`Bridge error: ${resp.error}`));
          } else {
            resolve(resp.result as TResult);
          }
        },
        reject: (err) => {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(err);
        },
        timer,
      });

      this.client!.write(line);
    });
  }

  // -- Private -------------------------------------------------------------

  private processBuffer(): void {
    while (true) {
      const nl = this.buffer.indexOf("\n");
      if (nl === -1) break;

      const line = this.buffer.slice(0, nl);
      this.buffer = this.buffer.slice(nl + 1);

      if (line.length === 0) continue;

      try {
        const resp: BridgeResponse & { heartbeat?: boolean } = JSON.parse(line);
        // Liveness probe from the Lua client (it detects a dead peer only by
        // sending; see mesen/bridge.lua). Not a response: nothing to match.
        if (resp.heartbeat) continue;
        const pending = this.pending.get(resp.id);
        if (pending) {
          pending.resolve(resp);
        } else {
          console.warn("[Bridge] Received response for unknown request:", resp.id);
        }
      } catch (err) {
        console.error("[Bridge] Failed to parse response:", line.slice(0, 200));
      }
    }
  }

  private rejectAllPending(err: Error): void {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(err);
    }
    this.pending.clear();
  }
}
