/**
 * Ledgered ROM writes (ADR-0009). Every write to PRG ROM or CHR ROM goes
 * through here so `hacks/sha1-<sha1>/edits.json` records what changed,
 * reversibly: the bytes are read before the write and read back after it,
 * so the ledger holds what the emulator actually has (no second encoder for
 * CHR tiles in TypeScript). RAM, palette RAM, CHR RAM and OAM writes are
 * volatile by definition and never pass through this module.
 */

import type { MesenAdapter } from "../bridge/mesen/index.js";
import type { EditEntry, NewEdit, RomMemory } from "../hacks/store.js";

/** What core needs from the hack store; the dsh layer supplies the instance for the loaded ROM. */
export interface EditLedger {
  appendEdit(edit: NewEdit): EditEntry;
  readEdits(): EditEntry[];
  removeEdit(seq: number): EditEntry;
  ensureDir(): void;
  /** Path of the ledger file, for tool text. */
  readonly editsFile: string;
  /** The hack directory exports land in. */
  readonly dir: string;
}

/** `C:\Users\x\rom.nes` → `/mnt/c/Users/x/rom.nes`; a path that is already POSIX is returned as is. */
export function windowsPathToWsl(p: string): string {
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(p);
  if (!m) return p;
  return `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, "/")}`;
}

export function isRomMemory(mem: string): mem is RomMemory {
  return mem === "prgRom" || mem === "chrRom";
}

export interface LedgeredOutcome {
  entry: EditEntry | null;
  /** Set when the write succeeded but the ledger could not be appended; the tool text must carry it. */
  ledgerError?: string;
}

/**
 * Perform `write` (which the caller already decided is a ROM write) between
 * a read-before and a read-back, then append to the ledger. A failed write
 * throws before anything is ledgered; a failed append is reported, not thrown,
 * because the bytes are already in the emulator.
 */
export async function ledgeredRomWrite(
  adapter: MesenAdapter,
  ledger: EditLedger | null | undefined,
  tool: string,
  mem: RomMemory,
  offset: number,
  length: number,
  write: () => Promise<unknown>,
  reason?: string,
): Promise<LedgeredOutcome> {
  if (!ledger) {
    await write();
    return { entry: null, ledgerError: "no hack directory for this ROM (bridge not connected or ROM unknown); the write is in the emulator only" };
  }
  const before = await adapter.readMemory(offset, length, mem);
  await write();
  const after = await adapter.readMemory(offset, length, mem);
  try {
    const entry = ledger.appendEdit({ tool, mem, offset, length, old: before.bytes, new: after.bytes, ...(reason ? { reason } : {}) });
    return { entry };
  } catch (err) {
    return { entry: null, ledgerError: err instanceof Error ? err.message : String(err) };
  }
}

/** One sentence for tool text about what was ledgered. */
export function describeLedger(outcome: LedgeredOutcome, ledger: EditLedger | null | undefined): string {
  if (outcome.entry) return ` Ledgered as edit #${outcome.entry.seq} in ${ledger?.editsFile ?? "the hack directory"}.`;
  return ` WARNING: not ledgered: ${outcome.ledgerError ?? "unknown reason"}.`;
}
