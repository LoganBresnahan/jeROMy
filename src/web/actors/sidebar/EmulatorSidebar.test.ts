// @vitest-environment happy-dom
/**
 * Tests for EmulatorSidebar
 *
 * No Moby equivalent — written from scratch for jeROMy.
 * Tests DOM rendering, connection status, logging, auto-refresh, and palette display.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EmulatorSidebar, NES_PALETTE } from './EmulatorSidebar';

// ============================================
// Helpers
// ============================================

function createSidebarDOM(): HTMLElement {
  const container = document.createElement('div');

  // Canvas
  const canvas = document.createElement('canvas');
  canvas.id = 'screen';
  canvas.width = 256;
  canvas.height = 240;
  container.appendChild(canvas);

  // Click info
  const clickInfo = document.createElement('div');
  clickInfo.id = 'clickInfo';
  container.appendChild(clickInfo);

  // Tile info
  const tileInfo = document.createElement('div');
  tileInfo.id = 'tileInfo';
  container.appendChild(tileInfo);

  // Palette container
  const paletteContainer = document.createElement('div');
  paletteContainer.id = 'paletteContainer';
  container.appendChild(paletteContainer);

  // Log panel
  const logEl = document.createElement('div');
  logEl.id = 'log';
  container.appendChild(logEl);

  // Status elements (need to be in document, not container)
  const statusDot = document.createElement('span');
  statusDot.id = 'statusDot';
  document.body.appendChild(statusDot);

  const statusText = document.createElement('span');
  statusText.id = 'statusText';
  document.body.appendChild(statusText);

  return container;
}

function createMockGateway() {
  return {
    send: vi.fn(),
    sendChat: vi.fn(),
    abortChat: vi.fn(),
    resetChat: vi.fn(),
  } as any;
}

function createMockInputArea() {
  return {
    attachScreenshot: vi.fn(),
    focus: vi.fn(),
  } as any;
}

// ============================================
// Tests
// ============================================

describe('EmulatorSidebar', () => {
  let container: HTMLElement;
  let sidebar: EmulatorSidebar;
  let mockGateway: ReturnType<typeof createMockGateway>;
  let mockInputArea: ReturnType<typeof createMockInputArea>;

  beforeEach(() => {
    container = createSidebarDOM();
    document.body.appendChild(container);
    mockGateway = createMockGateway();
    mockInputArea = createMockInputArea();
  });

  afterEach(() => {
    sidebar?.destroy();
    container.remove();
    document.getElementById('statusDot')?.remove();
    document.getElementById('statusText')?.remove();
  });

  function createSidebar(): EmulatorSidebar {
    sidebar = new EmulatorSidebar(container);
    sidebar.setGateway(mockGateway);
    sidebar.setInputArea(mockInputArea);
    return sidebar;
  }

  // ========================================
  // Constructor
  // ========================================

  describe('Constructor', () => {
    it('binds to required DOM elements', () => {
      createSidebar();
      // Constructor should not throw
      expect(sidebar).toBeTruthy();
    });
  });

  // ========================================
  // NES Palette
  // ========================================

  describe('NES Palette', () => {
    it('exports 64 colors', () => {
      expect(NES_PALETTE.length).toBe(64);
    });

    it('colors are hex strings', () => {
      for (const color of NES_PALETTE) {
        expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    });
  });

  // ========================================
  // Connection Status
  // ========================================

  describe('Connection Status', () => {
    it('setConnected(true) adds connected class', () => {
      createSidebar();
      sidebar.setConnected(true);

      const dot = document.getElementById('statusDot')!;
      expect(dot.classList.contains('connected')).toBe(true);
    });

    it('setConnected(true) shows Connected text', () => {
      createSidebar();
      sidebar.setConnected(true);

      const text = document.getElementById('statusText')!;
      expect(text.textContent).toBe('Connected');
    });

    it('setConnected(false) removes connected class', () => {
      createSidebar();
      sidebar.setConnected(true);
      sidebar.setConnected(false);

      const dot = document.getElementById('statusDot')!;
      expect(dot.classList.contains('connected')).toBe(false);
    });

    it('setConnected(false) shows Disconnected text', () => {
      createSidebar();
      sidebar.setConnected(false);

      const text = document.getElementById('statusText')!;
      expect(text.textContent).toBe('Disconnected');
    });
  });

  // ========================================
  // Logging
  // ========================================

  describe('Logging', () => {
    it('log appends message to log panel', () => {
      createSidebar();
      sidebar.log('Test message', 'info');

      const logEl = container.querySelector('#log')!;
      expect(logEl.children.length).toBe(1);
      expect(logEl.children[0].textContent).toContain('Test message');
    });

    it('log applies CSS class', () => {
      createSidebar();
      sidebar.log('Error message', 'error');

      const logEl = container.querySelector('#log')!;
      expect(logEl.children[0].className).toBe('error');
    });

    it('log appends multiple messages', () => {
      createSidebar();
      sidebar.log('Message 1', 'info');
      sidebar.log('Message 2', 'success');
      sidebar.log('Message 3', 'error');

      const logEl = container.querySelector('#log')!;
      expect(logEl.children.length).toBe(3);
    });

    it('log includes timestamp', () => {
      createSidebar();
      sidebar.log('Timestamped', 'info');

      const logEl = container.querySelector('#log')!;
      // Should have a timestamp in brackets
      expect(logEl.children[0].textContent).toMatch(/\[.*\]/);
    });
  });

  // ========================================
  // Tile Info
  // ========================================

  describe('Tile Info', () => {
    it('renderTileInfo updates click info text', () => {
      createSidebar();

      sidebar.renderTileInfo({
        tile_id: 0x1A,
        tile_x: 5,
        tile_y: 10,
        palette_id: 2,
        nametable: 0,
        nametable_addr: 0x2000,
        scroll_x: 128,
        scroll_y: 64
      });

      const clickInfo = container.querySelector('#clickInfo')!;
      expect(clickInfo.textContent).toContain('Tile (5, 10)');
    });

    it('renderTileInfo displays tile ID in hex', () => {
      createSidebar();

      sidebar.renderTileInfo({
        tile_id: 0xFF,
        tile_x: 0,
        tile_y: 0,
        palette_id: 0,
        nametable: 0,
        nametable_addr: 0x2000,
        scroll_x: 0,
        scroll_y: 0
      });

      const tileInfo = container.querySelector('#tileInfo')!;
      expect(tileInfo.innerHTML).toContain('FF');
    });

    it('renderTileInfo displays palette ID', () => {
      createSidebar();

      sidebar.renderTileInfo({
        tile_id: 1,
        tile_x: 0,
        tile_y: 0,
        palette_id: 3,
        nametable: 0,
        nametable_addr: 0x2000,
        scroll_x: 0,
        scroll_y: 0
      });

      const tileInfo = container.querySelector('#tileInfo')!;
      expect(tileInfo.innerHTML).toContain('Palette: 3');
    });
  });

  // ========================================
  // Palettes
  // ========================================

  describe('Palettes', () => {
    it('renderPalettes creates palette rows', () => {
      createSidebar();

      sidebar.renderPalettes([
        { type: 'bg', palette_id: 0, colors: [0x0F, 0x00, 0x10, 0x30] },
        { type: 'bg', palette_id: 1, colors: [0x0F, 0x06, 0x16, 0x26] }
      ]);

      const paletteContainer = container.querySelector('#paletteContainer')!;
      const labels = paletteContainer.querySelectorAll('.palette-row-label');
      expect(labels.length).toBe(2);
    });

    it('renderPalettes creates color swatches', () => {
      createSidebar();

      sidebar.renderPalettes([
        { type: 'bg', palette_id: 0, colors: [0x0F, 0x00, 0x10, 0x30] }
      ]);

      const swatches = container.querySelectorAll('.color-swatch');
      expect(swatches.length).toBe(4);
    });

    it('renderPalettes applies NES palette colors', () => {
      createSidebar();

      sidebar.renderPalettes([
        { type: 'bg', palette_id: 0, colors: [0x0F] }
      ]);

      const swatch = container.querySelector('.color-swatch') as HTMLElement;
      expect(swatch.style.background).toBe(NES_PALETTE[0x0F]);
    });

    it('renderPalettes shows hex color index', () => {
      createSidebar();

      sidebar.renderPalettes([
        { type: 'bg', palette_id: 0, colors: [0x0F] }
      ]);

      const index = container.querySelector('.index');
      expect(index?.textContent).toBe('F');
    });

    it('renderPalettes labels include type and ID', () => {
      createSidebar();

      sidebar.renderPalettes([
        { type: 'sprite', palette_id: 2, colors: [0] }
      ]);

      const label = container.querySelector('.palette-row-label');
      expect(label?.textContent).toBe('sprite #2');
    });

    it('renderPalettes adds refresh button', () => {
      createSidebar();

      sidebar.renderPalettes([
        { type: 'bg', palette_id: 0, colors: [0] }
      ]);

      const refreshBtn = container.querySelector('[data-action="load-palettes"]');
      expect(refreshBtn).toBeTruthy();
    });

    it('renderPalettes clears previous content', () => {
      createSidebar();

      sidebar.renderPalettes([
        { type: 'bg', palette_id: 0, colors: [0] }
      ]);
      sidebar.renderPalettes([
        { type: 'bg', palette_id: 0, colors: [0, 1] }
      ]);

      // Should have 2 swatches (from second call), not 3 (1 + 2)
      const swatches = container.querySelectorAll('.color-swatch');
      expect(swatches.length).toBe(2);
    });

    it('renderPalettes logs success', () => {
      createSidebar();
      sidebar.renderPalettes([]);

      const logEl = container.querySelector('#log')!;
      expect(logEl.textContent).toContain('Palettes loaded');
    });
  });

  // ========================================
  // Screenshot Rendering
  // ========================================

  describe('Screenshot Rendering', () => {
    it('renderScreenshot does not throw', () => {
      createSidebar();
      // In happy-dom, Image.onload may not fire, but the method shouldn't throw
      expect(() => sidebar.renderScreenshot('AAAA==')).not.toThrow();
    });
  });

  // ========================================
  // Auto-Refresh
  // ========================================

  describe('Auto-Refresh', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('startAutoRefresh sends periodic screenshots', () => {
      createSidebar();
      sidebar.startAutoRefresh();

      vi.advanceTimersByTime(500);

      // 100ms interval, 500ms = 5 calls
      expect(mockGateway.send).toHaveBeenCalledWith('screenshot');
      expect(mockGateway.send.mock.calls.filter(
        (c: any[]) => c[0] === 'screenshot'
      ).length).toBe(5);
    });

    it('startAutoRefresh is idempotent', () => {
      createSidebar();
      sidebar.startAutoRefresh();
      sidebar.startAutoRefresh();

      vi.advanceTimersByTime(100);

      // Should only have 1 screenshot call (not 2)
      expect(mockGateway.send.mock.calls.filter(
        (c: any[]) => c[0] === 'screenshot'
      ).length).toBe(1);
    });

    it('stopAutoRefresh stops periodic screenshots', () => {
      createSidebar();
      sidebar.startAutoRefresh();

      vi.advanceTimersByTime(200);
      sidebar.stopAutoRefresh();
      vi.advanceTimersByTime(500);

      // Should have 2 calls (from first 200ms) and no more after stop
      const screenshotCalls = mockGateway.send.mock.calls.filter(
        (c: any[]) => c[0] === 'screenshot'
      );
      expect(screenshotCalls.length).toBe(2);
    });

    it('stopAutoRefresh is safe when not running', () => {
      createSidebar();
      // Should not throw
      sidebar.stopAutoRefresh();
    });

    it('startAutoRefresh logs start', () => {
      createSidebar();
      sidebar.startAutoRefresh();

      const logEl = container.querySelector('#log')!;
      expect(logEl.textContent).toContain('Auto-refresh started');
    });

    it('stopAutoRefresh logs stop', () => {
      createSidebar();
      sidebar.startAutoRefresh();
      sidebar.stopAutoRefresh();

      const logEl = container.querySelector('#log')!;
      expect(logEl.textContent).toContain('Auto-refresh stopped');
    });
  });

  // ========================================
  // Lua Logs
  // ========================================

  describe('Lua Logs', () => {
    it('handleLuaLogs does not throw when no pending export', () => {
      createSidebar();
      // Should not throw
      sidebar.handleLuaLogs([{ ts: 1000, msg: 'test' }]);
    });
  });

  // ========================================
  // Button Actions (event delegation)
  // ========================================

  describe('Button Actions', () => {
    it('screenshot button sends screenshot command', () => {
      createSidebar();
      const btn = document.createElement('button');
      btn.setAttribute('data-action', 'screenshot');
      container.appendChild(btn);

      btn.click();

      expect(mockGateway.send).toHaveBeenCalledWith('screenshot');
    });

    it('load-palettes button sends get_all_palettes command', () => {
      createSidebar();
      const btn = document.createElement('button');
      btn.setAttribute('data-action', 'load-palettes');
      container.appendChild(btn);

      btn.click();

      expect(mockGateway.send).toHaveBeenCalledWith('get_all_palettes');
    });

    it('ping button sends ping command', () => {
      createSidebar();
      const btn = document.createElement('button');
      btn.setAttribute('data-action', 'ping');
      container.appendChild(btn);

      btn.click();

      expect(mockGateway.send).toHaveBeenCalledWith('ping');
    });

    it('clear-logs button clears log panel', () => {
      createSidebar();
      sidebar.log('Message 1', 'info');
      sidebar.log('Message 2', 'info');

      const btn = document.createElement('button');
      btn.setAttribute('data-action', 'clear-logs');
      container.appendChild(btn);

      btn.click();

      const logEl = container.querySelector('#log')!;
      // After clear, there should be a "Logs cleared" message
      expect(logEl.children.length).toBe(1);
      expect(logEl.textContent).toContain('Logs cleared');
    });
  });

  // ========================================
  // Lifecycle
  // ========================================

  describe('Lifecycle', () => {
    it('destroy stops auto-refresh', () => {
      vi.useFakeTimers();
      createSidebar();
      sidebar.startAutoRefresh();

      sidebar.destroy();
      mockGateway.send.mockClear();
      vi.advanceTimersByTime(500);

      expect(mockGateway.send).not.toHaveBeenCalled();
      vi.useRealTimers();
    });
  });
});
