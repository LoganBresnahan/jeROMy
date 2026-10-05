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
import { HackStore } from "../hacks/store.js";
import { ledgerDivergence, type LedgerDivergence } from "../agent/edit-ledger.js";

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
  /** Directory of sha1-*.json game mappings the user owns (promotion target); undefined = the repo's mappings/. */
  mappingsDir?: string;
  /** Read-only mappings shipped with the package, consulted when the user directory has none for the ROM (ADR-0012). */
  seedMappingsDir?: string;
  /** Root of per-ROM hack directories (ADR-0009): hacks/sha1-<sha1>/ with the edit ledger and discoveries. */
  hacksDir: string;
}

export class MesenService extends Service {
  readonly adapter: MesenAdapter;
  romInfo: RomInfoResult | null = null;
  mapping: GameMapping | null = null;
  /** Last pause state observed through the bridge; null until first contact. */
  paused: boolean | null = null;
  /**
   * Unpromoted record_mapping outcomes for the loaded ROM. Mirrored to
   * hacks/sha1-<sha1>/discoveries.json on every append so a restart does
   * not lose them (ADR-0009); the array identity is stable because tools
   * hold a closure over it.
   */
  readonly discoveries: DiscoveredEntry[] = [];
  /** Edit ledger and discoveries for the loaded ROM; null until the bridge has reported a SHA1. */
  hackStore: HackStore | null = null;
  /** Ledger vs emulator at connect time, for the prompt; null when there is no ledger. */
  ledgerStatus: LedgerDivergence | null = null;
  private readonly mappingsDir: string | undefined;
  private readonly seedMappingsDir: string | undefined;
  private readonly hacksDir: string;

  constructor(ctx: Context, config: MesenServiceConfig) {
    super(ctx, "mesen");
    this.mappingsDir = config.mappingsDir;
    this.seedMappingsDir = config.seedMappingsDir;
    this.hacksDir = config.hacksDir;
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
    // Connected is not yet identified: refresh() runs after the connect edge
    // and the ledger tools need the ROM's hack store. A headless run's first
    // call hit this gap (2026-10-05, "no hack directory" on undo_edit).
    while (!this.romInfo && this.adapter.isConnected) {
      if (signal?.aborted || Date.now() >= deadline) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return this.adapter.isConnected;
  }

  /** Track emulator state from tool outcomes so the prompt section stays honest without async work. */
  observeToolResult(name: string, result: ToolResult): void {
    if (result.type !== "text") return;
    if (name === "record_mapping") {
      const entry = discoveryFromRecordResult(result.text);
      if (entry) {
        this.discoveries.push(entry);
        try {
          this.hackStore?.writeDiscoveries(this.discoveries);
        } catch (error: unknown) {
          this.ctx.logger.warn(`mesen: could not persist discoveries: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
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
    try {
      this.hackStore?.clearDiscoveries();
    } catch (error: unknown) {
      this.ctx.logger.warn(`mesen: could not clear persisted discoveries: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Read ROM identity, load its mapping, and resume if paused: a ROM handed
   * to a running Mesen comes up paused and a paused Mesen returns empty
   * screenshots (docs/issues.md, 2026-10-05).
   */
  async refresh(): Promise<void> {
    this.romInfo = await this.adapter.getRomInfo();
    const sha1 = this.romInfo.sha1?.toLowerCase();
    this.mapping = sha1 ? (loadMapping(sha1, this.mappingsDir) ?? (this.seedMappingsDir ? loadMapping(sha1, this.seedMappingsDir) : null)) : null;
    if (this.mapping) this.ctx.logger.info(`mesen: loaded mapping for ${this.romInfo.name}`);
    // A different ROM may be loaded on reconnect: swap the hack store and
    // replace the discoveries' contents (not the array) with that ROM's file.
    this.hackStore = this.romInfo.sha1 ? new HackStore(this.hacksDir, this.romInfo.sha1) : null;
    this.discoveries.length = 0;
    if (this.hackStore) {
      try {
        this.discoveries.push(...this.hackStore.readDiscoveries());
        const edits = this.hackStore.readEdits().length;
        this.ledgerStatus = edits ? await ledgerDivergence(this.adapter, this.hackStore) : null;
        if (this.discoveries.length || edits) this.ctx.logger.info(`mesen: hack dir ${this.hackStore.dir}: ${edits} ledgered edits (${this.ledgerStatus?.missing.length ?? 0} missing from the emulator), ${this.discoveries.length} unpromoted discoveries`);
      } catch (error: unknown) {
        this.ctx.logger.warn(`mesen: could not read ${this.hackStore.dir}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const status = await this.adapter.getEmulatorStatus();
    this.paused = status.paused;
    if (status.paused) {
      await this.adapter.resumeEmulator();
      this.paused = false;
      this.ctx.logger.info("mesen: emulator was paused on connect; resumed");
    }
  }
}
