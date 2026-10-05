/**
 * `ctx.mesen`: the Mesen2 bridge as a Cordis service (ADR-0005). Owns the TCP
 * server the Lua client connects to, exposes the host-agnostic MesenAdapter to
 * the tools, and caches what the (synchronous) prompt section needs: ROM info,
 * the loaded game mapping, and the last known pause state. Core code under
 * src/bridge and src/mappings knows nothing about dsh.
 */
import { Service, type Context } from "@deepseek-ai/cordis";
import { MesenAdapter } from "../bridge/mesen/adapter.js";
import type { RomInfoResult } from "../bridge/mesen/protocol.js";
import { loadMapping, type DiscoveredEntry } from "../mappings/loader.js";
import type { GameMapping } from "../mappings/types.js";
import type { ToolResult } from "../agent/tools.js";
import { discoveryFromRecordResult } from "./tools/promote-mappings.js";

declare module "@deepseek-ai/cordis" {
  interface Context {
    mesen: MesenService;
  }
}

export interface MesenServiceConfig {
  /** TCP port the Lua bridge connects to. bridge.lua defaults to 9001. */
  port: number;
  /** Per-request timeout in ms for bridge calls. */
  requestTimeout: number;
  /** Directory of sha1-*.json game mappings; undefined = the repo's mappings/. */
  mappingsDir?: string;
}

export class MesenService extends Service {
  readonly adapter: MesenAdapter;
  romInfo: RomInfoResult | null = null;
  mapping: GameMapping | null = null;
  /** Last pause state observed through the bridge; null until first contact. */
  paused: boolean | null = null;
  /** record_mapping outcomes this process has seen, promoted to the mapping file by `promote_mappings`. */
  readonly discoveries: DiscoveredEntry[] = [];
  private readonly mappingsDir: string | undefined;

  constructor(ctx: Context, config: MesenServiceConfig) {
    super(ctx, "mesen");
    this.mappingsDir = config.mappingsDir;
    this.adapter = new MesenAdapter({ port: config.port, requestTimeout: config.requestTimeout });

    ctx.effect(() => {
      let stopped = false;
      void this.accept(() => stopped);
      return () => { stopped = true; this.adapter.shutdown(); };
    });
  }

  get isConnected(): boolean {
    return this.adapter.isConnected;
  }

  /**
   * Resolve once the Lua client is attached, or after `timeoutMs`. The bridge
   * reconnects on its own every ~2 s, so a tool called right after boot
   * should wait a little rather than fail on the race.
   */
  async waitForConnection(timeoutMs: number, signal?: AbortSignal): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (!this.adapter.isConnected) {
      if (signal?.aborted || Date.now() >= deadline) return this.adapter.isConnected;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return true;
  }

  /** Track emulator state from tool outcomes so the prompt section stays honest without async work. */
  observeToolResult(name: string, result: ToolResult): void {
    if (result.type !== "text") return;
    if (name === "record_mapping") {
      const entry = discoveryFromRecordResult(result.text);
      if (entry) this.discoveries.push(entry);
      return;
    }
    if (name === "pause_emulator") this.paused = true;
    else if (name === "resume_emulator") this.paused = false;
    else if (name === "step_frame" || name === "get_emulator_status" || name === "screenshot") {
      const match = /"paused":\s*(true|false)/.exec(result.text);
      if (match) this.paused = match[1] === "true";
    }
  }

  /**
   * Start the TCP server, then watch for the Lua client. `listen()` resolves
   * when the socket is listening, not when a client attaches, and the
   * connection exposes no connect event, so poll `isConnected` and run
   * `refresh()` on every false-to-true edge (first contact and reconnects).
   */
  private async accept(isStopped: () => boolean): Promise<void> {
    try {
      await this.adapter.listen();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.ctx.logger.warn(`mesen: bridge listen failed: ${message}`);
      return;
    }
    let wasConnected = false;
    while (!isStopped()) {
      const connected = this.adapter.isConnected;
      if (connected && !wasConnected) {
        this.ctx.logger.info("mesen: Lua bridge connected");
        try {
          await this.refresh();
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          this.ctx.logger.warn(`mesen: refresh after connect failed: ${message}`);
        }
      } else if (!connected && wasConnected) {
        this.paused = null;
      }
      wasConnected = connected;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  /** Name the loaded mapping gives a CHR tile id, if any. */
  mappingNameFor(tileId: number): string | undefined {
    const tile = this.mapping?.tiles[String(tileId)] ?? this.mapping?.tiles[`0x${tileId.toString(16).toUpperCase().padStart(2, "0")}`];
    return tile?.name;
  }

  /** After promote_mappings wrote the file: adopt the merged mapping and clear the ledger. */
  adoptMapping(merged: GameMapping): void {
    this.mapping = merged;
    this.discoveries.length = 0;
  }

  /**
   * Read ROM identity, load its mapping, and resume if paused: a ROM handed
   * to a running Mesen comes up paused and a paused Mesen returns empty
   * screenshots (docs/issues.md, 2026-10-05).
   */
  async refresh(): Promise<void> {
    this.romInfo = await this.adapter.getRomInfo();
    this.mapping = this.romInfo.sha1 ? loadMapping(this.romInfo.sha1.toLowerCase(), this.mappingsDir) : null;
    if (this.mapping) this.ctx.logger.info(`mesen: loaded mapping for ${this.romInfo.name}`);
    const status = await this.adapter.getEmulatorStatus();
    this.paused = status.paused;
    if (status.paused) {
      await this.adapter.resumeEmulator();
      this.paused = false;
      this.ctx.logger.info("mesen: emulator was paused on connect; resumed");
    }
  }
}
