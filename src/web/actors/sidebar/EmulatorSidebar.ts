/**
 * EmulatorSidebar
 *
 * Vanilla JS (non-actor) class that manages the left sidebar:
 * - Emulator canvas (screenshot rendering, click-to-inspect)
 * - Palette display
 * - Tile info
 * - Connection controls
 * - Log panel
 *
 * This is NOT an actor — it's a plain class that operates directly on the DOM.
 * The gateway calls its methods to push data (screenshots, palettes, tile info).
 * It calls the gateway to send commands (screenshot, ping, etc.).
 */

import type { GatewayActor } from '../gateway/GatewayActor.js';
import type { InputAreaActor } from '../input-area/InputAreaActor.js';

// ============================================
// NES Master Palette (canonical 64 colors)
// ============================================

export const NES_PALETTE = [
  '#626262', '#012090', '#240092', '#48008A', '#600062', '#680028', '#5C0000', '#401000',
  '#1C2600', '#003600', '#003E00', '#003A12', '#002E56', '#000000', '#000000', '#000000',
  '#ABABAB', '#1F56E1', '#4C34FF', '#7820FF', '#A018C4', '#AC1C62', '#A42200', '#803E00',
  '#505C00', '#1C7400', '#007E04', '#00783A', '#006894', '#000000', '#000000', '#000000',
  '#FEFFFF', '#6CB3FF', '#9A8FFF', '#C474FF', '#F06EFF', '#FF72B4', '#FF7854', '#E69620',
  '#BAB400', '#82CE00', '#5EDC1E', '#4CD874', '#4ECAE4', '#4E4E4E', '#000000', '#000000',
  '#FEFFFF', '#BEE0FF', '#CCCCFF', '#DEC4FF', '#EEBFFF', '#F4C0E4', '#F4C4BC', '#ECD09E',
  '#DEDE8E', '#C8EA92', '#BCEFA4', '#B4EECA', '#B8E8F0', '#B8B8B8', '#000000', '#000000',
];

// ============================================
// Sidebar
// ============================================

export class EmulatorSidebar {
  private _container: HTMLElement;
  private _gateway: GatewayActor | null = null;
  private _inputArea: InputAreaActor | null = null;

  // DOM elements
  private _canvas: HTMLCanvasElement;
  private _ctx: CanvasRenderingContext2D;
  private _clickInfo: HTMLElement;
  private _tileInfo: HTMLElement;
  private _paletteContainer: HTMLElement;
  private _logEl: HTMLElement;
  private _statusDot: HTMLElement;
  private _statusText: HTMLElement;

  // State
  private _refreshInterval: ReturnType<typeof setInterval> | null = null;
  private _screenshotInFlight = false;
  private _paused = false;
  private _nativeWidth = 256;
  private _nativeHeight = 240;
  private _rawLogs: string[] = [];
  private _pendingLuaLogExport: ((luaSection: string) => void) | null = null;

  constructor(container: HTMLElement) {
    this._container = container;

    // Query required elements
    this._canvas = container.querySelector<HTMLCanvasElement>('#screen')!;
    this._ctx = this._canvas.getContext('2d')!;
    this._clickInfo = container.querySelector<HTMLElement>('#clickInfo')!;
    this._tileInfo = container.querySelector<HTMLElement>('#tileInfo')!;
    this._paletteContainer = container.querySelector<HTMLElement>('#paletteContainer')!;
    this._logEl = container.querySelector<HTMLElement>('#log')!;

    // Status elements (in the header, outside sidebar — query from document)
    this._statusDot = document.getElementById('statusDot')!;
    this._statusText = document.getElementById('statusText')!;

    this._bindEvents();
  }

  /** Wire up the gateway (called after gateway is created). */
  setGateway(gateway: GatewayActor): void {
    this._gateway = gateway;
  }

  /** Wire up the input area (for the attach button). */
  setInputArea(inputArea: InputAreaActor): void {
    this._inputArea = inputArea;
  }

  // ============================================
  // Event Binding
  // ============================================

  private _bindEvents(): void {
    // Canvas click → inspect tile
    this._canvas.addEventListener('click', (e: MouseEvent) => {
      const rect = this._canvas.getBoundingClientRect();
      const scaleX = this._canvas.width / rect.width;
      const scaleY = this._canvas.height / rect.height;
      const x = Math.floor((e.clientX - rect.left) * scaleX);
      const y = Math.floor((e.clientY - rect.top) * scaleY);
      this._clickInfo.textContent = `Inspecting pixel (${x}, ${y})...`;
      this._gateway?.send('get_tile_at_pixel', { x, y });
    });

    // Sidebar buttons (using event delegation on the container)
    this._container.addEventListener('click', (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;
      switch (action) {
        case 'screenshot':
          this._gateway?.send('screenshot');
          break;
        case 'auto-refresh':
          this.startAutoRefresh();
          break;
        case 'stop-refresh':
          this.stopAutoRefresh();
          break;
        case 'attach':
          this._attachCurrentFrame();
          break;
        case 'ping':
          this._gateway?.send('ping');
          break;
        case 'rom-info':
          this._gateway?.send('get_rom_info');
          break;
        case 'cpu-state':
          this._gateway?.send('get_cpu_state');
          break;
        case 'load-palettes':
          this._gateway?.send('get_all_palettes');
          break;
        case 'export-logs':
          this._exportLogs();
          break;
        case 'clear-logs':
          this._clearLogs();
          break;
        case 'pause-emu':
          this._gateway?.send('pause_emulator');
          break;
        case 'resume-emu':
          this._gateway?.send('resume_emulator');
          break;
        case 'step-frame':
          this._gateway?.send('step_frame', { count: 1 });
          break;
      }
    });
  }

  // ============================================
  // Screenshot Rendering
  // ============================================

  renderScreenshot(base64: string): void {
    this._screenshotInFlight = false;
    const img = new Image();
    img.onload = () => {
      if (this._canvas.width !== img.width || this._canvas.height !== img.height) {
        this._canvas.width = img.width;
        this._canvas.height = img.height;
        this._canvas.style.aspectRatio = `${img.width} / ${img.height}`;
        this._nativeWidth = img.width;
        this._nativeHeight = img.height;
      }
      this._ctx.imageSmoothingEnabled = false;
      this._ctx.drawImage(img, 0, 0);
    };
    img.src = `data:image/png;base64,${base64}`;
  }

  /** Called when a screenshot request fails (timeout, error). Resets in-flight flag. */
  screenshotFailed(): void {
    this._screenshotInFlight = false;
  }

  // ============================================
  // Emulator Pause State
  // ============================================

  /** Update the emulator pause state. Stops auto-refresh when paused. */
  setEmulatorPaused(paused: boolean): void {
    this._paused = paused;
    // Update status text if connected
    if (this._statusDot.classList.contains('connected')) {
      this._statusText.textContent = paused ? 'Connected (Paused)' : 'Connected';
    }
    // Stop auto-refresh when paused to avoid flooding identical frames
    if (paused && this._refreshInterval) {
      this.stopAutoRefresh();
      this.log('Auto-refresh stopped (emulator paused)', 'info');
    }
  }

  get isPaused(): boolean {
    return this._paused;
  }

  // ============================================
  // Auto-Refresh
  // ============================================

  startAutoRefresh(): void {
    if (this._refreshInterval) return;
    this._refreshInterval = setInterval(() => {
      // Skip if a screenshot request is already in-flight (e.g. emulator paused)
      if (this._screenshotInFlight) return;
      this._screenshotInFlight = true;
      this._gateway?.send('screenshot');
    }, 100);
    this.log('Auto-refresh started (10 FPS)', 'info');
  }

  stopAutoRefresh(): void {
    if (this._refreshInterval) {
      clearInterval(this._refreshInterval);
      this._refreshInterval = null;
      this.log('Auto-refresh stopped', 'info');
    }
  }

  // ============================================
  // Attach Screenshot
  // ============================================

  private _attachCurrentFrame(): void {
    const dataUrl = this._canvas.toDataURL('image/png');
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    if (!base64 || base64.length < 100) {
      this.log('No frame to attach — take a screenshot first', 'error');
      return;
    }
    this._inputArea?.attachScreenshot(base64);
    this.log('Frame attached to next message', 'info');
  }

  // ============================================
  // Tile Info
  // ============================================

  renderTileInfo(info: Record<string, unknown>): void {
    const tile = info as {
      tile_id: number;
      tile_x: number;
      tile_y: number;
      palette_id: number;
      nametable: number;
      nametable_addr: number;
      scroll_x: number;
      scroll_y: number;
    };

    this._clickInfo.textContent = `Pixel → Tile (${tile.tile_x}, ${tile.tile_y})`;
    this._tileInfo.innerHTML =
      `Tile ID: 0x${tile.tile_id.toString(16).toUpperCase().padStart(2, '0')}\n` +
      `Palette: ${tile.palette_id} (BG)\n` +
      `Nametable: ${tile.nametable} (addr: 0x${tile.nametable_addr.toString(16).toUpperCase()})\n` +
      `Scroll: (${tile.scroll_x}, ${tile.scroll_y})`;
  }

  // ============================================
  // Palettes
  // ============================================

  renderPalettes(palettes: unknown[]): void {
    this._paletteContainer.innerHTML = '';

    for (const pal of palettes as Array<{ type: string; palette_id: number; colors: number[] }>) {
      const label = document.createElement('div');
      label.className = 'palette-row-label';
      label.textContent = `${pal.type} #${pal.palette_id}`;
      this._paletteContainer.appendChild(label);

      const grid = document.createElement('div');
      grid.className = 'palette-grid';
      for (let i = 0; i < pal.colors.length; i++) {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.style.background = NES_PALETTE[pal.colors[i]] || '#000';
        swatch.title = `Color ${i}: 0x${pal.colors[i].toString(16).toUpperCase().padStart(2, '0')}`;
        swatch.innerHTML = `<span class="index">${pal.colors[i].toString(16).toUpperCase()}</span>`;
        grid.appendChild(swatch);
      }
      this._paletteContainer.appendChild(grid);
    }

    const btn = document.createElement('button');
    btn.textContent = 'Refresh';
    btn.dataset.action = 'load-palettes';
    this._paletteContainer.appendChild(btn);
    this.log('Palettes loaded', 'success');
  }

  // ============================================
  // Connection Status
  // ============================================

  setConnected(connected: boolean): void {
    this._statusDot.classList.toggle('connected', connected);
    this._statusText.textContent = connected ? 'Connected' : 'Disconnected';
  }

  // ============================================
  // Log
  // ============================================

  log(text: string, cls: string = ''): void {
    const timestamp = new Date().toISOString();
    const displayTime = new Date().toLocaleTimeString();
    this._rawLogs.push(`[${timestamp}] [${cls || 'log'}] ${text}`);

    const line = document.createElement('div');
    if (cls) line.className = cls;
    line.textContent = `[${displayTime}] ${text}`;
    this._logEl.appendChild(line);
    this._logEl.scrollTop = this._logEl.scrollHeight;
  }

  private _exportLogs(): void {
    // Try to fetch Lua-side logs from the bridge and merge them into the export
    this._gateway?.send('get_lua_logs', { since: 0 });

    // Give the WS roundtrip a moment, then export everything
    const doExport = (luaSection: string) => {
      const browserSection = this._rawLogs.join('\n');
      const text =
        '=== Browser Logs ===\n' +
        browserSection +
        '\n\n=== Mesen2 Lua Logs ===\n' +
        luaSection;
      const w = window.open('', '_blank');
      if (!w) return;
      const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      w.document.write(
        `<html><head><title>jeROMy Logs</title><style>` +
        `body { background: #111; color: #ccc; font-family: monospace; font-size: 13px; ` +
        `padding: 16px; white-space: pre-wrap; word-break: break-all; }` +
        `</style></head><body>${escaped}</body></html>`
      );
      w.document.close();
    };

    // Store a one-shot handler for the Lua logs response
    this._pendingLuaLogExport = doExport;

    // Fallback: if no response in 1s, export without Lua logs
    setTimeout(() => {
      if (this._pendingLuaLogExport) {
        this._pendingLuaLogExport('(could not fetch — bridge may be disconnected)');
        this._pendingLuaLogExport = null;
      }
    }, 1000);
  }

  /** Called by the gateway when get_lua_logs response arrives. */
  handleLuaLogs(logs: Array<{ ts: number; msg: string }>, overflow?: number): void {
    if (this._pendingLuaLogExport) {
      const lines = logs.map(
        (e) => `[${new Date(e.ts * 1000).toISOString()}] ${e.msg}`
      );
      let section = lines.join('\n') || '(empty)';
      if (overflow && overflow > 0) {
        section = `(${overflow} earlier entries dropped due to buffer overflow)\n` + section;
      }
      this._pendingLuaLogExport(section);
      this._pendingLuaLogExport = null;
    }
  }

  private _clearLogs(): void {
    this._rawLogs.length = 0;
    this._logEl.innerHTML = '';
    this.log('Logs cleared', 'info');
  }

  // ============================================
  // Cleanup
  // ============================================

  destroy(): void {
    this.stopAutoRefresh();
  }
}
