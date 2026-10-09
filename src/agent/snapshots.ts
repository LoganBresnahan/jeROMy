/**
 * Differential search over RAM (ADR-0019): named snapshots of a memory
 * range and the diffs between them, the pure half of `find-variable`. The
 * store is per adapter and in process memory: snapshots are working state
 * of one session, never a mapping and never written back. The bytes
 * themselves stay here; only diff results reach the model.
 */
import type { MesenAdapter } from "../bridge/mesen/index.js";
import type { MemoryType } from "../bridge/mesen/protocol.js";

export interface Snapshot {
  name: string;
  address: number;
  length: number;
  mem_type: MemoryType;
  bytes: number[];
  taken_at: string;
}

export type DiffFilter = "changed" | "unchanged" | "increased" | "decreased" | "equals";
export const DIFF_FILTERS: DiffFilter[] = ["changed", "unchanged", "increased", "decreased", "equals"];

export interface DiffHit {
  address: number;
  old: number;
  new: number;
}

export interface DiffResult {
  a: string;
  b: string;
  filter: DiffFilter;
  value?: number;
  /** Addresses considered: the overlap of the two snapshots, narrowed by `from`. */
  considered: number;
  /** Survivors, before the cap. */
  matched: number;
  hits: DiffHit[];
  truncated: boolean;
}

/** NES internal RAM: the default range of a snapshot; games with battery SRAM pass `$6000`, `0x2000`. */
export const DEFAULT_SNAPSHOT = { address: 0, length: 0x800, mem_type: "cpuDebug" as MemoryType };
export const MAX_SNAPSHOT_LENGTH = 0x10000;
export const MAX_SNAPSHOTS = 64;
export const DIFF_HIT_CAP = 64;
/** The bridge reads one byte per `emu.read`; chunks keep each request well inside the watchdog. */
const READ_CHUNK = 0x400;

export class SnapshotStore {
  private readonly snapshots = new Map<string, Snapshot>();
  private readonly survivors = new Map<string, Set<number>>();

  list(): Array<Omit<Snapshot, "bytes"> & { checksum: string }> {
    return [...this.snapshots.values()].map((s) => ({ ...withoutBytes(s), checksum: checksum(s.bytes) }));
  }

  get(name: string): Snapshot | undefined {
    return this.snapshots.get(name);
  }

  put(snapshot: Snapshot): void {
    if (!this.snapshots.has(snapshot.name) && this.snapshots.size >= MAX_SNAPSHOTS) {
      throw new Error(`snapshot store is full (${MAX_SNAPSHOTS}); reuse a name to replace a snapshot`);
    }
    this.snapshots.set(snapshot.name, snapshot);
  }

  clear(): number {
    const n = this.snapshots.size;
    this.snapshots.clear();
    this.survivors.clear();
    return n;
  }

  /** Survivors of a named diff, for `from`. */
  survivorsOf(name: string): Set<number> | undefined {
    return this.survivors.get(name);
  }

  /**
   * Compare two snapshots over their overlap. `from` restricts to the
   * survivors of an earlier named diff; `name` stores this diff's survivors
   * (all of them, not the capped list) for the next round.
   */
  diff(a: string, b: string, filter: DiffFilter, opts: { value?: number; from?: string; name?: string; cap?: number } = {}): DiffResult {
    const sa = this.snapshots.get(a);
    const sb = this.snapshots.get(b);
    if (!sa) throw new Error(`no snapshot "${a}" (snapshot_memory takes one)`);
    if (!sb) throw new Error(`no snapshot "${b}" (snapshot_memory takes one)`);
    if (sa.mem_type !== sb.mem_type) throw new Error(`snapshots "${a}" (${sa.mem_type}) and "${b}" (${sb.mem_type}) are of different memories`);
    if (!DIFF_FILTERS.includes(filter)) throw new Error(`filter must be one of ${DIFF_FILTERS.join(", ")}`);
    if (filter === "equals" && typeof opts.value !== "number") throw new Error('filter "equals" needs value');
    let from: Set<number> | undefined;
    if (opts.from !== undefined) {
      from = this.survivors.get(opts.from);
      if (!from) throw new Error(`no diff named "${opts.from}" to narrow from (pass name on a diff to keep its survivors)`);
    }
    const lo = Math.max(sa.address, sb.address);
    const hi = Math.min(sa.address + sa.length, sb.address + sb.length);
    const cap = opts.cap ?? DIFF_HIT_CAP;
    const hits: DiffHit[] = [];
    const kept = new Set<number>();
    let considered = 0;
    for (let addr = lo; addr < hi; addr++) {
      if (from && !from.has(addr)) continue;
      considered++;
      const o = sa.bytes[addr - sa.address];
      const n = sb.bytes[addr - sb.address];
      if (!matches(filter, o, n, opts.value)) continue;
      kept.add(addr);
      if (hits.length < cap) hits.push({ address: addr, old: o, new: n });
    }
    if (opts.name) this.survivors.set(opts.name, kept);
    return { a, b, filter, ...(opts.value !== undefined ? { value: opts.value } : {}), considered, matched: kept.size, hits, truncated: kept.size > hits.length };
  }
}

function matches(filter: DiffFilter, o: number, n: number, value?: number): boolean {
  switch (filter) {
    case "changed": return o !== n;
    case "unchanged": return o === n;
    case "increased": return n > o;
    case "decreased": return n < o;
    case "equals": return n === value;
  }
}

function withoutBytes(s: Snapshot): Omit<Snapshot, "bytes"> {
  const { bytes: _bytes, ...rest } = s;
  return rest;
}

/** FNV-1a over the bytes, so two snapshots can be told apart without showing either. */
export function checksum(bytes: number[]): string {
  let h = 0x811c9dc5;
  for (const b of bytes) {
    h ^= b & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Read a range through the adapter in chunks and store it under `name`. */
export async function takeSnapshot(adapter: Pick<MesenAdapter, "readMemory">, store: SnapshotStore, name: string, range: { address?: number; length?: number; mem_type?: MemoryType } = {}): Promise<Omit<Snapshot, "bytes"> & { checksum: string }> {
  if (!name || !/^[A-Za-z0-9_.-]{1,32}$/.test(name)) throw new Error("name is required: letters, digits, _ . - up to 32 characters");
  const address = range.address ?? DEFAULT_SNAPSHOT.address;
  const length = range.length ?? DEFAULT_SNAPSHOT.length;
  const mem_type = range.mem_type ?? DEFAULT_SNAPSHOT.mem_type;
  if (!Number.isInteger(address) || address < 0) throw new Error("address must be a non-negative integer");
  if (!Number.isInteger(length) || length < 1 || length > MAX_SNAPSHOT_LENGTH) throw new Error(`length must be 1-${MAX_SNAPSHOT_LENGTH}`);
  const bytes: number[] = [];
  for (let off = 0; off < length; off += READ_CHUNK) {
    const r = await adapter.readMemory(address + off, Math.min(READ_CHUNK, length - off), mem_type);
    bytes.push(...r.bytes);
  }
  const snapshot: Snapshot = { name, address, length, mem_type, bytes, taken_at: new Date().toISOString() };
  store.put(snapshot);
  return { ...withoutBytes(snapshot), checksum: checksum(bytes) };
}

const stores = new WeakMap<object, SnapshotStore>();

/** One store per adapter: the session's working memory, gone when the process is. */
export function snapshotsFor(adapter: object): SnapshotStore {
  let s = stores.get(adapter);
  if (!s) {
    s = new SnapshotStore();
    stores.set(adapter, s);
  }
  return s;
}
