/**
 * The emulator view (ADR-0004): one static page on loopback, opened in dsh's
 * right-sidebar Browser tab. Live screenshot, zoom, a pixel picker with four
 * selection modes (ADR-0014), and pause/step/resume. A click pauses the game,
 * resolves tile, sprite and region through the bridge, and becomes a record
 * in the click history (ADR-0015); the records the person leaves checked go
 * to the model with their next prompt, as logged messages (model-visible
 * means logged, ADR-0003). No dsh client bundle involved.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { nearestNesColor, nesColorName, paletteEntryFor, sameNesRgb } from "../agent/nes-palette.js";
import { lookupTileAtPixel, type PreciseTileResult, type ScreenBox } from "../agent/tile-lookup.js";
import { getRegionAt, REGION_MODES, type RegionMode, type RegionResult } from "../agent/region.js";
import type { MesenAdapter } from "../bridge/mesen/adapter.js";
import type { ScrollCaptureResult } from "../bridge/mesen/protocol.js";
import type { ClickHistory, ClickRecord } from "./click-history.js";

export interface EmulatorViewDeps {
  mesen: () => MesenAdapter;
  /** Where clicks wait for the next prompt (ADR-0015). */
  history: ClickHistory;
  log: (message: string) => void;
  /** Frames per second pushed to /stream while the emulator runs (default 10, max 60; ADR-0007 measurements decide the default). */
  fps?: number;
  /** The bridge.lua path as Mesen needs it, shown while the bridge is not connected (ADR-0012). */
  luaScript?: string;
}

/** One pushed frame: pause state always, PNG only when the frame changed. */
export interface StreamEvent {
  connected: boolean;
  paused: boolean | null;
  rom: string | null;
  /** Base64 PNG; omitted when identical to the previous pushed frame. */
  png?: string;
  seq: number;
  /** Setup hint (the Lua script path) while disconnected. */
  hint?: string;
  /** Click-history revision, so the page refetches the list only when it changed (ADR-0015). */
  clicks_rev: number;
  /** The emulator's frame counter at the shot, so the page can show emulation fps beside view fps (ADR-0007). */
  emu_frame?: number;
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
    private readonly hint: () => string | undefined,
    private readonly romName: () => string | null,
    private readonly log: (message: string) => void,
    private readonly intervalMs: number,
    private readonly clicksRev: () => number = () => 0,
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
          this.emit({ connected: false, paused: null, rom: this.romName(), seq: ++this.seq, clicks_rev: this.clicksRev(), ...(this.hint() ? { hint: this.hint() } : {}) });
          waitMs = 1000;
        } else {
          try {
            const shot = await mesen.screenshot();
            const paused = shot.paused ?? null;
            const changed = Boolean(shot.png_base64) && shot.png_base64 !== this.lastPng;
            if (changed) this.lastPng = shot.png_base64;
            this.emit({ connected: true, paused, rom: this.romName(), seq: ++this.seq, clicks_rev: this.clicksRev(), ...(shot.frame !== undefined ? { emu_frame: shot.frame } : {}), ...(changed ? { png: shot.png_base64 } : {}) });
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
  /** The four entries of sprite_hit's palette, when a sprite draws this pixel (ADR-0013). */
  sprite_palette_colors?: number[];
  /** What the view outlines: the sprite's 8x8 cell when a sprite draws the pixel, else the background tile's screen cell. */
  box: ScreenBox;
  /** The whole sprite (8x8 or 8x16) when a sprite draws the pixel. */
  sprite_box?: ScreenBox;
  /** Selection mode the click was made in (ADR-0014); color is the view's default. */
  mode: RegionMode;
  /** The slot/object region in color and object modes; absent in pixel and tile modes or on an older bridge. */
  region?: RegionResult;
  mapping_name?: string;
  /** The history record this click became; checked for the next prompt by default (ADR-0015). */
  click_id: number;
  queued: boolean;
  /** What the click did to the emulator: paused it, found it paused, or paused and resumed it. */
  pause_state: PauseState;
}

export type PauseState = "paused_by_click" | "already_paused" | "resumed_after_pick";

/** The sentence about the emulator's state that ends every click line. */
export function pauseSentence(state: PauseState): string {
  return state === "paused_by_click" ? "The click paused the emulator on this frame; it stays paused until the user resumes."
    : state === "already_paused" ? "The emulator is paused on this frame."
    : "The emulator was paused for the readout and resumed; the game has moved on since.";
}

/** One line for the history list: where, what, and how much (ADR-0015). */
export function clickLabel(pick: Omit<PickResult, "click_id" | "queued" | "pause_state">): string {
  const hit = pick.sprite_hit;
  const what = hit ? `sprite #${hit.index} CHR ${hex2(hit.hit_tile ?? hit.chr_tile)} pal ${hit.palette}` : `bg ${hex2(pick.tile_id)} pal ${pick.palette_id}`;
  const region = pick.region ? ` · ${pick.region.pixel_count} px${pick.region.slot !== undefined ? ` slot ${pick.region.slot}` : ""}${pick.region.truncated ? "+" : ""}` : "";
  return `(${pick.x}, ${pick.y}) ${what}${region}${pick.mapping_name ? ` · ${pick.mapping_name}` : ""}`;
}

const hex2 = (n: number): string => `0x${n.toString(16).toUpperCase().padStart(2, "0")}`;
const dollars = (colors: number[]): string => colors.map((c) => `$${c.toString(16).toUpperCase().padStart(2, "0")}`).join(" ");

/** The sentence the model receives for a pixel click. Stable: tests and prompts refer to it. */
export function formatPickContext(pick: Omit<PickResult, "click_id" | "queued" | "pause_state">): string {
  const px = pick.pixel;
  // White and black exist more than once in the master palette: name the
  // pixel by the entry the governing palette actually stores when one
  // renders the same RGB ($30, not $20, for SMB's HUD white).
  const governing = pick.sprite_hit && pick.sprite_palette_colors ? pick.sprite_palette_colors : pick.palette_colors;
  const shownIndex = paletteEntryFor(px.nes_color, governing) ?? (sameNesRgb(px.nes_color, pick.backdrop) ? pick.backdrop : px.nes_color);
  const pxHex = `$${shownIndex.toString(16).toUpperCase().padStart(2, "0")}`;
  // The tile readout uses the scroll at request time; on split-scroll frames
  // it can be wrong while the rendered color never is (ADR-0010).
  const source = pick.scroll_source === "scanline"
    ? `scroll ${pick.scroll_x},${pick.scroll_y} from the write at scanline ${pick.scroll_scanline}`
    : pick.scroll_source === "vblank"
      ? `scroll ${pick.scroll_x},${pick.scroll_y} from vblank (no mid-frame change)`
      : `scroll ${pick.scroll_x},${pick.scroll_y} from the request-time PPU state (may be wrong on split-scroll frames)`;
  const chr = pick.chr_tile !== undefined && pick.chr_tile !== pick.tile_id ? `; CHR tile ${hex2(pick.chr_tile)} for read_tile` : "";
  const head = `[emulator view] The user clicked pixel (${pick.x}, ${pick.y}): nametable ${pick.nametable} tile (${pick.tile_x}, ${pick.tile_y}), `
    + `tile_id ${pick.tile_id} (${hex2(pick.tile_id)}${chr}), palette ${pick.palette_id} [${dollars(pick.palette_colors)}], `
    + `nametable_addr 0x${pick.nametable_addr.toString(16).toUpperCase()}, attribute_addr 0x${pick.attribute_addr.toString(16).toUpperCase()}, ${source}. `
    + `Rendered color at the pixel: ${pxHex} ${px.name} (rgb ${px.rgb.join(",")}). `;

  const region = pick.region ? ` ${pick.region.summary}` : "";
  const hit = pick.sprite_hit;
  if (hit) {
    // A sprite drawing an opaque pixel here is what the person pointed at; the
    // background tile is merely what lies under it (ADR-0013).
    const half = hit.height === 16 && hit.hit_tile !== undefined ? (hit.hit_tile === hit.chr_tile ? ", top half" : ", bottom half") : "";
    const flips = [hit.flip_h ? "flipped horizontally" : "", hit.flip_v ? "flipped vertically" : "", hit.behind_background ? "behind the background" : ""].filter(Boolean);
    const spal = pick.sprite_palette_colors ? ` [${dollars(pick.sprite_palette_colors)}]` : "";
    const consistent = !pick.sprite_palette_colors ? ""
      : paletteEntryFor(px.nes_color, pick.sprite_palette_colors) !== undefined
        ? " The rendered color is in that sprite palette, so the readout is consistent."
        : " That color is NOT in that sprite palette (another sprite or the background wins at this pixel, or the frame moved between reads); trust the color.";
    return head
      + `A sprite is drawn at this pixel: OAM #${hit.index} at (${hit.x}, ${hit.y}) ${hit.width}x${hit.height}, `
      + `CHR tile ${hex2(hit.hit_tile ?? hit.chr_tile)}${half}, sprite palette ${hit.palette}${spal}${flips.length ? ", " + flips.join(", ") : ""}. `
      + `The click most likely means this sprite, not the background tile under it.${consistent}${region}`;
  }
  // Slot 0 of every background palette renders the shared backdrop, so a sky
  // pixel is consistent with any palette; only a color outside both is a tell.
  const inPalette = paletteEntryFor(px.nes_color, pick.palette_colors) !== undefined || sameNesRgb(px.nes_color, pick.backdrop);
  const covering = (pick.sprites ?? []).map((s) => `#${s.index}`);
  const transparent = covering.length ? ` Sprite${covering.length > 1 ? "s" : ""} ${covering.join(", ")} cover${covering.length > 1 ? "" : "s"} this pixel but ${covering.length > 1 ? "are" : "is"} transparent here; the background shows through.` : "";
  const caveat = inPalette
    ? "The rendered color is in that palette, so the readout is consistent."
    : pick.sprites
      ? "That color is NOT one of the readout's palette entries and no sprite is opaque here (a scroll the capture missed, or the frame moved); trust the color."
      : "That color is NOT one of the readout's palette entries (a sprite over the pixel, or a scroll the capture missed); trust the color.";
  return head + caveat + transparent + region;
}

export async function pickPixel(mesen: MesenAdapter, x: number, y: number, mode: RegionMode = "color"): Promise<Omit<PickResult, "click_id" | "queued" | "pause_state">> {
  // One scroll capture serves the tile lookup and the region fill (ADR-0014); an older bridge falls back inside the lookup.
  let capture: ScrollCaptureResult | undefined;
  try { capture = await mesen.captureScrollWrites(1); } catch { capture = undefined; }
  const tile = await lookupTileAtPixel(mesen, x, y, capture ? { capture } : {});
  const palette = await mesen.getPalette(tile.palette_id);
  const px = await mesen.getPixelColor(x, y);
  const nes = nearestNesColor([px.r, px.g, px.b]);
  const hit = tile.sprite_hit;
  const spritePalette = hit ? await mesen.getPalette(hit.palette) : undefined;
  let region: RegionResult | undefined;
  if (mode === "color" || mode === "object") {
    try {
      region = await getRegionAt(mesen, x, y, mode, capture);
    } catch {
      // An older bridge.lua without read_region: the pick still answers with tile and sprite.
      region = undefined;
    }
  }
  return {
    ...tile,
    x,
    y,
    mode,
    ...(region ? { region } : {}),
    palette_colors: palette.colors,
    backdrop: palette.background_color ?? palette.colors[0],
    pixel: { rgb: [px.r, px.g, px.b], nes_color: nes, name: nesColorName(nes) },
    ...(spritePalette ? { sprite_palette_colors: spritePalette.colors } : {}),
    box: hit?.cell ?? tile.screen_box,
    ...(hit ? { sprite_box: { x: hit.x, y: hit.y, width: hit.width, height: hit.height } } : {}),
  };
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
  .chk{color:var(--mut);display:flex;align-items:center;gap:4px;margin-left:8px}
  #hist{margin-top:6px}
  .hsec{margin-top:6px}
  .htitle{color:var(--mut);font-size:11px;text-transform:uppercase;letter-spacing:.04em}
  .hrow{display:flex;gap:6px;align-items:center;font:12px ui-monospace,monospace;cursor:pointer;line-height:1.6}
  .hrow.sent{opacity:.55}
  .hrow .sel{color:var(--acc)}
</style></head><body>
<div class="bar">
  <button id="pause">Pause</button><button id="step">Step</button><button id="resume">Resume</button>
  <button id="zoom">Zoom 2x</button><button id="live" class="on">Live</button>
  <span id="status"><span class="dot" id="dot"></span><span id="stext">connecting</span></span>
</div>
<div class="bar" id="modes" title="What a click selects (ADR-0014)">
  <span style="color:var(--mut)">Select:</span>
  <button class="mode" data-mode="pixel" title="What is drawn at this pixel">Pixel</button>
  <button class="mode" data-mode="tile" title="The 8x8 tile cell (the editing unit)">Tile</button>
  <button class="mode on" data-mode="color" title="Connected pixels of the same palette slot (a hat, a button, a pipe rim)">Color</button>
  <button class="mode" data-mode="object" title="Connected opaque pixels of the same palette (all of Mario, the whole pipe)">Object</button>
  <label class="chk" title="A pick is one frame only if the game holds still; off = pause for the readout, then resume"><input type="checkbox" id="hold" checked> Pause on click</label>
</div>
<div id="wrap"><canvas id="c" width="256" height="240"></canvas><canvas id="o" width="256" height="240"></canvas></div>
<div id="pick">Click a pixel to tell the agent what you mean. Checked clicks go with your next prompt.</div>
<div id="hist"></div>
<script>
const c=document.getElementById('c'),ctx=c.getContext('2d'),o=document.getElementById('o'),octx=o.getContext('2d');
let zoom=2,live=true,paused=null,es=null,fps=0,frames=0,drawing=false,pending=null,mode='color',emuFrame=null,emuFrameAt=0,emuFps=0;
for(const b of document.querySelectorAll('button.mode'))b.onclick=()=>{mode=b.dataset.mode;for(const o of document.querySelectorAll('button.mode'))o.className='mode'+(o===b?' on':'')};
function setZoom(z){zoom=z;for(const el of [c,o]){el.style.width=(256*z)+'px';el.style.height=(240*z)+'px'}document.getElementById('zoom').textContent='Zoom '+z+'x'}
setZoom(2);
async function api(path,body){const r=await fetch(path,{method:body?'POST':'GET',headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return r.json()}
function setStatus(ok,text){document.getElementById('dot').className='dot'+(ok?' ok':'');document.getElementById('stext').textContent=text}
// Decode off the main thread and never queue more than one frame: a slow
// decode drops frames instead of building a backlog that looks like lag.
async function draw(b64){if(drawing){pending=b64;return}drawing=true;try{const bytes=Uint8Array.from(atob(b64),ch=>ch.charCodeAt(0));const bmp=await createImageBitmap(new Blob([bytes],{type:'image/png'}));ctx.drawImage(bmp,0,0);bmp.close();frames++}catch(e){}finally{drawing=false;if(pending){const n=pending;pending=null;draw(n)}}}
function onEvent(e){const d=JSON.parse(e.data);paused=d.paused;if(d.clicks_rev!==undefined&&d.clicks_rev!==clicksRev)loadClicks();
 // Emulation speed from the bridge's frame counter, independent of how many frames the view manages to show.
 if(d.emu_frame!==undefined){const now=performance.now();if(emuFrame!==null&&now-emuFrameAt>=1000){emuFps=Math.round((d.emu_frame-emuFrame)*1000/(now-emuFrameAt));emuFrame=d.emu_frame;emuFrameAt=now}else if(emuFrame===null){emuFrame=d.emu_frame;emuFrameAt=now}}
 setStatus(d.connected,d.connected?(d.rom||'connected')+(paused?' · PAUSED':' · running')+(fps?' · view '+fps+' fps':'')+(emuFps&&!paused?' · emu '+emuFps+' fps':''):'bridge not connected'+(d.hint?' — in Mesen2: Tools › Script Window › Open '+d.hint+' › Run (allow network and I/O, timeout 1 s)':''));if(d.png)draw(d.png)}
function connect(){if(es)es.close();es=new EventSource('/stream');es.onmessage=onEvent;es.onerror=()=>{setStatus(false,'stream lost, retrying');}}
setInterval(()=>{fps=frames;frames=0},1000);
c.addEventListener('click',async e=>{const r=c.getBoundingClientRect();const x=Math.floor((e.clientX-r.left)/zoom),y=Math.floor((e.clientY-r.top)/zoom);
 const p=document.getElementById('pick');p.textContent='Inspecting ('+x+', '+y+')...';
 try{const d=await api('/pick',{x,y,mode,hold:document.getElementById('hold').checked});if(d.error){p.textContent='Error: '+d.error;return}
 const h2=v=>'0x'+v.toString(16).toUpperCase().padStart(2,'0'),pal=a=>'['+a.map(v=>'$'+v.toString(16).toUpperCase().padStart(2,'0')).join(' ')+']';
 const s=d.sprite_hit;
 const bg='bg tile '+h2(d.tile_id)+(d.chr_tile!==undefined&&d.chr_tile!==d.tile_id?' (CHR '+h2(d.chr_tile)+')':'')+' · palette '+d.palette_id+' '+pal(d.palette_colors)+(d.mapping_name?' · '+d.mapping_name:'');
 const what=(s?'sprite #'+s.index+' CHR tile '+h2(s.hit_tile!==undefined?s.hit_tile:s.chr_tile)+' · palette '+s.palette+(d.sprite_palette_colors?' '+pal(d.sprite_palette_colors):'')+' · over '+bg:bg);
 const pauseNote=d.pause_state==='paused_by_click'?' Paused on this frame.':d.pause_state==='resumed_after_pick'?' Readout taken paused, game resumed.':'';
 p.textContent='('+x+', '+y+') → '+what+(d.region?'\\n'+d.region.summary:'')+'\\nQueued for your next prompt (checked below).'+pauseNote;
 drawOverlay({box:d.box||{x:d.tile_x*8,y:d.tile_y*8,width:8,height:8},sprite_box:d.sprite_box,runs:d.region&&d.region.runs});
 }catch(err){p.textContent='Error: '+err}});
// Overlay is screen-space and stays until the next click (ADR-0014): the region tinted with a solid halo
// one pixel outside it, the tile cell dashed; without a region the cell is the solid box (ADR-0013).
function drawOverlay(o){octx.clearRect(0,0,256,240);octx.lineWidth=1;
 if(o.sprite_box){octx.setLineDash([2,2]);octx.strokeStyle='#9a9aa6';octx.strokeRect(o.sprite_box.x+0.5,o.sprite_box.y+0.5,o.sprite_box.width,o.sprite_box.height);octx.setLineDash([])}
 const b=o.box;
 if(o.runs&&o.runs.length){
  octx.setLineDash([1,1]);octx.strokeStyle='#9a9aa6';octx.strokeRect(b.x+0.5,b.y+0.5,b.width,b.height);octx.setLineDash([]);
  const on=new Set();for(const r of o.runs)for(let i=r.x0;i<=r.x1;i++)on.add(r.y*256+i);
  octx.fillStyle='#4D6BFE';for(const k of on){const px=k%256,py=(k-px)/256;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=px+dx,ny=py+dy;if(nx<0||ny<0||nx>255||ny>239)continue;if(!on.has(ny*256+nx))octx.fillRect(nx,ny,1,1)}}
  octx.fillStyle='rgba(77,107,254,0.45)';for(const r of o.runs)octx.fillRect(r.x0,r.y,r.x1-r.x0+1,1);
 }else{octx.strokeStyle='#4D6BFE';octx.strokeRect(b.x+0.5,b.y+0.5,b.width,b.height)}}
// Click history (ADR-0015): newest first per mode, a. b. c.; the checkbox decides what goes with the next prompt;
// clicking a row's text redraws its highlight. Refetched only when the stream's clicks_rev changes.
let clicksRev=-1;
async function loadClicks(){try{const d=await api('/clicks');clicksRev=d.rev;renderClicks(d.clicks)}catch(e){}}
function renderClicks(cs){const h=document.getElementById('hist');h.innerHTML='';
 for(const m of ['pixel','tile','color','object']){const rows=cs.filter(c=>c.mode===m);if(!rows.length)continue;
  const sec=document.createElement('div');sec.className='hsec';const t=document.createElement('div');t.className='htitle';t.textContent=m;sec.appendChild(t);
  rows.forEach((c,i)=>{const row=document.createElement('div');row.className='hrow'+(c.sent_turn?' sent':'');
   const cb=document.createElement('input');cb.type='checkbox';cb.checked=c.selected;cb.title='Send with the next prompt';cb.onchange=()=>api('/clicks/select',{id:c.id,selected:cb.checked}).then(loadClicks);
   const lab=document.createElement('span');lab.textContent=String.fromCharCode(97+i)+'. '+c.label+(c.sent_turn?' · sent':'');lab.title='Show this highlight';lab.onclick=()=>{drawOverlay(c.overlay);document.getElementById('pick').textContent=c.text};
   row.append(cb,lab);sec.appendChild(row)});
  h.appendChild(sec)}
 if(cs.length){const b=document.createElement('button');b.textContent='Clear history';b.style.marginTop='6px';b.onclick=()=>api('/clicks/clear',{}).then(loadClicks);h.appendChild(b)}}
loadClicks();
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
  const fps = Math.min(60, Math.max(1, deps.fps ?? 10));
  const pump = new FramePump(deps.mesen, () => deps.luaScript, romName, deps.log, Math.round(1000 / fps), () => deps.history.rev);
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
      // The click history is served without the bridge: it is the page's own state (ADR-0015).
      if (req.method === "GET" && url.pathname === "/clicks") {
        json(res, 200, { rev: deps.history.rev, clicks: deps.history.list() }); return;
      }
      if (req.method === "POST" && url.pathname === "/clicks/select") {
        const body = await readJson(req);
        const id = Number(body.id);
        if (!deps.history.setSelected(id, Boolean(body.selected))) { json(res, 404, { error: `no click ${id}` }); return; }
        json(res, 200, { rev: deps.history.rev, clicks: deps.history.list() }); return;
      }
      if (req.method === "POST" && url.pathname === "/clicks/clear") {
        deps.history.clear();
        json(res, 200, { rev: deps.history.rev, clicks: [] }); return;
      }
      const mesen = deps.mesen();
      if (req.method === "GET" && url.pathname === "/status") {
        let paused: boolean | null = null;
        if (mesen.isConnected) paused = (await mesen.getEmulatorStatus()).paused;
        json(res, 200, { connected: mesen.isConnected, paused, rom: romName(), ...(deps.luaScript ? { lua_script: deps.luaScript } : {}) });
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
        const mode = (REGION_MODES as readonly string[]).includes(String(body.mode ?? "color")) ? (body.mode as RegionMode) ?? "color" : null;
        if (!mode) { json(res, 400, { error: `mode must be one of ${REGION_MODES.join(", ")}` }); return; }
        // A pick is one frame only if the game holds still (ADR-0015): pause a
        // running game first; `hold: false` resumes it once the readout is taken.
        const hold = body.hold === undefined ? true : Boolean(body.hold);
        const wasRunning = !(await mesen.getEmulatorStatus()).paused;
        if (wasRunning) await mesen.pauseEmulator();
        let pick: Awaited<ReturnType<typeof pickPixel>>;
        try {
          pick = await pickPixel(mesen, x, y, mode);
        } finally {
          if (wasRunning && !hold) await mesen.resumeEmulator();
        }
        const pause_state: PauseState = wasRunning ? (hold ? "paused_by_click" : "resumed_after_pick") : "already_paused";
        const name = mappingName(pick.tile_id);
        const withName = name ? { ...pick, mapping_name: name } : pick;
        const text = `${formatPickContext(withName)}${name ? ` Mapping names this tile "${name}".` : ""} ${pauseSentence(pause_state)}`;
        const record = deps.history.add({
          mode, x, y, label: clickLabel(withName), text,
          overlay: { box: pick.box, ...(pick.sprite_box ? { sprite_box: pick.sprite_box } : {}), ...(pick.region ? { runs: pick.region.runs } : {}) },
        });
        json(res, 200, { ...withName, click_id: record.id, queued: true, pause_state } satisfies PickResult);
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
