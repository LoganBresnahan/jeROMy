import { describe, it, expect, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HackStore } from "./store.js";
import { applyOnBoot, switchHack } from "./activate.js";

const SHA1 = "33d23c2f2cfa4c9efec87f7bc1321ce3ce6c89bd";

/** A fake PRG ROM the adapter reads and writes; starts clean. */
function fakeRom(bytes: Record<number, number> = {}) {
  const rom = new Map<number, number>(Object.entries(bytes).map(([k, v]) => [Number(k), v]));
  const adapter = {
    readMemory: vi.fn().mockImplementation(async (addr: number, len: number, mem: string) => ({ address: addr, mem_type: mem, bytes: Array.from({ length: len }, (_, i) => rom.get(addr + i) ?? 0) })),
    writeMemory: vi.fn().mockImplementation(async (addr: number, data: number[]) => { data.forEach((b, i) => rom.set(addr + i, b)); return { bytes_written: data.length }; }),
    resetEmulator: vi.fn().mockResolvedValue({ reset: true, frames_waited: 30, paused: false }),
  } as any;
  return { rom, adapter };
}

describe("hack activation (ADR-0018)", () => {
  it("applyOnBoot writes only the entries a clean ROM still holds as old bytes, and reports conflicts", async () => {
    const root = mkdtempSync(join(tmpdir(), "hacks-"));
    const store = HackStore.open(root, SHA1);
    store.appendEdit({ tool: "write_memory", mem: "prgRom", offset: 0xccc, length: 1, old: [0x29], new: [0x16] });
    store.appendEdit({ tool: "write_memory", mem: "prgRom", offset: 0x100, length: 2, old: [1, 2], new: [9, 9] });
    store.appendEdit({ tool: "write_memory", mem: "prgRom", offset: 0x200, length: 1, old: [5], new: [6] });
    // 0xCCC clean, 0x100 already patched, 0x200 holds a third value.
    const { rom, adapter } = fakeRom({ 0xccc: 0x29, 0x100: 9, 0x101: 9, 0x200: 7 });
    const r = await applyOnBoot(adapter, store);
    expect(r).toEqual({ hack: "default", total: 3, applied: [1], already: [2], conflicts: [3], reset: true });
    expect(rom.get(0xccc)).toBe(0x16);
    expect(rom.get(0x200)).toBe(7);
    expect(adapter.resetEmulator).toHaveBeenCalledTimes(1);
    // A reconnect with the hack already present applies nothing and never resets.
    const second = await applyOnBoot(adapter, store);
    expect(second).toMatchObject({ applied: [], already: [1, 2], conflicts: [3], reset: false });
    expect(adapter.resetEmulator).toHaveBeenCalledTimes(1);
    // Nothing to do on an empty ledger, and no reads either.
    const empty = HackStore.open(mkdtempSync(join(tmpdir(), "hacks-")), SHA1);
    const quiet = fakeRom();
    expect(await applyOnBoot(quiet.adapter, empty)).toEqual({ hack: "default", total: 0, applied: [], already: [], conflicts: [], reset: false });
    expect(quiet.adapter.readMemory).not.toHaveBeenCalled();
  });

  it("switchHack unwinds the current ledger, writes the next one, resets, and persists the choice", async () => {
    const root = mkdtempSync(join(tmpdir(), "hacks-"));
    const store = HackStore.open(root, SHA1);
    store.appendEdit({ tool: "write_memory", mem: "prgRom", offset: 0xccc, length: 1, old: [0x29], new: [0x16] });
    store.createHack("christmas", "red and green");
    const { rom, adapter } = fakeRom({ 0xccc: 0x16, 0xcd0: 0x0f });
    const r = await switchHack(adapter, store, "christmas");
    expect(r).toEqual({ from: "default", to: "christmas", reverted: [1], applied: [], reset: true });
    expect(rom.get(0xccc)).toBe(0x29);
    expect(store.hackName).toBe("christmas");
    expect(HackStore.open(root, SHA1).hackName).toBe("christmas");
    // Build up christmas, switch back: default's bytes return, christmas's go.
    store.appendEdit({ tool: "write_memory", mem: "prgRom", offset: 0xcd0, length: 1, old: [0x0f], new: [0x1a] });
    expect(rom.get(0xcd0)).toBe(0x0f);
    const back = await switchHack(adapter, store, "default");
    expect(back).toMatchObject({ from: "christmas", to: "default", reverted: [1], applied: [1], reset: true });
    expect(rom.get(0xccc)).toBe(0x16);
    expect(rom.get(0xcd0)).toBe(0x0f);
    expect(adapter.resetEmulator).toHaveBeenCalledTimes(2);
    expect(await switchHack(adapter, store, "default")).toEqual({ from: "default", to: "default", reverted: [], applied: [], reset: false });
    await expect(switchHack(adapter, store, "easter")).rejects.toThrow(/no hack "easter"/);
    expect(store.hackName).toBe("default");
  });

  it("switchHack leaves the pointer on the old hack when a revert write fails", async () => {
    const root = mkdtempSync(join(tmpdir(), "hacks-"));
    const store = HackStore.open(root, SHA1);
    store.appendEdit({ tool: "write_memory", mem: "prgRom", offset: 0xccc, length: 1, old: [0x29], new: [0x16] });
    store.createHack("christmas");
    const { adapter } = fakeRom({ 0xccc: 0x16 });
    adapter.writeMemory.mockRejectedValueOnce(new Error("bridge timeout"));
    await expect(switchHack(adapter, store, "christmas")).rejects.toThrow(/bridge timeout/);
    expect(store.hackName).toBe("default");
    expect(HackStore.open(root, SHA1).hackName).toBe("default");
  });
});
