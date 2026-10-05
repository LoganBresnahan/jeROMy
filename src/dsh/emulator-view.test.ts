import { describe, it, expect, vi } from "vitest";
import { createEmulatorViewServer, formatPickContext, pickPixel, FramePump } from "./emulator-view.js";

function adapter(overrides: Record<string, unknown> = {}) {
  return {
    isConnected: true,
    screenshot: vi.fn().mockResolvedValue({ png_base64: Buffer.from("png").toString("base64"), paused: false }),
    getEmulatorStatus: vi.fn().mockResolvedValue({ paused: false }),
    getTileAtPixel: vi.fn().mockResolvedValue({ nametable: 0, tile_x: 16, tile_y: 27, tile_id: 182, palette_id: 1, nametable_addr: 9072, attribute_addr: 9204, scroll_x: 0, scroll_y: 0 }),
    getPalette: vi.fn().mockResolvedValue({ palette_id: 1, colors: [15, 54, 23, 15], background_color: 34 }),
    getPixelColor: vi.fn().mockResolvedValue({ x: 128, y: 220, argb: 0xff803e00, r: 128, g: 62, b: 0 }),
    pauseEmulator: vi.fn().mockResolvedValue({ paused: true }),
    resumeEmulator: vi.fn().mockResolvedValue({ resumed: true }),
    stepFrame: vi.fn().mockResolvedValue({ paused: true, stepped: 1 }),
    ...overrides,
  } as any;
}

async function serve(a = adapter(), inject = vi.fn().mockReturnValue(true), mappingName: (id: number) => string | undefined = () => undefined) {
  const view = createEmulatorViewServer({ mesen: () => a, inject, log: () => {} }, () => "SMB", mappingName);
  const { server } = view;
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as any).port;
  const base = `http://127.0.0.1:${port}`;
  return { server, view, base, inject, a, close: () => { view.shutdown(); return Promise.resolve(); } };
}

describe("emulator view (ADR-0004)", () => {
  it("formats the pick context the model receives, with hex ids and palette colors", () => {
    const text = formatPickContext({ x: 128, y: 220, nametable: 0, tile_x: 16, tile_y: 27, tile_id: 182, palette_id: 1, nametable_addr: 9072, attribute_addr: 9204, scroll_x: 0, scroll_y: 0, palette_colors: [15, 54, 23, 15], pixel: { rgb: [128, 62, 0], nes_color: 0x17, name: "brown" } } as any);
    expect(text).toContain("Rendered color at the pixel: $17 brown (rgb 128,62,0)");
    expect(text).toContain("consistent");
    expect(text).toContain("clicked pixel (128, 220)");
    expect(text).toContain("tile_id 182 (0xB6)");
    expect(text).toContain("palette 1 [$0F $36 $17 $0F]");
    expect(text).toContain("nametable_addr 0x2370");
  });

  it("formatPickContext warns when the rendered color is outside the readout's palette (ADR-0010)", () => {
    const text = formatPickContext({ x: 176, y: 182, nametable: 0, tile_x: 22, tile_y: 22, tile_id: 0x24, palette_id: 2, nametable_addr: 0x22d6, attribute_addr: 0x23f5, scroll_x: 0, scroll_y: 0, palette_colors: [15, 48, 33, 15], pixel: { rgb: [136, 216, 0], nes_color: 0x29, name: "lime green" } } as any);
    expect(text).toContain("$29 lime green");
    expect(text).toContain("NOT one of the readout's palette entries");
  });

  it("pickPixel resolves tile then palette through the bridge", async () => {
    const a = adapter();
    const pick = await pickPixel(a, 128, 220);
    expect(a.getTileAtPixel).toHaveBeenCalledWith(128, 220);
    expect(a.getPalette).toHaveBeenCalledWith(1);
    expect(pick.palette_colors).toEqual([15, 54, 23, 15]);
  });

  it("serves the page, status and a PNG", async () => {
    const s = await serve();
    try {
      expect((await fetch(s.base + "/")).headers.get("content-type")).toMatch(/text\/html/);
      expect(await (await fetch(s.base + "/status")).json()).toEqual({ connected: true, paused: false, rom: "SMB" });
      const png = await fetch(s.base + "/screenshot.png");
      expect(png.headers.get("content-type")).toBe("image/png");
      expect(Buffer.from(await png.arrayBuffer()).toString()).toBe("png");
    } finally { await s.close(); }
  });

  it("POST /pick injects the context into the agent and reports it; mapping name rides along", async () => {
    const s = await serve(adapter(), vi.fn().mockReturnValue(true), (id) => (id === 182 ? "ground_brick" : undefined));
    try {
      const r = await fetch(s.base + "/pick", { method: "POST", body: JSON.stringify({ x: 128, y: 220 }) });
      const d = await r.json();
      expect(d).toMatchObject({ tile_id: 182, palette_id: 1, injected: true, mapping_name: "ground_brick" });
      expect(s.inject).toHaveBeenCalledOnce();
      expect(s.inject.mock.calls[0][0]).toMatch(/clicked pixel \(128, 220\).*names this tile "ground_brick"/);
    } finally { await s.close(); }
  });

  it("rejects out-of-range picks and unknown control actions without touching the bridge", async () => {
    const s = await serve();
    try {
      expect((await fetch(s.base + "/pick", { method: "POST", body: JSON.stringify({ x: 300, y: 0 }) })).status).toBe(400);
      expect(s.a.getTileAtPixel).not.toHaveBeenCalled();
      expect((await fetch(s.base + "/control", { method: "POST", body: JSON.stringify({ action: "explode" }) })).status).toBe(400);
      const ok = await (await fetch(s.base + "/control", { method: "POST", body: JSON.stringify({ action: "step" }) })).json();
      expect(ok).toEqual({ paused: true, stepped: 1 });
    } finally { await s.close(); }
  });

  it("answers 503 for bridge calls while disconnected, but status still works", async () => {
    const s = await serve(adapter({ isConnected: false }));
    try {
      expect(await (await fetch(s.base + "/status")).json()).toEqual({ connected: false, paused: null, rom: "SMB" });
      expect((await fetch(s.base + "/screenshot.png")).status).toBe(503);
    } finally { await s.close(); }
  });

  it("FramePump pushes a PNG only when the frame changed and always carries pause state", async () => {
    const a = adapter();
    const pump = new FramePump(() => a, () => "SMB", () => {}, 20);
    const events: any[] = [];
    const stop = pump.subscribe((e) => events.push(e));
    // Deadline, not a fixed sleep: under full-suite load a 20 ms tick can slip.
    const deadline = Date.now() + 3000;
    while (events.length < 3 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 10));
    stop();
    expect(events.length).toBeGreaterThanOrEqual(3);
    expect(events[0]).toMatchObject({ connected: true, paused: false, rom: "SMB" });
    expect(events[0].png).toBeDefined();
    expect(events.slice(1).every((e) => e.png === undefined)).toBe(true);
    expect(pump.subscriberCount).toBe(0);
  });

  it("GET /stream is an event stream whose first event carries a frame", async () => {
    const s = await serve();
    try {
      const ctl = new AbortController();
      const r = await fetch(s.base + "/stream", { signal: ctl.signal });
      expect(r.headers.get("content-type")).toBe("text/event-stream");
      const reader = r.body!.getReader();
      let text = "";
      while (!text.includes("data: ")) text += new TextDecoder().decode((await reader.read()).value);
      const line = text.split("\n").find((l) => l.startsWith("data: "))!;
      const e = JSON.parse(line.slice(6));
      expect(e).toMatchObject({ connected: true, paused: false, rom: "SMB" });
      expect(Buffer.from(e.png, "base64").toString()).toBe("png");
      ctl.abort();
    } finally { await s.close(); }
  });

  it("stop() ends the pump even with subscribers, and a mesen() that throws (inactive scope) stops it quietly", async () => {
    const pump = new FramePump(() => adapter(), () => null, () => {}, 20);
    const stop = pump.subscribe(() => {});
    await new Promise((r) => setTimeout(r, 30));
    pump.stop();
    expect(pump.subscriberCount).toBe(0);
    expect(typeof stop).toBe("function");
    expect(() => pump.subscribe(() => {})).not.toThrow();
    expect(pump.subscriberCount).toBe(0);

    const dead = new FramePump(() => { throw new Error("cannot get required service \"mesen\" in inactive context"); }, () => null, () => {}, 20);
    const events: unknown[] = [];
    dead.subscribe((e) => events.push(e));
    const deadline = Date.now() + 3000;
    while (dead.subscriberCount > 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 10));
    expect(events).toEqual([]);
    expect(dead.subscriberCount).toBe(0);
  });

  it("shutdown() ends open event streams so the process can exit", async () => {
    const s = await serve();
    const ctl = new AbortController();
    const r = await fetch(s.base + "/stream", { signal: ctl.signal });
    const reader = r.body!.getReader();
    await reader.read();
    s.view.shutdown();
    // A frame may already be buffered; the contract is that the stream ENDS, not that the next read is empty.
    let done = false;
    const deadline = Date.now() + 3000;
    while (!done && Date.now() < deadline) done = (await reader.read().catch(() => ({ done: true }))).done === true;
    expect(done).toBe(true);
  });
});
