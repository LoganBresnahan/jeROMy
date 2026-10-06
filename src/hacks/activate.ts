/**
 * Putting a hack into the emulator and taking it out (ADR-0018). Direct
 * adapter writes of ledgered bytes, never new ledger entries: the ledger is
 * the person's recorded instruction, and these functions carry it out.
 * Host-agnostic: the dsh service calls `applyOnBoot` when the bridge
 * connects, the `use_hack` tool calls `switchHack`.
 */
import type { MesenAdapter } from "../bridge/mesen/index.js";
import { ledgerDivergence } from "../agent/edit-ledger.js";
import type { EditEntry, HackStore } from "./store.js";

export interface ApplyReport {
  hack: string;
  total: number;
  applied: number[];
  /** Entries whose bytes the emulator already held. */
  already: number[];
  /** Entries the emulator holds as neither old nor new bytes: left alone. */
  conflicts: number[];
  /** True when something was applied and the emulator was reset so it shows. */
  reset: boolean;
}

/** Write every entry's new bytes. Returns the seqs written. */
export async function applyLedger(adapter: MesenAdapter, edits: EditEntry[]): Promise<number[]> {
  const done: number[] = [];
  for (const e of edits) {
    await adapter.writeMemory(e.offset, e.new, e.mem);
    done.push(e.seq);
  }
  return done;
}

/** Write every entry's old bytes back, newest first, so overlapping edits unwind in order. */
export async function revertLedger(adapter: MesenAdapter, edits: EditEntry[]): Promise<number[]> {
  const done: number[] = [];
  for (const e of [...edits].sort((a, b) => b.seq - a.seq)) {
    await adapter.writeMemory(e.offset, e.old, e.mem);
    done.push(e.seq);
  }
  return done;
}

/**
 * Apply the active hack to a freshly loaded ROM: only entries whose bytes
 * the emulator still holds as the ledger's `old` values are written. An
 * entry whose bytes match neither old nor new is a conflict (a different
 * ROM, or an edit made outside the ledger) and is reported, not touched.
 */
export async function applyOnBoot(adapter: MesenAdapter, store: HackStore, resetFrames = 30): Promise<ApplyReport> {
  const edits = store.readEdits();
  const report: ApplyReport = { hack: store.hackName, total: edits.length, applied: [], already: [], conflicts: [], reset: false };
  if (edits.length === 0) return report;
  const state = await ledgerDivergence(adapter, store, edits.length);
  for (const e of edits) {
    if (state.present.includes(e.seq)) { report.already.push(e.seq); continue; }
    const now = await adapter.readMemory(e.offset, e.length, e.mem);
    if (!now.bytes.every((b, i) => b === e.old[i])) { report.conflicts.push(e.seq); continue; }
    await adapter.writeMemory(e.offset, e.new, e.mem);
    report.applied.push(e.seq);
  }
  // The game has already copied its tables by the time the bridge connects;
  // a reset makes the applied bytes visible. Nothing applied, nothing reset,
  // so a reconnect edge never restarts a game that already carries the hack.
  if (report.applied.length) {
    await adapter.resetEmulator(resetFrames);
    report.reset = true;
  }
  return report;
}

export interface SwitchReport {
  from: string;
  to: string;
  reverted: number[];
  applied: number[];
  reset: boolean;
}

/**
 * Change the active hack: unwind the current ledger's bytes, point the store
 * at the new hack, write its ledger, and reset so the game re-reads its
 * tables. The emulator shows one game at a time; this is the workbench swap.
 */
export async function switchHack(adapter: MesenAdapter, store: HackStore, name: string, resetFrames = 30): Promise<SwitchReport> {
  const from = store.hackName;
  if (name === from) return { from, to: name, reverted: [], applied: [], reset: false };
  // Revert before moving the pointer: if a write fails midway the store still
  // names the hack whose bytes are (partly) in the emulator, so the next
  // ledgered edit records true old bytes (adr-plan review, 2026-10-05).
  const reverted = await revertLedger(adapter, store.readEdits());
  store.useHack(name);
  const applied = await applyLedger(adapter, store.readEdits());
  let reset = false;
  if (reverted.length || applied.length) {
    await adapter.resetEmulator(resetFrames);
    reset = true;
  }
  return { from, to: name, reverted, applied, reset };
}
