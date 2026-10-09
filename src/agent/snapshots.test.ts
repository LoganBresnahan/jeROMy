import { describe, it, expect, vi } from "vitest";
import { SnapshotStore, takeSnapshot, checksum, snapshotsFor, DEFAULT_SNAPSHOT, MAX_SNAPSHOTS } from "./snapshots.js";

function ramAdapter(ram: number[]) {
  return {
    readMemory: vi.fn().mockImplementation(async (addr: number, len: number, mem: string) => ({ address: addr, mem_type: mem, bytes: ram.slice(addr, addr + len) })),
  };
}

describe("differential search over RAM (ADR-0019)", () => {
  it("takeSnapshot reads the NES internal RAM by default, in chunks, and returns a checksum instead of bytes", async () => {
    const ram = Array.from({ length: 0x800 }, (_, i) => i & 0xff);
    const adapter = ramAdapter(ram);
    const store = new SnapshotStore();
    const taken = await takeSnapshot(adapter, store, "before");
    expect(taken).toMatchObject({ name: "before", address: 0, length: 0x800, mem_type: DEFAULT_SNAPSHOT.mem_type });
    expect(taken).not.toHaveProperty("bytes");
    expect(taken.checksum).toBe(checksum(ram));
    expect(adapter.readMemory).toHaveBeenCalledTimes(2);
    expect(adapter.readMemory).toHaveBeenNthCalledWith(1, 0, 0x400, "cpuDebug");
    expect(adapter.readMemory).toHaveBeenNthCalledWith(2, 0x400, 0x400, "cpuDebug");
    expect(store.get("before")?.bytes).toEqual(ram);
    await expect(takeSnapshot(adapter, store, "")).rejects.toThrow(/name is required/);
    await expect(takeSnapshot(adapter, store, "x", { length: 0 })).rejects.toThrow(/length/);
  });

  it("diff keeps the addresses that moved the way the action predicts, and narrows round by round with from", () => {
    const store = new SnapshotStore();
    const base = new Array(0x800).fill(0);
    const a = [...base]; a[0x75a] = 3; a[0x7e] = 10; a[0x10] = 5; a[0x11] = 5;
    const b = [...base]; b[0x75a] = 2; b[0x7e] = 11; b[0x10] = 5; b[0x11] = 9;
    const c = [...base]; c[0x75a] = 1; c[0x7e] = 12; c[0x10] = 7; c[0x11] = 9;
    for (const [name, bytes] of [["a", a], ["b", b], ["c", c]] as const) {
      store.put({ name, address: 0, length: 0x800, mem_type: "cpuDebug", bytes: [...bytes], taken_at: "t" });
    }
    const d1 = store.diff("a", "b", "changed", { name: "d1" });
    expect(d1.considered).toBe(0x800);
    expect(d1.hits.map((h) => h.address)).toEqual([0x11, 0x7e, 0x75a]);
    expect(d1.truncated).toBe(false);
    // Lost a life: the counter went down between b and c; 0x11 held still and 0x7e went up.
    const d2 = store.diff("b", "c", "decreased", { from: "d1", name: "d2" });
    expect(d2.considered).toBe(3);
    expect(d2.hits).toEqual([{ address: 0x75a, old: 2, new: 1 }]);
    expect(store.survivorsOf("d2")).toEqual(new Set([0x75a]));
    expect(store.diff("b", "c", "equals", { value: 1, from: "d1" }).hits).toEqual([{ address: 0x75a, old: 2, new: 1 }]);
    expect(store.diff("a", "c", "increased").hits.map((h) => h.address)).toEqual([0x10, 0x11, 0x7e]);
    expect(store.diff("a", "b", "unchanged").matched).toBe(0x800 - 3);
    expect(() => store.diff("a", "zzz", "changed")).toThrow(/no snapshot "zzz"/);
    expect(() => store.diff("a", "b", "equals")).toThrow(/needs value/);
    expect(() => store.diff("a", "b", "changed", { from: "nope" })).toThrow(/no diff named "nope"/);
  });

  it("caps the hit list at 64 but counts every survivor, and diffs only the overlap of two ranges", () => {
    const store = new SnapshotStore();
    store.put({ name: "a", address: 0, length: 0x800, mem_type: "cpuDebug", bytes: new Array(0x800).fill(0), taken_at: "t" });
    store.put({ name: "b", address: 0x100, length: 0x700, mem_type: "cpuDebug", bytes: new Array(0x700).fill(1), taken_at: "t" });
    const d = store.diff("a", "b", "changed", { name: "all" });
    expect(d.considered).toBe(0x700);
    expect(d.matched).toBe(0x700);
    expect(d.hits).toHaveLength(64);
    expect(d.hits[0]).toEqual({ address: 0x100, old: 0, new: 1 });
    expect(d.truncated).toBe(true);
    expect(store.survivorsOf("all")?.size).toBe(0x700);
    store.put({ name: "ppu", address: 0, length: 0x800, mem_type: "ppuDebug", bytes: new Array(0x800).fill(0), taken_at: "t" });
    expect(() => store.diff("a", "ppu", "changed")).toThrow(/different memories/);
  });

  it("the store is bounded, per adapter, and a name reuse replaces", async () => {
    const store = new SnapshotStore();
    for (let i = 0; i < MAX_SNAPSHOTS; i++) store.put({ name: `s${i}`, address: 0, length: 1, mem_type: "cpuDebug", bytes: [i], taken_at: "t" });
    expect(() => store.put({ name: "one-more", address: 0, length: 1, mem_type: "cpuDebug", bytes: [0], taken_at: "t" })).toThrow(/full/);
    store.put({ name: "s0", address: 0, length: 1, mem_type: "cpuDebug", bytes: [99], taken_at: "t" });
    expect(store.get("s0")?.bytes).toEqual([99]);
    expect(store.clear()).toBe(MAX_SNAPSHOTS);
    expect(store.list()).toEqual([]);
    const x = {}, y = {};
    expect(snapshotsFor(x)).toBe(snapshotsFor(x));
    expect(snapshotsFor(x)).not.toBe(snapshotsFor(y));
  });
});
