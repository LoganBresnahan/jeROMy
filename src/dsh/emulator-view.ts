/**
 * The emulator view (ADR-0004): one static page on loopback, opened in dsh's
 * right-sidebar Browser tab. Live screenshot, zoom, a pixel picker, and
 * pause/step/resume. A click resolves tile and palette through the bridge and
 * hands a text context to the agent via the `inject` callback, so the model
 * sees what the user pointed at on its next turn and the session log carries
 * it (model-visible means logged, ADR-0003). No dsh client bundle involved.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { nearestNesColor, nesColorName } from "../agent/nes-palette.js";
import { lookupTileAtPixel, type PreciseTileResult } from "../agent/tile-lookup.js";
import type { MesenAdapter } from "../bridge/mesen/adapter.js";

export interface EmulatorViewDeps {
  mesen: () => MesenAdapter;
  /** Deliver a model-facing context line; returns false when no agent is live. */
  inject: (text: string) => boolean;
  log: (message: string) => void;
  /** Frames per second pushed to /stream while the emulator runs (default 10, max 20). */
  fps?: number;
}

/** One pushed frame: pause state always, PNG only when the frame changed. */
export interface StreamEvent {
  connected: boolean;
  paused: boolean | null;
  rom: string | null;
  /** Base64 PNG; omitted when identical to the previous pushed frame. */
  png?: string;
  seq: number;
}

/**
 * Shared frame pump: one bridge screenshot per tick for any number of SSE
 * subscribers, so ten tabs cost the Lua side no more than one. Runs only
 * while someone is subscribed. While paused the frame cannot change, so the
 * pump slows to 1 Hz and sends state only (the codeBreak path has a 600 ms
 * budget per poll; hammering it is pointless).
 */
export class FramePump {
  private readonly subscribers = new Set<(event: StreamEvent) => void>();
  private running = false;
  private lastPng = "";
  private seq = 0;
  constructor(
    private readonly mesen: () => MesenAdapter,
    private readonly romName: () => string | null,
    private readonly log: (message: string) => void,
    private readonly intervalMs: number,
  ) {}

  private stopped = false;

  subscribe(onEvent: (event: StreamEvent) => void): () => void {
    if (this.stopped) return () => {};
    this.subscribers.add(onEvent);
    if (!this.running) void this.run();
    return () => { this.subscribers.delete(onEvent); };
  }

  get subscriberCount(): number { return this.subscribers.size; }

  /**
   * End the pump for good: the owning plugin scope is going away, so
   * `mesen()` would throw ("inactive context") on the next tick. Drops all
   * subscribers; the loop exits at its next check without touching the scope.
   */
  stop(): void {
    this.stopped = true;
    this.subscribers.clear();
  }

  private emit(event: StreamEvent): void {
    for (const fn of this.subscribers) fn(event);
  }

  private async run(): Promise<void> {
    this.running = true;
    try {
      while (!this.stopped && this.subscribers.size > 0) {
        const started = Date.now();
        let waitMs = this.intervalMs;
        let mesen: MesenAdapter;
        try {
          mesen = this.mesen();
        } catch {
          // The scope behind `mesen()` is gone (plugin unloading); stop quietly.
          this.stop();
          break;
        }
        if (!mesen.isConnected) {
          this.lastPng = "";
          this.emit({ connected: false, paused: null, rom: this.romName(), seq: ++this.seq });
          waitMs = 1000;
        } else {
          try {
            const shot = await mesen.screenshot();
            const paused = shot.paused ?? null;
            const changed = Boolean(shot.png_base64) && shot.png_base64 !== this.lastPng;
            if (changed) this.lastPng = shot.png_base64;
            this.emit({ connected: true, paused, rom: this.romName(), seq: ++this.seq, ...(changed ? { png: shot.png_base64 } : {}) });
            if (paused) waitMs = 1000;
          } catch (error: unknown) {
            this.log(`emulator-view: frame pump: ${error instanceof Error ? error.message : String(error)}`);
            waitMs = 1000;
          }
        }
        const elapsed = Date.now() - started;
        await new Promise((resolve) => setTimeout(resolve, Math.max(0, waitMs - elapsed)));
      }
    } finally {
      this.running = false;
    }
  }
}

export interface PickResult extends PreciseTileResult {
  x: number;
  y: number;
  palette_colors: number[];
  /** Universal backdrop ($3F00): what every background palette's slot 0 renders as. */
  backdrop: number;
  /** Rendered color at the pixel, mapped to the master palette (ADR-0010). */
  pixel: { rgb: [number, number, number]; nes_color: number; name: string };
  mapping_name?: string;
  injected: boolean;
}

/** The sentence the model receives for a pixel click. Stable: tests and prompts refer to it. */
export function formatPickContext(pick: Omit<PickResult, "injected">): string {
  const colors = pick.palette_colors.map((c) => `$${c.toString(16).toUpperCase().padStart(2, "0")}`).join(" ");
  const px = pick.pixel;
  const pxHex = `$${px.nes_color.toString(16).toUpperCase().padStart(2, "0")}`;
  // Slot 0 of every background palette renders the shared backdrop, so a sky
  // pixel is consistent with any palette; only a color outside both is a tell.
  const inPalette = pick.palette_colors.includes(px.nes_color) || px.nes_color === pick.backdrop;
  // The tile readout uses the scroll at request time; on split-scroll frames
  // it can be wrong while the rendered color never is (ADR-0010).
  const source = pick.scroll_source === "scanline"
    ? `scroll ${pick.scroll_x},${pick.scroll_y} from the write at scanline ${pick.scroll_scanline}`
    : pick.scroll_source === "vblank"
      ? `scroll ${pick.scroll_x},${pick.scroll_y} from vblank (no mid-frame change)`
      : `scroll ${pick.scroll_x},${pick.scroll_y} from the request-time PPU state (may be wrong on split-scroll frames)`;
  const caveat = inPalette
    ? "The rendered color is in that palette, so the readout is consistent."
    : "That color is NOT one of the readout's palette entries (a sprite over the pixel, or a scroll the capture missed); trust the color.";
  return `[emulator view] The user clicked pixel (${pick.x}, ${pick.y}): nametable ${pick.nametable} tile (${pick.tile_x}, ${pick.tile_y}), `
    + `tile_id ${pick.tile_id} (0x${pick.tile_id.toString(16).toUpperCase().padStart(2, "0")}), palette ${pick.palette_id} [${colors}], `
    + `nametable_addr 0x${pick.nametable_addr.toString(16).toUpperCase()}, attribute_addr 0x${pick.attribute_addr.toString(16).toUpperCase()}, ${source}. `
    + `Rendered color at the pixel: ${pxHex} ${px.name} (rgb ${px.rgb.join(",")}). ${caveat}`;
}

export async function pickPixel(mesen: MesenAdapter, x: number, y: number): Promise<Omit<PickResult, "injected">> {
  const tile = await lookupTileAtPixel(mesen, x, y);
  const palette = await mesen.getPalette(tile.palette_id);
  const px = await mesen.getPixelColor(x, y);
  const nes = nearestNesColor([px.r, px.g, px.b]);
  return { ...tile, x, y, palette_colors: palette.colors, backdrop: palette.background_color ?? palette.colors[0], pixel: { rgb: [px.r, px.g, px.b], nes_color: nes, name: nesColorName(nes) } };
}

const PAGE = /* html */ `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>jeROMy emulator</title>
<style>
  :root{--bg:#141418;--fg:#e8e8ec;--mut:#9a9aa6;--acc:#4D6BFE;--ok:#3fb950;--warn:#d29922}
  body{margin:0;background:var(--bg);color:var(--fg);font:13px/1.4 system-ui,sans-serif;padding:10px}
  .bar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
  button{background:#232330;color:var(--fg);border:1px solid #33334a;border-radius:6px;padding:5px 10px;cursor:pointer}
  button:hover{border-color:var(--acc)} button.on{background:var(--acc);border-color:var(--acc)}
  #status{color:var(--mut);margin-left:auto}
  #wrap{position:relative;display:inline-block;line-height:0}
  canvas{image-rendering:pixelated;display:block}
  #c{background:#000;cursor:crosshair}
  #o{position:absolute;left:0;top:0;pointer-events:none}
  #pick{color:var(--mut);margin-top:8px;white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:12px;min-height:3em}
  .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--warn);margin-right:6px}
  .dot.ok{background:var(--ok)}
</style></head><body>
<div class="bar">
  <button id="pause">Pause</button><button id="step">Step</button><button id="resume">Resume</button>
  <button id="zoom">Zoom 2x</button><button id="live" class="on">Live</button>
  <span id="status"><span class="dot" id="dot"></span><span id="stext">connecting</span></span>
</div>
<div id="wrap"><canvas id="c" width="256" height="240"></canvas><canvas id="o" width="256" height="240"></canvas></div>
<div id="pick">Click a pixel to tell the agent what you mean.</div>
<script>
const c=document.getElementById('c'),ctx=c.getContext('2d'),o=document.getElementById('o'),octx=o.getContext('2d');
let zoom=2,live=true,paused=null,es=null,fps=0,frames=0,drawing=false,pending=null;
function setZoom(z){zoom=z;for(const el of [c,o]){el.style.width=(256*z)+'px';el.style.height=(240*z)+'px'}document.getElementById('zoom').textContent='Zoom '+z+'x'}
setZoom(2);
async function api(path,body){const r=await fetch(path,{method:body?'POST':'GET',headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return r.json()}
function setStatus(ok,text){document.getElementById('dot').className='dot'+(ok?' ok':'');document.getElementById('stext').textContent=text}
// Decode off the main thread and never queue more than one frame: a slow
// decode drops frames instead of building a backlog that looks like lag.
async function draw(b64){if(drawing){pending=b64;return}drawing=true;try{const bytes=Uint8Array.from(atob(b64),ch=>ch.charCodeAt(0));const bmp=await createImageBitmap(new Blob([bytes],{type:'image/png'}));ctx.drawImage(bmp,0,0);bmp.close();frames++}catch(e){}finally{drawing=false;if(pending){const n=pending;pending=null;draw(n)}}}
function onEvent(e){const d=JSON.parse(e.data);paused=d.paused;setStatus(d.connected,d.connected?(d.rom||'connected')+(paused?' · PAUSED':' · running')+(fps?' · '+fps+' fps':''):'bridge not connected');if(d.png)draw(d.png)}
function connect(){if(es)es.close();es=new EventSource('/stream');es.onmessage=onEvent;es.onerror=()=>{setStatus(false,'stream lost, retrying');}}
setInterval(()=>{fps=frames;frames=0},1000);
c.addEventListener('click',async e=>{const r=c.getBoundingClientRect();const x=Math.floor((e.clientX-r.left)/zoom),y=Math.floor((e.clientY-r.top)/zoom);
 const p=document.getElementById('pick');p.textContent='Inspecting ('+x+', '+y+')...';
 try{const d=await api('/pick',{x,y});if(d.error){p.textContent='Error: '+d.error;return}
 p.textContent='('+x+', '+y+') → tile '+d.tile_id+' (0x'+d.tile_id.toString(16).toUpperCase().padStart(2,'0')+') at ('+d.tile_x+', '+d.tile_y+') · palette '+d.palette_id+' ['+d.palette_colors.map(v=>'$'+v.toString(16).toUpperCase().padStart(2,'0')).join(' ')+']'+(d.mapping_name?' · '+d.mapping_name:'')+'\\n'+(d.injected?'Sent to the agent for its next turn.':'No live agent to tell; start a chat first.');
 octx.clearRect(0,0,256,240);octx.strokeStyle='#4D6BFE';octx.lineWidth=1;octx.strokeRect(d.tile_x*8+0.5,d.tile_y*8+0.5,8,8);setTimeout(()=>octx.clearRect(0,0,256,240),4000)}catch(err){p.textContent='Error: '+err}});
document.getElementById('pause').onclick=()=>api('/control',{action:'pause'});
document.getElementById('resume').onclick=()=>api('/control',{action:'resume'});
document.getElementById('step').onclick=()=>api('/control',{action:'step'});
document.getElementById('zoom').onclick=()=>setZoom(zoom>=3?1:zoom+1);
document.getElementById('live').onclick=e=>{live=!live;e.target.className=live?'on':'';if(live)connect();else{es&&es.close();es=null;setStatus(true,'paused view')}};
connect();
</script></body></html>`;

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

/** Create (not yet listening) the loopback HTTP server for the view. */
/** The view server plus the hooks its owner needs to shut it down cleanly. */
export interface EmulatorViewServer {
  server: Server;
  /** Stop the frame pump and drop every open event-stream response. */
  shutdown(): void;
}

export function createEmulatorViewServer(deps: EmulatorViewDeps, romName: () => string | null, mappingName: (tileId: number) => string | undefined): EmulatorViewServer {
  const fps = Math.min(20, Math.max(1, deps.fps ?? 10));
  const pump = new FramePump(deps.mesen, romName, deps.log, Math.round(1000 / fps));
  const streams = new Set<ServerResponse>();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (req.method === "GET" && url.pathname === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        res.end(PAGE);
        return;
      }
      if (req.method === "GET" && url.pathname === "/stream") {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-store",
          connection: "keep-alive",
          "x-accel-buffering": "no",
        });
        res.write(`retry: 1000\n\n`);
        streams.add(res);
        const unsubscribe = pump.subscribe((event) => { res.write(`data: ${JSON.stringify(event)}\n\n`); });
        req.on("close", () => { unsubscribe(); streams.delete(res); });
        return;
      }
      const mesen = deps.mesen();
      if (req.method === "GET" && url.pathname === "/status") {
        let paused: boolean | null = null;
        if (mesen.isConnected) paused = (await mesen.getEmulatorStatus()).paused;
        json(res, 200, { connected: mesen.isConnected, paused, rom: romName() });
        return;
      }
      if (!mesen.isConnected) { json(res, 503, { error: "Mesen bridge not connected" }); return; }
      if (req.method === "GET" && url.pathname === "/screenshot.png") {
        const shot = await mesen.screenshot();
        if (!shot.png_base64) { json(res, 409, { error: "no frame (emulator paused)" }); return; }
        res.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" });
        res.end(Buffer.from(shot.png_base64, "base64"));
        return;
      }
      if (req.method === "POST" && url.pathname === "/pick") {
        const body = await readJson(req);
        const x = Number(body.x), y = Number(body.y);
        if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > 255 || y < 0 || y > 239) {
          json(res, 400, { error: "x must be 0-255 and y 0-239" }); return;
        }
        const pick = await pickPixel(mesen, x, y);
        const name = mappingName(pick.tile_id);
        const withName = name ? { ...pick, mapping_name: name } : pick;
        const injected = deps.inject(formatPickContext(withName) + (name ? ` Mapping names this tile "${name}".` : ""));
        json(res, 200, { ...withName, injected } satisfies PickResult);
        return;
      }
      if (req.method === "POST" && url.pathname === "/control") {
        const body = await readJson(req);
        const action = body.action;
        const result = action === "pause" ? await mesen.pauseEmulator()
          : action === "resume" ? await mesen.resumeEmulator()
          : action === "step" ? await mesen.stepFrame(1)
          : null;
        if (result === null) { json(res, 400, { error: "action must be pause, resume or step" }); return; }
        json(res, 200, result);
        return;
      }
      json(res, 404, { error: "not found" });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      deps.log(`emulator-view: ${req.method} ${url.pathname} failed: ${message}`);
      json(res, 500, { error: message });
    }
  });
  return {
    server,
    shutdown() {
      pump.stop();
      for (const res of streams) res.end();
      streams.clear();
      server.closeAllConnections();
      server.close();
    },
  };
}
