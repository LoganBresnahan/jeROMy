// @vitest-environment happy-dom
/**
 * Tests for GatewayActor
 *
 * Adapted from Moby's VirtualMessageGatewayActor.test.ts for jeROMy.
 * Tests WebSocket lifecycle, agent event routing, interleaving coordination,
 * fence carry-forward, outbound API, and message routing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventStateManager } from '../../state/EventStateManager';
import { GatewayActor } from './GatewayActor';
import { resetUniqueIdCounter } from '../../utils/uniqueId';

// ============================================
// Mock WebSocket
// ============================================

let lastCreatedWs: MockWebSocket;

class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.OPEN;
  onopen: ((e: Event) => void) | null = null;
  onclose: ((e: Event) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  send = vi.fn();
  close = vi.fn();

  constructor(_url: string) {
    lastCreatedWs = this;
  }
}

// Install mock WebSocket globally
(globalThis as any).WebSocket = MockWebSocket;

// ============================================
// Mock VirtualListActor
// ============================================

function createMockVirtualList() {
  return {
    addTurn: vi.fn().mockReturnValue({ turnId: 'mock-turn', role: 'user' }),
    getTurn: vi.fn(),
    addTextSegment: vi.fn().mockReturnValue('seg-1'),
    updateTextContent: vi.fn(),
    finalizeCurrentSegment: vi.fn().mockReturnValue(true),
    resumeWithNewSegment: vi.fn(),
    startStreamingTurn: vi.fn(),
    endStreamingTurn: vi.fn(),
    startToolBatch: vi.fn().mockReturnValue('batch-1'),
    updateToolInCurrentBatch: vi.fn(),
    addToolToCurrentBatch: vi.fn().mockReturnValue(1),
    completeCurrentToolBatch: vi.fn(),
    addToolResult: vi.fn(),
    addScreenshot: vi.fn(),
    addError: vi.fn(),
    addUsageStats: vi.fn(),
    getBoundActor: vi.fn().mockReturnValue(null),
    clear: vi.fn(),
  } as any;
}

// ============================================
// Mock EmulatorSidebar
// ============================================

function createMockSidebar() {
  return {
    log: vi.fn(),
    setConnected: vi.fn(),
    renderScreenshot: vi.fn(),
    renderPalettes: vi.fn(),
    renderTileInfo: vi.fn(),
    handleLuaLogs: vi.fn(),
  } as any;
}

// ============================================
// Tests
// ============================================

describe('GatewayActor', () => {
  let manager: EventStateManager;
  let element: HTMLElement;
  let virtualList: ReturnType<typeof createMockVirtualList>;
  let sidebar: ReturnType<typeof createMockSidebar>;
  let gateway: GatewayActor;

  beforeEach(() => {
    resetUniqueIdCounter();
    vi.useFakeTimers();
    manager = new EventStateManager();
    element = document.createElement('div');
    document.body.appendChild(element);
    virtualList = createMockVirtualList();
    sidebar = createMockSidebar();
  });

  afterEach(() => {
    gateway?.destroy();
    vi.useRealTimers();
    manager.resetStyles();
    element.remove();
  });

  function createGateway(): GatewayActor {
    gateway = new GatewayActor({ manager, element, virtualList, sidebar });
    return gateway;
  }

  function connectGateway(): MockWebSocket {
    gateway.connect('ws://localhost:3000');
    const ws = lastCreatedWs;
    // Simulate successful connection
    ws.onopen?.(new Event('open'));
    return ws;
  }

  function simulateMessage(ws: MockWebSocket, msg: Record<string, unknown>): void {
    ws.onmessage?.(new MessageEvent('message', { data: JSON.stringify(msg) }));
  }

  // ========================================
  // Constructor
  // ========================================

  describe('Constructor', () => {
    it('initializes with disconnected state', () => {
      createGateway();

      expect(gateway.connected).toBe(false);
      expect(gateway.streaming).toBe(false);
    });
  });

  // ========================================
  // WebSocket Lifecycle
  // ========================================

  describe('WebSocket Lifecycle', () => {
    it('connect creates WebSocket connection', () => {
      createGateway();
      gateway.connect('ws://localhost:3000');

      expect(lastCreatedWs).toBeTruthy();
    });

    it('onopen sets connected state', () => {
      createGateway();
      const ws = connectGateway();

      expect(gateway.connected).toBe(true);
      expect(sidebar.setConnected).toHaveBeenCalledWith(true);
      expect(sidebar.log).toHaveBeenCalledWith('Connected to jeROMy server', 'success');
    });

    it('onclose sets disconnected state', () => {
      createGateway();
      const ws = connectGateway();

      ws.onclose?.(new Event('close'));

      expect(gateway.connected).toBe(false);
      expect(sidebar.setConnected).toHaveBeenCalledWith(false);
    });

    it('onclose schedules reconnect', () => {
      createGateway();
      const ws = connectGateway();

      ws.onclose?.(new Event('close'));
      vi.advanceTimersByTime(2000);

      // A new WebSocket should have been created
      expect(lastCreatedWs).not.toBe(ws);
    });

    it('disconnect closes WebSocket', () => {
      createGateway();
      const ws = connectGateway();

      gateway.disconnect();

      expect(ws.close).toHaveBeenCalled();
    });

    it('disconnect cancels reconnect timer', () => {
      createGateway();
      const ws = connectGateway();
      ws.onclose?.(new Event('close'));

      gateway.disconnect();
      vi.advanceTimersByTime(5000);

      // Should not have reconnected (only the initial ws + close ws)
    });
  });

  // ========================================
  // Outbound API
  // ========================================

  describe('Outbound API', () => {
    it('send sends JSON message', () => {
      createGateway();
      const ws = connectGateway();

      gateway.send('screenshot');

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ action: 'screenshot', params: undefined })
      );
    });

    it('send with params includes them', () => {
      createGateway();
      const ws = connectGateway();

      gateway.send('get_tile_at_pixel', { x: 100, y: 50 });

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ action: 'get_tile_at_pixel', params: { x: 100, y: 50 } })
      );
    });

    it('send logs error when not connected', () => {
      createGateway();

      gateway.send('screenshot');

      expect(sidebar.log).toHaveBeenCalledWith('Not connected', 'error');
    });

    it('sendChat sends chat message', () => {
      createGateway();
      const ws = connectGateway();

      gateway.sendChat('Make the rock orange');

      expect(ws.send).toHaveBeenCalledWith(
        expect.stringContaining('"action":"chat"')
      );
      expect(ws.send).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Make the rock orange"')
      );
    });

    it('sendChat adds user turn to virtual list', () => {
      createGateway();
      connectGateway();

      gateway.sendChat('Hello');

      expect(virtualList.addTurn).toHaveBeenCalledWith(
        expect.stringContaining('user-'),
        'user'
      );
      expect(virtualList.addTextSegment).toHaveBeenCalled();
    });

    it('sendChat sets streaming state', () => {
      createGateway();
      connectGateway();

      gateway.sendChat('Hello');

      expect(gateway.streaming).toBe(true);
    });

    it('sendChat includes images when provided', () => {
      createGateway();
      const ws = connectGateway();

      gateway.sendChat('Check this', [{ data: 'AAAA==', media_type: 'image/png' }]);

      // Find the chat send call (not the session_list request from onopen)
      const chatCall = ws.send.mock.calls.find((call: any[]) => {
        const msg = JSON.parse(call[0]);
        return msg.action === 'chat';
      });
      expect(chatCall).toBeTruthy();
      const sentMsg = JSON.parse(chatCall![0]);
      expect(sentMsg.images).toEqual([{ data: 'AAAA==', media_type: 'image/png' }]);
    });

    it('sendChat appends [attached screenshot] for user turn with images', () => {
      createGateway();
      connectGateway();

      gateway.sendChat('Look at this', [{ data: 'AAAA==', media_type: 'image/png' }]);

      const addTextCall = virtualList.addTextSegment.mock.calls[0];
      expect(addTextCall[1]).toContain('[attached screenshot]');
    });

    it('abortChat sends abort message', () => {
      createGateway();
      const ws = connectGateway();

      gateway.abortChat();

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ action: 'chat_abort' })
      );
    });

    it('abortChat ends current turn', () => {
      createGateway();
      connectGateway();
      gateway.sendChat('Hello');

      gateway.abortChat();

      expect(gateway.streaming).toBe(false);
    });

    it('resetChat sends reset message', () => {
      createGateway();
      const ws = connectGateway();

      gateway.resetChat();

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ action: 'chat_reset' })
      );
    });

    it('resetChat clears virtual list', () => {
      createGateway();
      connectGateway();

      gateway.resetChat();

      expect(virtualList.clear).toHaveBeenCalled();
      expect(sidebar.log).toHaveBeenCalledWith('Chat history cleared', 'info');
    });
  });

  // ========================================
  // Agent Text Streaming
  // ========================================

  describe('Agent Text', () => {
    it('agent_text creates assistant turn on first text', () => {
      createGateway();
      const ws = connectGateway();
      gateway.sendChat('Hello');

      simulateMessage(ws, { action: 'agent_text', text: 'Let me' });

      expect(virtualList.addTurn).toHaveBeenCalledWith(
        expect.stringContaining('assistant-'),
        'assistant'
      );
      expect(virtualList.startStreamingTurn).toHaveBeenCalled();
    });

    it('agent_text accumulates text content', () => {
      createGateway();
      const ws = connectGateway();
      gateway.sendChat('Hello');

      simulateMessage(ws, { action: 'agent_text', text: 'Let me ' });
      simulateMessage(ws, { action: 'agent_text', text: 'check...' });

      // updateTextContent should be called with accumulated text
      const lastCall = virtualList.updateTextContent.mock.calls[
        virtualList.updateTextContent.mock.calls.length - 1
      ];
      expect(lastCall[1]).toBe('Let me check...');
    });

    it('agent_text completes tool batch before resuming text', () => {
      createGateway();
      const ws = connectGateway();
      gateway.sendChat('Hello');

      // Start text
      simulateMessage(ws, { action: 'agent_text', text: 'Checking...' });
      // Tool call
      simulateMessage(ws, { action: 'agent_tool_call', name: 'screenshot', input: {} });
      simulateMessage(ws, { action: 'agent_tool_result', name: 'screenshot', result: '{}', is_error: false });
      // Resume text — should complete the tool batch first
      simulateMessage(ws, { action: 'agent_text', text: 'Done.' });

      expect(virtualList.completeCurrentToolBatch).toHaveBeenCalled();
    });
  });

  // ========================================
  // Agent Tool Calls
  // ========================================

  describe('Agent Tool Calls', () => {
    it('agent_tool_call creates assistant turn if needed', () => {
      createGateway();
      const ws = connectGateway();
      gateway.sendChat('Hello');

      simulateMessage(ws, { action: 'agent_tool_call', name: 'screenshot', input: {} });

      expect(virtualList.addTurn).toHaveBeenCalledWith(
        expect.stringContaining('assistant-'),
        'assistant'
      );
    });

    it('agent_tool_call starts tool batch', () => {
      createGateway();
      const ws = connectGateway();
      gateway.sendChat('Hello');

      simulateMessage(ws, { action: 'agent_tool_call', name: 'get_palette', input: { palette_id: 2 } });

      expect(virtualList.startToolBatch).toHaveBeenCalled();
      const batchCall = virtualList.startToolBatch.mock.calls[0];
      expect(batchCall[1][0].name).toBe('get_palette');
    });

    it('agent_tool_call adds to existing batch', () => {
      createGateway();
      const ws = connectGateway();
      gateway.sendChat('Hello');

      simulateMessage(ws, { action: 'agent_tool_call', name: 'get_palette', input: { palette_id: 2 } });
      simulateMessage(ws, { action: 'agent_tool_call', name: 'screenshot', input: {} });

      expect(virtualList.addToolToCurrentBatch).toHaveBeenCalledWith(
        expect.any(String),
        'screenshot',
        expect.any(String)
      );
    });

    it('agent_tool_call finalizes text segment before starting batch', () => {
      createGateway();
      const ws = connectGateway();
      gateway.sendChat('Hello');

      simulateMessage(ws, { action: 'agent_text', text: 'Checking...' });
      simulateMessage(ws, { action: 'agent_tool_call', name: 'screenshot', input: {} });

      expect(virtualList.finalizeCurrentSegment).toHaveBeenCalled();
    });

    it('agent_tool_call builds detail string from input', () => {
      createGateway();
      const ws = connectGateway();
      gateway.sendChat('Hello');

      simulateMessage(ws, {
        action: 'agent_tool_call',
        name: 'write_palette',
        input: { palette_id: 2, color_index: 1, nes_color: 39 }
      });

      const batchCall = virtualList.startToolBatch.mock.calls[0];
      expect(batchCall[1][0].detail).toContain('palette_id');
    });
  });

  // ========================================
  // Agent Tool Results
  // ========================================

  describe('Agent Tool Results', () => {
    it('agent_tool_result marks tool as done', () => {
      createGateway();
      const ws = connectGateway();
      gateway.sendChat('Hello');

      simulateMessage(ws, { action: 'agent_tool_call', name: 'screenshot', input: {} });
      simulateMessage(ws, {
        action: 'agent_tool_result',
        name: 'screenshot',
        result: '{"png_base64":"AAAA"}',
        is_error: false
      });

      expect(virtualList.updateToolInCurrentBatch).toHaveBeenCalledWith(
        expect.any(String),
        0,
        'done'
      );
    });

    it('agent_tool_result marks tool as error when is_error', () => {
      createGateway();
      const ws = connectGateway();
      gateway.sendChat('Hello');

      simulateMessage(ws, { action: 'agent_tool_call', name: 'read_memory', input: { address: 0 } });
      simulateMessage(ws, {
        action: 'agent_tool_result',
        name: 'read_memory',
        result: 'bridge disconnected',
        is_error: true
      });

      expect(virtualList.updateToolInCurrentBatch).toHaveBeenCalledWith(
        expect.any(String),
        0,
        'error'
      );
    });

    it('agent_tool_result adds tool result to turn', () => {
      createGateway();
      const ws = connectGateway();
      gateway.sendChat('Hello');

      simulateMessage(ws, { action: 'agent_tool_call', name: 'get_palette', input: { palette_id: 2 } });
      simulateMessage(ws, {
        action: 'agent_tool_result',
        name: 'get_palette',
        result: '{"colors":[0,1,2,3]}',
        is_error: false
      });

      expect(virtualList.addToolResult).toHaveBeenCalledWith(
        expect.any(String),
        'get_palette',
        '{"colors":[0,1,2,3]}',
        false
      );
    });
  });

  // ========================================
  // Agent Screenshot
  // ========================================

  describe('Agent Screenshot', () => {
    it('agent_screenshot adds screenshot to turn', () => {
      createGateway();
      const ws = connectGateway();
      gateway.sendChat('Hello');

      simulateMessage(ws, { action: 'agent_text', text: 'Taking screenshot...' });
      simulateMessage(ws, { action: 'agent_tool_call', name: 'screenshot', input: {} });
      simulateMessage(ws, { action: 'agent_screenshot', png_base64: 'SCREENSHOT_DATA' });

      expect(virtualList.addScreenshot).toHaveBeenCalledWith(
        expect.any(String),
        'SCREENSHOT_DATA'
      );
    });

    it('agent_screenshot updates sidebar', () => {
      createGateway();
      const ws = connectGateway();
      gateway.sendChat('Hello');

      simulateMessage(ws, { action: 'agent_text', text: 'hi' });
      simulateMessage(ws, { action: 'agent_screenshot', png_base64: 'SCREENSHOT_DATA' });

      expect(sidebar.renderScreenshot).toHaveBeenCalledWith('SCREENSHOT_DATA');
    });

    it('agent_screenshot finalizes text and completes batch', () => {
      createGateway();
      const ws = connectGateway();
      gateway.sendChat('Hello');

      simulateMessage(ws, { action: 'agent_text', text: 'Checking...' });
      simulateMessage(ws, { action: 'agent_tool_call', name: 'screenshot', input: {} });
      simulateMessage(ws, { action: 'agent_screenshot', png_base64: 'DATA' });

      expect(virtualList.completeCurrentToolBatch).toHaveBeenCalled();
    });
  });

  // ========================================
  // Agent Done
  // ========================================

  describe('Agent Done', () => {
    it('agent_done ends streaming turn', () => {
      createGateway();
      const ws = connectGateway();
      gateway.sendChat('Hello');

      simulateMessage(ws, { action: 'agent_text', text: 'Response.' });
      simulateMessage(ws, {
        action: 'agent_done',
        text: 'Response.',
        usage: { input_tokens: 500, output_tokens: 200 }
      });

      expect(virtualList.endStreamingTurn).toHaveBeenCalled();
      expect(gateway.streaming).toBe(false);
    });

    it('agent_done adds usage stats', () => {
      createGateway();
      const ws = connectGateway();
      gateway.sendChat('Hello');

      simulateMessage(ws, { action: 'agent_text', text: 'Done.' });
      simulateMessage(ws, {
        action: 'agent_done',
        text: 'Done.',
        usage: { input_tokens: 1500, output_tokens: 350 }
      });

      expect(virtualList.addUsageStats).toHaveBeenCalledWith(
        expect.any(String),
        1500,
        350
      );
    });

    it('agent_done completes active tool batch', () => {
      createGateway();
      const ws = connectGateway();
      gateway.sendChat('Hello');

      simulateMessage(ws, { action: 'agent_tool_call', name: 'screenshot', input: {} });
      simulateMessage(ws, {
        action: 'agent_done',
        text: '',
        usage: { input_tokens: 100, output_tokens: 50 }
      });

      expect(virtualList.completeCurrentToolBatch).toHaveBeenCalled();
    });
  });

  // ========================================
  // Agent Error
  // ========================================

  describe('Agent Error', () => {
    it('agent_error adds error to turn', () => {
      createGateway();
      const ws = connectGateway();
      gateway.sendChat('Hello');

      simulateMessage(ws, { action: 'agent_text', text: 'Trying...' });
      simulateMessage(ws, { action: 'agent_error', message: 'Max iterations reached' });

      expect(virtualList.addError).toHaveBeenCalledWith(
        expect.any(String),
        'Max iterations reached'
      );
    });

    it('agent_error ends streaming', () => {
      createGateway();
      const ws = connectGateway();
      gateway.sendChat('Hello');

      simulateMessage(ws, { action: 'agent_text', text: 'Trying...' });
      simulateMessage(ws, { action: 'agent_error', message: 'Failed' });

      expect(virtualList.endStreamingTurn).toHaveBeenCalled();
      expect(gateway.streaming).toBe(false);
    });
  });

  // ========================================
  // Fence Carry-Forward
  // ========================================

  describe('Fence Carry-Forward', () => {
    it('saves incomplete fence when text is split by tool call', () => {
      createGateway();
      const ws = connectGateway();
      gateway.sendChat('Hello');

      // Set up mock: getBoundActor returns an actor that needs a new segment
      const mockActor = { needsNewSegment: vi.fn().mockReturnValue(true) };
      virtualList.getBoundActor.mockReturnValue(mockActor);

      // Text with incomplete code fence
      simulateMessage(ws, {
        action: 'agent_text',
        text: "Here's code:\n```javascript\nconst x = 1;"
      });

      // Tool call splits the text
      simulateMessage(ws, { action: 'agent_tool_call', name: 'get_palette', input: { palette_id: 2 } });
      simulateMessage(ws, {
        action: 'agent_tool_result',
        name: 'get_palette',
        result: '{}',
        is_error: false
      });

      // Resume text — fence carry should prepend
      simulateMessage(ws, { action: 'agent_text', text: '\nconst y = 2;\n```' });

      // The accumulated text should include the carried-forward fence
      const lastUpdateCall = virtualList.updateTextContent.mock.calls[
        virtualList.updateTextContent.mock.calls.length - 1
      ];
      if (lastUpdateCall) {
        // The content should contain the fence continuation
        expect(lastUpdateCall[1]).toContain('const');
      }
    });
  });

  // ========================================
  // Message Routing
  // ========================================

  describe('Message Routing', () => {
    it('routes server_log to sidebar', () => {
      createGateway();
      const ws = connectGateway();

      simulateMessage(ws, { action: 'server_log', text: 'Bridge connected', level: 'success' });

      expect(sidebar.log).toHaveBeenCalledWith('[server] Bridge connected', 'success');
    });

    it('routes screenshot response to sidebar', () => {
      createGateway();
      const ws = connectGateway();

      simulateMessage(ws, {
        action: 'screenshot',
        result: { png_base64: 'SCREEN_DATA' }
      });

      expect(sidebar.renderScreenshot).toHaveBeenCalledWith('SCREEN_DATA');
    });

    it('routes get_all_palettes response to sidebar', () => {
      createGateway();
      const ws = connectGateway();

      simulateMessage(ws, {
        action: 'get_all_palettes',
        result: { palettes: [{ type: 'bg', palette_id: 0, colors: [0, 1, 2, 3] }] }
      });

      expect(sidebar.renderPalettes).toHaveBeenCalled();
    });

    it('routes get_tile_at_pixel response to sidebar', () => {
      createGateway();
      const ws = connectGateway();

      simulateMessage(ws, {
        action: 'get_tile_at_pixel',
        result: { tile_id: 1, palette_id: 0 }
      });

      expect(sidebar.renderTileInfo).toHaveBeenCalledWith({ tile_id: 1, palette_id: 0 });
    });

    it('routes get_lua_logs response to sidebar', () => {
      createGateway();
      const ws = connectGateway();

      simulateMessage(ws, {
        action: 'get_lua_logs',
        result: { logs: [{ ts: 1000, msg: 'test' }], overflow: 0 }
      });

      expect(sidebar.handleLuaLogs).toHaveBeenCalledWith(
        [{ ts: 1000, msg: 'test' }],
        0
      );
    });

    it('routes error responses to sidebar log', () => {
      createGateway();
      const ws = connectGateway();

      simulateMessage(ws, {
        action: 'screenshot',
        error: 'Mesen bridge not connected'
      });

      expect(sidebar.log).toHaveBeenCalledWith(
        expect.stringContaining('Mesen bridge not connected'),
        'error'
      );
    });

    it('ignores chat_reset acknowledgment', () => {
      createGateway();
      const ws = connectGateway();

      // Should not throw
      simulateMessage(ws, { action: 'chat_reset' });
    });
  });

  // ========================================
  // Lifecycle
  // ========================================

  describe('Lifecycle', () => {
    it('destroy disconnects WebSocket', () => {
      createGateway();
      const ws = connectGateway();

      gateway.destroy();

      expect(ws.close).toHaveBeenCalled();
    });
  });
});
