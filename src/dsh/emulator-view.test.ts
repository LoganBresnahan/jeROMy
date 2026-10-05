import { describe, it, expect, vi } from "vitest";
import { createEmulatorViewServer, formatPickContext, pickPixel, FramePump, clickLabel } from "./emulator-view.js";
import { ClickHistory } from "./click-history.js";

function adapter(overrides: Record<string, unknown> = {}) {
  return {
    isConnected: true,
    screenshot: vi.fn().mockResolvedValue({ png_base64: Buffer.from("png").toString("base64"), paused: false }),
    getEmulatorStatus: vi.fn().mockResolvedValue({ paused: false }),
    getTileAtPixel: vi.fn().mockResolvedValue({ nametable: 0, tile_x: 16, tile_y: 27, tile_id: 182, palette_id: 1, nametable_addr: 9072, attribute_addr: 9204, scroll_x: 0, scroll_y: 0 }),
    // Precise path (ADR-0010): one vblank pair, scroll 0; nametable byte 182 at (16,27), attribute quadrant → palette 1.
    captureScrollWrites: vi.fn().mockResolvedValue({ frames: 1, stepped_frames: 0, start_frame: 0, end_frame: 1, other_register_writes: 0, final: { t: 0, v: 0, x: 0, w: false, scanline: 240, cycle: 0 }, writes: [{ frame: 0, scanline: 241, cycle: 10, reg: 5, value: 0, t: 0, v: 0, x: 0, w: false }, { frame: 0, scanline: 241, cycle: 20, reg: 5, value: 0, t: 0, v: 0, x: 0, w: true }] }),
    readMemory: vi.fn().mockImplementation(async (addr: number) => ({ address: addr, mem_type: "ppuDebug", bytes: [addr === 9072 ? 182 : addr === 9204 ? 0b00_01_00_00 : 0] })),
    getPalette: vi.fn().mockResolvedValue({ palette_id: 1, colors: [15, 54, 23, 15], background_color: 34 }),
    getPixelColor: vi.fn().mockResolvedValue({ x: 128, y: 220, argb: 0xff803e00, r: 128, g: 62, b: 0 }),
    getSprites: vi.fn().mockResolvedValue({ large_sprites: true, sprite_pattern_addr: 0, background_pattern_addr: 0x1000, sprites_enabled: true, count: 0, sprites: [] }),
    // ADR-0014: a window where only the clicked pixel's 2x2 neighbourhood is slot 2; everything else slot 1 of background palette 1.
    readRegion: vi.fn().mockImplementation(async (p: { x: number; y: number; w: number; h: number }) => {
      const n = p.w * p.h;
      const slot = Array(n).fill(1);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) slot[(220 - p.y + dy) * p.w + (128 - p.x + dx)] = 2;
      return { ...p, large_sprites: false, background_pattern_addr: 0x1000, sprite_pattern_addr: 0, layer: Array(n).fill(1), palette: Array(n).fill(1), slot, tile: Array(n).fill(0x1b6), oam: Array(n).fill(-1) };
    }),
    pauseEmulator: vi.fn().mockResolvedValue({ paused: true }),
    resumeEmulator: vi.fn().mockResolvedValue({ resumed: true }),
    stepFrame: vi.fn().mockResolvedValue({ paused: true, stepped: 1 }),
    ...overrides,
  } as any;
}

async function serve(a = adapter(), history = new ClickHistory(), mappingName: (id: number) => string | undefined = () => undefined) {
  const view = createEmulatorViewServer({ mesen: () => a, history, log: () => {} }, () => "SMB", mappingName);
  const { server } = view;
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as any).port;
  const base = `http://127.0.0.1:${port}`;
  return { server, view, base, history, a, close: () => { view.shutdown(); return Promise.resolve(); } };
}

describe("emulator view (ADR-0004)", () => {
  it("formats the pick context the model receives, with hex ids and palette colors", () => {
    const text = formatPickContext({ x: 128, y: 220, nametable: 0, tile_x: 16, tile_y: 27, tile_id: 182, palette_id: 1, nametable_addr: 9072, attribute_addr: 9204, scroll_x: 0, scroll_y: 0, scroll_source: "vblank", scroll_scanline: -1, stepped_frames: 0, scroll_ambiguous: false, palette_colors: [15, 54, 23, 15], pixel: { rgb: [128, 62, 0], nes_color: 0x17, name: "brown" } } as any);
    expect(text).toContain("Rendered color at the pixel: $17 brown (rgb 128,62,0)");
    expect(text).toContain("from vblank");
    expect(text).toContain("consistent");
    expect(text).toContain("clicked pixel (128, 220)");
    expect(text).toContain("tile_id 182 (0xB6)");
    expect(text).toContain("palette 1 [$0F $36 $17 $0F]");
    expect(text).toContain("nametable_addr 0x2370");
  });

  it("formatPickContext treats the shared backdrop as consistent with any background palette", () => {
    const text = formatPickContext({ x: 10, y: 10, nametable: 0, tile_x: 1, tile_y: 1, tile_id: 0x24, palette_id: 2, nametable_addr: 0x2021, attribute_addr: 0x23c0, scroll_x: 0, scroll_y: 0, scroll_source: "vblank", scroll_scanline: -1, stepped_frames: 0, scroll_ambiguous: false, palette_colors: [15, 48, 33, 15], backdrop: 0x22, pixel: { rgb: [146, 144, 255], nes_color: 0x22, name: "periwinkle" } } as any);
    expect(text).toContain("consistent");
  });

  it("formatPickContext warns when the rendered color is outside the readout's palette (ADR-0010)", () => {
    const text = formatPickContext({ x: 176, y: 182, nametable: 0, tile_x: 22, tile_y: 22, tile_id: 0x24, palette_id: 2, nametable_addr: 0x22d6, attribute_addr: 0x23f5, scroll_x: 53, scroll_y: 0, scroll_source: "scanline", scroll_scanline: 31, stepped_frames: 0, scroll_ambiguous: false, palette_colors: [15, 48, 33, 15], pixel: { rgb: [136, 216, 0], nes_color: 0x29, name: "lime green" } } as any);
    expect(text).toContain("$29 lime green");
    expect(text).toContain("from the write at scanline 31");
    expect(text).toContain("NOT one of the readout's palette entries");
  });

  it("pickPixel resolves tile then palette through the bridge", async () => {
    const a = adapter();
    const pick = await pickPixel(a, 128, 220);
    expect(a.captureScrollWrites).toHaveBeenCalledWith(1);
    expect(a.getTileAtPixel).not.toHaveBeenCalled();
    expect(a.getPalette).toHaveBeenCalledWith(1);
    expect(pick).toMatchObject({ tile_id: 182, palette_id: 1, scroll_source: "vblank", palette_colors: [15, 54, 23, 15] });
    // ADR-0013: the box the view draws is the background tile's screen cell; nothing is stepped.
    expect(pick.box).toEqual({ x: 128, y: 216, width: 8, height: 8 });
    expect(pick.sprite_box).toBeUndefined();
    expect(pick.stepped_frames).toBe(0);
    expect(formatPickContext(pick)).toContain("CHR tile 0x1B6 for read_tile");
    // ADR-0014: the default mode is color; the region rides along with its summary.
    expect(pick.mode).toBe("color");
    expect(pick.region).toMatchObject({ mode: "color", slot: 2, pixel_count: 4, truncated: false });
    expect(pick.region?.runs).toEqual([{ y: 220, x0: 128, x1: 129 }, { y: 221, x0: 128, x1: 129 }]);
    // One capture serves both the tile lookup and the region fill.
    expect(a.captureScrollWrites).toHaveBeenCalledTimes(1);
    expect(formatPickContext(pick)).toContain("Selected region (color mode): 4 pixels of slot 2 of background palette 1");
  });

  it("pickPixel skips the region in tile and pixel modes and survives a bridge without read_region (ADR-0014)", async () => {
    const a = adapter();
    const tile = await pickPixel(a, 128, 220, "tile");
    expect(tile.region).toBeUndefined();
    expect(a.readRegion).not.toHaveBeenCalled();
    expect(formatPickContext(tile)).not.toContain("Selected region");
    const old = adapter({ readRegion: vi.fn().mockRejectedValue(new Error("Bridge error: unknown method: read_region")) });
    const pick = await pickPixel(old, 128, 220, "object");
    expect(pick.mode).toBe("object");
    expect(pick.region).toBeUndefined();
    expect(pick.tile_id).toBe(182);
  });

  it("pickPixel names the sprite that draws the pixel and boxes its 8x8 cell (ADR-0013)", async () => {
    // Logan's 2026-10-05 click on Mario's hat at (116, 190): an 8x16 sprite at (108, 180), opaque in its top tile.
    const mario = { index: 5, x: 108, y: 180, width: 8, height: 16, tile: 0x32, attr: 0, palette: 4, behind_background: false, flip_h: false, flip_v: false, chr_tile: 0x32, chr_tile_bottom: 0x33, pixel_value: 1, opaque: true, hit_tile: 0x32, cell: { x: 108, y: 180, width: 8, height: 8 } };
    const a = adapter({
      getSprites: vi.fn().mockResolvedValue({ large_sprites: true, sprite_pattern_addr: 0, background_pattern_addr: 0x1000, sprites_enabled: true, count: 1, sprites: [mario] }),
      getPalette: vi.fn().mockImplementation(async (id: number) => id === 4 ? { palette_id: 4, colors: [0x22, 0x16, 0x27, 0x18], background_color: 0x22 } : { palette_id: id, colors: [0x22, 0x29, 0x1a, 0x0f], background_color: 0x22 }),
      getPixelColor: vi.fn().mockResolvedValue({ x: 116, y: 190, argb: 0xffb53120, r: 181, g: 49, b: 32 }),
    });
    const pick = await pickPixel(a, 116, 190);
    expect(a.getSprites).toHaveBeenCalledWith({ x: 116, y: 190 });
    expect(pick.sprite_hit?.index).toBe(5);
    expect(pick.sprite_palette_colors).toEqual([0x22, 0x16, 0x27, 0x18]);
    expect(pick.box).toEqual({ x: 108, y: 180, width: 8, height: 8 });
    expect(pick.sprite_box).toEqual({ x: 108, y: 180, width: 8, height: 16 });
    const line = formatPickContext(pick);
    expect(line).toContain("A sprite is drawn at this pixel: OAM #5 at (108, 180) 8x16, CHR tile 0x32, top half, sprite palette 4 [$22 $16 $27 $18]");
    expect(line).toContain("most likely means this sprite");
    expect(line).toContain("in that sprite palette, so the readout is consistent");
    expect(line).not.toContain("NOT one of");
  });

  it("formatPickContext treats RGB twins as the same color: SMB's HUD white is $30 in palette 2 though the pixel maps to $20", () => {
    const base = { x: 66, y: 24, nametable: 0, tile_x: 8, tile_y: 3, tile_id: 0, chr_tile: 0x100, palette_id: 2, palette_colors: [0x0f, 0x30, 0x21, 0x0f], backdrop: 0x0f, nametable_addr: 0x2068, attribute_addr: 0x23c2, scroll_x: 0, scroll_y: 0, scroll_source: "vblank" as const, scroll_scanline: -1, stepped_frames: 0, scroll_ambiguous: false, screen_box: { x: 64, y: 24, width: 8, height: 8 }, box: { x: 64, y: 24, width: 8, height: 8 }, mode: "pixel" as const, pixel: { rgb: [255, 254, 255] as [number, number, number], nes_color: 0x20, name: "white" } };
    const line = formatPickContext(base);
    expect(line).toContain("Rendered color at the pixel: $30 white");
    expect(line).toContain("so the readout is consistent");
    expect(line).not.toContain("NOT one of");
    // A sprite whose palette cannot render the sampled color is called out, not blessed.
    const hit = { index: 46, x: 109, y: 151, width: 8 as const, height: 8 as const, tile: 0x87, attr: 0x83, palette: 7, behind_background: false, flip_h: false, flip_v: true, chr_tile: 0x87, hit_tile: 0x87, opaque: true, cell: { x: 109, y: 151, width: 8, height: 8 } };
    const bad = formatPickContext({ ...base, sprite_hit: hit, sprite_palette_colors: [0x0f, 0x0f, 0x36, 0x17] });
    expect(bad).toContain("That color is NOT in that sprite palette");
    expect(bad).not.toContain("readout is consistent");
  });

  it("formatPickContext says when covering sprites are transparent at the pixel (ADR-0013)", () => {
    const base = { x: 10, y: 10, nametable: 0, tile_x: 1, tile_y: 1, tile_id: 0x24, chr_tile: 0x124, palette_id: 0, palette_colors: [0x22, 0x29, 0x1a, 0x0f], backdrop: 0x22, nametable_addr: 0x2021, attribute_addr: 0x23c0, scroll_x: 0, scroll_y: 0, scroll_source: "vblank" as const, scroll_scanline: -1, stepped_frames: 0, scroll_ambiguous: false, screen_box: { x: 8, y: 8, width: 8, height: 8 }, box: { x: 8, y: 8, width: 8, height: 8 }, pixel: { rgb: [146, 144, 255] as [number, number, number], nes_color: 0x22, name: "periwinkle" } };
    const ghost = { index: 7, x: 8, y: 8, width: 8 as const, height: 8 as const, tile: 1, attr: 0, palette: 4, behind_background: false, flip_h: false, flip_v: false, chr_tile: 1, pixel_value: 0, opaque: false };
    expect(formatPickContext({ ...base, sprites: [ghost] })).toContain("Sprite #7 covers this pixel but is transparent here; the background shows through.");
    expect(formatPickContext({ ...base, sprites: [] })).not.toContain("transparent");
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

  it("POST /pick pauses a running game, queues the click in the history checked, and keeps the mapping name (ADR-0015)", async () => {
    const s = await serve(adapter(), new ClickHistory(), (id) => (id === 182 ? "ground_brick" : undefined));
    try {
      const r = await fetch(s.base + "/pick", { method: "POST", body: JSON.stringify({ x: 128, y: 220 }) });
      const d = await r.json();
      expect(d).toMatchObject({ tile_id: 182, palette_id: 1, queued: true, click_id: 1, pause_state: "paused_by_click", mapping_name: "ground_brick" });
      expect(s.a.pauseEmulator).toHaveBeenCalledOnce();
      expect(s.a.resumeEmulator).not.toHaveBeenCalled();
      const [rec] = s.history.list();
      expect(rec).toMatchObject({ id: 1, mode: "color", x: 128, y: 220, selected: true });
      expect(rec.text).toMatch(/clicked pixel \(128, 220\).*names this tile "ground_brick"\. The click paused the emulator on this frame/);
      expect(rec.label).toBe("(128, 220) bg 0xB6 pal 1 · 4 px slot 2 · ground_brick");
      expect(rec.overlay.runs).toHaveLength(2);
      // Nothing reached an agent: the history holds it until the next prompt.
      const list = await (await fetch(s.base + "/clicks")).json();
      expect(list).toMatchObject({ rev: 1, clicks: [{ id: 1, selected: true }] });
    } finally { await s.close(); }
  });

  it("POST /pick with hold:false pauses for the readout and resumes; an already paused game is left alone", async () => {
    const s = await serve();
    try {
      const d = await (await fetch(s.base + "/pick", { method: "POST", body: JSON.stringify({ x: 10, y: 10, mode: "tile", hold: false }) })).json();
      expect(d.pause_state).toBe("resumed_after_pick");
      expect(s.a.pauseEmulator).toHaveBeenCalledOnce();
      expect(s.a.resumeEmulator).toHaveBeenCalledOnce();
      expect(s.history.list()[0].text).toMatch(/resumed; the game has moved on/);
      s.a.getEmulatorStatus.mockResolvedValue({ paused: true });
      const d2 = await (await fetch(s.base + "/pick", { method: "POST", body: JSON.stringify({ x: 10, y: 10, mode: "tile" }) })).json();
      expect(d2.pause_state).toBe("already_paused");
      expect(s.a.pauseEmulator).toHaveBeenCalledOnce();
      // The newest tile click is the checked one; the earlier tile click lost its check.
      expect(s.history.list().map((r) => [r.id, r.selected])).toEqual([[2, true], [1, false]]);
    } finally { await s.close(); }
  });

  it("the /clicks routes select, list and clear without the bridge, and the stream carries the revision", async () => {
    const h = new ClickHistory();
    const s = await serve(adapter({ isConnected: false }), h);
    try {
      h.add({ mode: "pixel", x: 1, y: 2, label: "l", text: "t", overlay: { box: { x: 0, y: 0, width: 8, height: 8 } } });
      const sel = await (await fetch(s.base + "/clicks/select", { method: "POST", body: JSON.stringify({ id: 1, selected: false }) })).json();
      expect(sel).toMatchObject({ rev: 2, clicks: [{ id: 1, selected: false }] });
      expect((await fetch(s.base + "/clicks/select", { method: "POST", body: JSON.stringify({ id: 9, selected: true }) })).status).toBe(404);
      const ctl = new AbortController();
      const res = await fetch(s.base + "/stream", { signal: ctl.signal });
      const reader = res.body!.getReader();
      const text = new TextDecoder().decode((await reader.read()).value) + new TextDecoder().decode((await reader.read()).value);
      const line = text.split("\n").find((l) => l.startsWith("data: "))!;
      expect(JSON.parse(line.slice(6))).toMatchObject({ connected: false, clicks_rev: 2 });
      ctl.abort();
      expect(await (await fetch(s.base + "/clicks/clear", { method: "POST" })).json()).toEqual({ rev: 3, clicks: [] });
    } finally { await s.close(); }
  });

  it("clickLabel names a sprite hit and the region size", () => {
    const base = { x: 5, y: 6, tile_id: 0x24, palette_id: 0, nametable: 0, tile_x: 0, tile_y: 0, nametable_addr: 0x2000, attribute_addr: 0x23c0, scroll_x: 0, scroll_y: 0, scroll_source: "vblank" as const, scroll_scanline: -1, stepped_frames: 0, scroll_ambiguous: false, screen_box: { x: 0, y: 0, width: 8, height: 8 }, box: { x: 0, y: 0, width: 8, height: 8 }, palette_colors: [0x22, 0x29, 0x1a, 0x0f], backdrop: 0x22, pixel: { rgb: [0, 0, 0] as [number, number, number], nes_color: 0x0f, name: "black" }, mode: "object" as const };
    expect(clickLabel(base)).toBe("(5, 6) bg 0x24 pal 0");
    const hit = { index: 8, x: 0, y: 0, width: 8 as const, height: 8 as const, tile: 0x43, attr: 0, palette: 4, behind_background: false, flip_h: false, flip_v: false, chr_tile: 0x43, hit_tile: 0x43, opaque: true };
    expect(clickLabel({ ...base, sprite_hit: hit, region: { mode: "object", x: 5, y: 6, layer: "sprite", palette: 4, slots: [1, 2, 3], pixel_count: 143, bbox: { x: 0, y: 0, width: 12, height: 16 }, runs: [], truncated: true, tiles: [], oam: [], window: { x: 0, y: 0, width: 64, height: 64 }, free_slots: [], summary: "" } })).toBe("(5, 6) sprite #8 CHR 0x43 pal 4 · 143 px+");
  });

  it("rejects out-of-range picks and unknown control actions without touching the bridge", async () => {
    const s = await serve();
    try {
      expect((await fetch(s.base + "/pick", { method: "POST", body: JSON.stringify({ x: 300, y: 0 }) })).status).toBe(400);
      expect((await fetch(s.base + "/pick", { method: "POST", body: JSON.stringify({ x: 1, y: 1, mode: "lasso" }) })).status).toBe(400);
      expect(s.a.getTileAtPixel).not.toHaveBeenCalled();
      expect(s.a.captureScrollWrites).not.toHaveBeenCalled();
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

  it("FramePump carries the emulator's frame counter when the bridge reports one (ADR-0007)", async () => {
    const a = adapter({ screenshot: vi.fn().mockResolvedValue({ png_base64: Buffer.from("x").toString("base64"), paused: false, frame: 4242 }) });
    const pump = new FramePump(() => a, () => undefined, () => "SMB", () => {}, 20, () => 7);
    const events: any[] = [];
    const stop = pump.subscribe((e) => events.push(e));
    await new Promise((r) => setTimeout(r, 60));
    stop();
    expect(events[0]).toMatchObject({ connected: true, emu_frame: 4242, clicks_rev: 7 });
  });

  it("FramePump pushes a PNG only when the frame changed and always carries pause state", async () => {
    const a = adapter();
    const pump = new FramePump(() => a, () => undefined, () => "SMB", () => {}, 20);
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
    const pump = new FramePump(() => adapter(), () => undefined, () => null, () => {}, 20);
    const stop = pump.subscribe(() => {});
    await new Promise((r) => setTimeout(r, 30));
    pump.stop();
    expect(pump.subscriberCount).toBe(0);
    expect(typeof stop).toBe("function");
    expect(() => pump.subscribe(() => {})).not.toThrow();
    expect(pump.subscriberCount).toBe(0);

    const dead = new FramePump(() => { throw new Error("cannot get required service \"mesen\" in inactive context"); }, () => undefined, () => null, () => {}, 20);
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
