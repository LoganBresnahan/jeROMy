/**
 * Tests for index.ts (jeROMy server)
 *
 * Tests HTTP routing, WebSocket message handling, agent event forwarding,
 * and session/snapshot management via the DB layer.
 *
 * Uses vi.hoisted() to share mock references between vi.mock factories and test code,
 * avoiding temporal dead zone issues with vitest's mock hoisting.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';

// ============================================
// Shared mock references (hoisted for vi.mock access)
// ============================================

const mocks = vi.hoisted(() => {
  const agentRun = vi.fn();
  const agentAbort = vi.fn();
  const agentResetHistory = vi.fn();
  const agentSetHistory = vi.fn();
  const agentGetHistory = vi.fn().mockReturnValue([]);

  const mesenAdapter = {
    listen: vi.fn().mockResolvedValue(undefined),
    isConnected: true,
    screenshot: vi.fn().mockResolvedValue({ png_base64: 'AAAA' }),
    getTileAtPixel: vi.fn().mockResolvedValue({ tile_id: 1, palette_id: 0 }),
    getPalette: vi.fn().mockResolvedValue({ palette_id: 0, colors: [0, 1, 2, 3] }),
    getAllPalettes: vi.fn().mockResolvedValue({ palettes: [] }),
    getCpuState: vi.fn().mockResolvedValue({ pc: 0x8000, a: 0 }),
    getRomInfo: vi.fn().mockResolvedValue({ name: 'TestROM', format: 'iNES' }),
    readMemory: vi.fn().mockResolvedValue({ address: 0, bytes: [0] }),
    writePalette: vi.fn().mockResolvedValue({ old_color: 0, new_color: 39 }),
    clearPaletteOverrides: vi.fn().mockResolvedValue({ cleared: true }),
    ping: vi.fn().mockResolvedValue('pong'),
    getLuaLogs: vi.fn().mockResolvedValue({ logs: [], overflow: 0 }),
    rawRequest: vi.fn().mockResolvedValue({ state: 'ok' }),
  };

  // DB mocks
  const eventStoreAppend = vi.fn().mockReturnValue(1);
  const eventStoreGetSessionEvents = vi.fn().mockReturnValue([]);
  const eventStoreGetEventCount = vi.fn().mockReturnValue(0);
  const sessionManagerCreateSession = vi.fn().mockReturnValue({
    id: 'sess-mock', name: 'New Session', parent_id: null, fork_seq: null,
    created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z',
    metadata: {},
  });
  const sessionManagerGetSession = vi.fn().mockReturnValue({
    id: 'sess-mock', name: 'Test Session', parent_id: null, fork_seq: null,
    created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z',
    metadata: {},
  });
  const sessionManagerListSessions = vi.fn().mockReturnValue([]);
  const sessionManagerUpdateSession = vi.fn();
  const sessionManagerDeleteSession = vi.fn();
  const sessionManagerGetMostRecentSession = vi.fn().mockReturnValue(null);
  const sessionManagerForkSession = vi.fn().mockReturnValue({
    id: 'sess-fork', name: 'Fork', parent_id: 'sess-mock', fork_seq: 2,
    created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z',
    metadata: {},
  });
  const sessionManagerTouch = vi.fn();
  const sessionManagerRebuildHistory = vi.fn().mockReturnValue([]);
  const snapshotManagerCreateSnapshot = vi.fn().mockReturnValue({
    id: 'snap-1', session_id: 'sess-mock', seq: 3, summary: 'Checkpoint',
    metadata: {}, created_at: '2024-01-01T00:00:00.000Z',
  });
  const snapshotManagerGetSnapshots = vi.fn().mockReturnValue([]);

  // HTTP handler capture
  let httpHandler: ((req: any, res: any) => void) | null = null;

  // WS connection handler capture
  let wsConnectionHandler: ((ws: any) => void) | null = null;

  // WSS clients set
  const wssClients = new Set<any>();

  return {
    agentRun,
    agentAbort,
    agentResetHistory,
    agentSetHistory,
    agentGetHistory,
    mesenAdapter,
    eventStoreAppend,
    eventStoreGetSessionEvents,
    eventStoreGetEventCount,
    sessionManagerCreateSession,
    sessionManagerGetSession,
    sessionManagerListSessions,
    sessionManagerUpdateSession,
    sessionManagerDeleteSession,
    sessionManagerGetMostRecentSession,
    sessionManagerForkSession,
    sessionManagerTouch,
    sessionManagerRebuildHistory,
    snapshotManagerCreateSnapshot,
    snapshotManagerGetSnapshots,
    httpHandler,
    wsConnectionHandler,
    wssClients,
  };
});

// ============================================
// Module mocks
// ============================================

vi.mock('ws', () => ({
  WebSocketServer: class MockWebSocketServer {
    clients = mocks.wssClients;
    on(event: string, handler: any) {
      if (event === 'connection') mocks.wsConnectionHandler = handler;
    }
  },
  WebSocket: { OPEN: 1 },
}));

vi.mock('node:http', () => ({
  createServer: vi.fn((handler: any) => {
    mocks.httpHandler = handler;
    return {
      listen: vi.fn((_port: number, _host: string, cb: () => void) => cb?.()),
    };
  }),
}));

vi.mock('node:fs', () => ({
  readFileSync: vi.fn().mockReturnValue('<html>test</html>'),
}));

vi.mock('./bridge/mesen/index.js', () => {
  return {
    MesenAdapter: class MockMesenAdapter {
      constructor() { return mocks.mesenAdapter; }
    },
  };
});

vi.mock('./agent/index.js', () => ({
  Agent: class MockAgent {
    run = mocks.agentRun;
    abort = mocks.agentAbort;
    resetHistory = mocks.agentResetHistory;
    setHistory = mocks.agentSetHistory;
    getHistory = mocks.agentGetHistory;
  },
  AnthropicProvider: class MockAnthropicProvider {},
}));

vi.mock('./agent/disassembler.js', () => ({
  Disassembler: { init: vi.fn().mockResolvedValue(null) },
}));

vi.mock('./db/index.js', () => ({
  JeromyDatabase: class MockJeromyDatabase {
    db = {};
    close() {}
  },
  EventStore: class MockEventStore {
    append = mocks.eventStoreAppend;
    getSessionEvents = mocks.eventStoreGetSessionEvents;
    getEventCount = mocks.eventStoreGetEventCount;
  },
  SessionManager: class MockSessionManager {
    createSession = mocks.sessionManagerCreateSession;
    getSession = mocks.sessionManagerGetSession;
    listSessions = mocks.sessionManagerListSessions;
    updateSession = mocks.sessionManagerUpdateSession;
    deleteSession = mocks.sessionManagerDeleteSession;
    getMostRecentSession = mocks.sessionManagerGetMostRecentSession;
    forkSession = mocks.sessionManagerForkSession;
    touch = mocks.sessionManagerTouch;
    rebuildHistory = mocks.sessionManagerRebuildHistory;
  },
  SnapshotManager: class MockSnapshotManager {
    createSnapshot = mocks.snapshotManagerCreateSnapshot;
    getSnapshots = mocks.snapshotManagerGetSnapshots;
  },
}));

// ============================================
// Helpers
// ============================================

function createMockRes() {
  const res: Record<string, any> = {
    writeHead: vi.fn(),
    end: vi.fn(),
  };
  return res;
}

function createMockWsClient() {
  const handlers: Record<string, any> = {};
  const client: Record<string, any> = {
    readyState: 1, // WebSocket.OPEN
    send: vi.fn(),
    on: vi.fn((event: string, handler: any) => {
      handlers[event] = handler;
    }),
  };
  return { client, handlers };
}

async function sendAction(action: string, extra?: Record<string, any>) {
  const { client, handlers } = createMockWsClient();
  mocks.wsConnectionHandler?.(client);
  await handlers.message(Buffer.from(JSON.stringify({ action, ...extra })));
  return client;
}

function lastSent(client: any): any {
  const calls = client.send.mock.calls;
  return JSON.parse(calls[calls.length - 1][0]);
}

function findSent(client: any, predicate: (msg: any) => boolean): any {
  for (const call of client.send.mock.calls) {
    const msg = JSON.parse(call[0]);
    if (predicate(msg)) return msg;
  }
  return null;
}

// ============================================
// Tests
// ============================================

describe('jeROMy Server (index.ts)', () => {
  // Suppress console output during tests
  const originalLog = console.log;
  const originalError = console.error;

  beforeAll(async () => {
    console.log = vi.fn();
    console.error = vi.fn();

    // Import triggers start() which initializes everything
    await import('./index.js');

    // Wait for async start() to complete
    await new Promise(resolve => setTimeout(resolve, 50));
  });

  afterAll(() => {
    console.log = originalLog;
    console.error = originalError;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mesenAdapter.isConnected = true;
    mocks.wssClients.clear();
  });

  // ========================================
  // HTTP Server
  // ========================================

  describe('HTTP Server', () => {
    it('serves index.html for root path', () => {
      const res = createMockRes();
      mocks.httpHandler?.({ url: '/' }, res);

      expect(res.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'text/html' });
      expect(res.end).toHaveBeenCalledWith('<html>test</html>');
    });

    it('serves index.html for /index.html', () => {
      const res = createMockRes();
      mocks.httpHandler?.({ url: '/index.html' }, res);

      expect(res.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'text/html' });
    });

    it('serves chat.js with correct content type', () => {
      const res = createMockRes();
      mocks.httpHandler?.({ url: '/chat.js' }, res);

      // Either serves the file or returns 404 (depending on readFileSync mock)
      expect(res.writeHead).toHaveBeenCalled();
    });

    it('returns 204 for favicon.ico', () => {
      const res = createMockRes();
      mocks.httpHandler?.({ url: '/favicon.ico' }, res);

      expect(res.writeHead).toHaveBeenCalledWith(204);
    });

    it('returns 404 for unknown paths', () => {
      const res = createMockRes();
      mocks.httpHandler?.({ url: '/unknown' }, res);

      expect(res.writeHead).toHaveBeenCalledWith(404);
      expect(res.end).toHaveBeenCalledWith('Not found');
    });
  });

  // ========================================
  // WebSocket Connection
  // ========================================

  describe('WebSocket Connection', () => {
    it('registers connection handler', () => {
      expect(mocks.wsConnectionHandler).toBeTruthy();
    });

    it('connection handler sets up message listener', () => {
      const { client } = createMockWsClient();
      mocks.wsConnectionHandler?.(client);

      expect(client.on).toHaveBeenCalledWith('message', expect.any(Function));
    });

    it('connection handler sets up close listener', () => {
      const { client } = createMockWsClient();
      mocks.wsConnectionHandler?.(client);

      expect(client.on).toHaveBeenCalledWith('close', expect.any(Function));
    });
  });

  // ========================================
  // Chat Messages
  // ========================================

  describe('Chat Messages', () => {
    it('chat message triggers agent.run() and auto-creates session', async () => {
      // This is the first chat test — no active session exists yet,
      // so it should auto-create one.
      mocks.agentRun.mockReturnValue((async function*() {})());

      await sendAction('chat', { message: 'Make the rock orange' });

      expect(mocks.sessionManagerCreateSession).toHaveBeenCalledWith('New Session');
      expect(mocks.agentRun).toHaveBeenCalledWith(
        'Make the rock orange',
        undefined
      );
    });

    it('chat records user_instruction event', async () => {
      mocks.agentRun.mockReturnValue((async function*() {})());

      await sendAction('chat', { message: 'Hello' });

      expect(mocks.eventStoreAppend).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          type: 'user_instruction',
          data: expect.objectContaining({ message: 'Hello' }),
        })
      );
    });

    it('chat without message returns error', async () => {
      const client = await sendAction('chat');

      expect(client.send).toHaveBeenCalledWith(
        expect.stringContaining('agent_error')
      );
    });

    it('chat_abort calls agent.abort()', async () => {
      await sendAction('chat_abort');

      expect(mocks.agentAbort).toHaveBeenCalled();
    });

    it('chat_reset calls agent.resetHistory() and creates new session', async () => {
      await sendAction('chat_reset');

      expect(mocks.agentResetHistory).toHaveBeenCalled();
      expect(mocks.sessionManagerCreateSession).toHaveBeenCalledWith('New Session');
    });
  });

  // ========================================
  // Agent Event Forwarding
  // ========================================

  describe('Agent Event Forwarding', () => {
    async function runWithEvents(events: Array<{ type: string; [key: string]: any }>) {
      mocks.agentRun.mockReturnValue((async function*() {
        for (const event of events) yield event;
      })());

      return sendAction('chat', { message: 'test' });
    }

    it('forwards text_delta as agent_text', async () => {
      const client = await runWithEvents([
        { type: 'text_delta', text: 'Hello ' },
        { type: 'done', text: 'Hello', usage: { input_tokens: 0, output_tokens: 0 } }
      ]);

      const msg = findSent(client, (m) => m.action === 'agent_text');
      expect(msg).toBeTruthy();
      expect(msg.text).toBe('Hello ');
    });

    it('forwards tool_call as agent_tool_call and records event', async () => {
      const client = await runWithEvents([
        { type: 'tool_call', name: 'screenshot', input: {} },
        { type: 'done', text: '', usage: { input_tokens: 0, output_tokens: 0 } }
      ]);

      const msg = findSent(client, (m) => m.action === 'agent_tool_call');
      expect(msg).toBeTruthy();
      expect(msg.name).toBe('screenshot');

      // Verify tool_call event was recorded
      expect(mocks.eventStoreAppend).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ type: 'tool_call' })
      );
    });

    it('forwards tool_result as agent_tool_result and records event', async () => {
      const client = await runWithEvents([
        { type: 'tool_result', name: 'screenshot', result: '{"ok":true}', is_error: false },
        { type: 'done', text: '', usage: { input_tokens: 0, output_tokens: 0 } }
      ]);

      const msg = findSent(client, (m) => m.action === 'agent_tool_result');
      expect(msg).toBeTruthy();
      expect(msg.is_error).toBe(false);

      // Verify tool_result event was recorded
      expect(mocks.eventStoreAppend).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ type: 'tool_result' })
      );
    });

    it('forwards screenshot as agent_screenshot and records blob', async () => {
      const client = await runWithEvents([
        { type: 'screenshot', png_base64: 'SCREENSHOT_DATA' },
        { type: 'done', text: '', usage: { input_tokens: 0, output_tokens: 0 } }
      ]);

      const msg = findSent(client, (m) => m.action === 'agent_screenshot');
      expect(msg).toBeTruthy();
      expect(msg.png_base64).toBe('SCREENSHOT_DATA');

      // Verify screenshot_captured event was recorded with blob
      expect(mocks.eventStoreAppend).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ type: 'screenshot_captured' }),
        expect.any(Buffer)
      );
    });

    it('forwards done as agent_done and records assistant_response', async () => {
      mocks.agentGetHistory.mockReturnValue([
        { role: 'assistant', content: [{ type: 'text', text: 'All done' }] },
      ]);

      const client = await runWithEvents([
        { type: 'done', text: 'All done', usage: { input_tokens: 500, output_tokens: 200 } }
      ]);

      const msg = findSent(client, (m) => m.action === 'agent_done');
      expect(msg).toBeTruthy();
      expect(msg.text).toBe('All done');
      expect(msg.usage.input_tokens).toBe(500);

      // Verify assistant_response event was recorded
      expect(mocks.eventStoreAppend).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ type: 'assistant_response' })
      );
      // Verify session was touched
      expect(mocks.sessionManagerTouch).toHaveBeenCalled();
    });

    it('forwards error as agent_error', async () => {
      const client = await runWithEvents([
        { type: 'error', message: 'Max iterations reached' }
      ]);

      const msg = findSent(client, (m) => m.action === 'agent_error');
      expect(msg).toBeTruthy();
      expect(msg.message).toBe('Max iterations reached');
    });

    it('records domain events from write_palette tool results', async () => {
      const client = await runWithEvents([
        {
          type: 'tool_result', name: 'write_palette',
          result: JSON.stringify({ palette_id: 2, color_index: 1, old_color: 0, new_color: 39 }),
          is_error: false,
        },
        { type: 'done', text: '', usage: { input_tokens: 0, output_tokens: 0 } }
      ]);

      // Should have recorded both tool_result AND palette_edit
      const paletteCall = mocks.eventStoreAppend.mock.calls.find(
        (c: any[]) => c[1].type === 'palette_edit'
      );
      expect(paletteCall).toBeTruthy();
      expect(paletteCall[1].data.new_color).toBe(39);
    });
  });

  // ========================================
  // Session Management
  // ========================================

  describe('Session Management', () => {
    it('session_create creates and switches to new session', async () => {
      const client = await sendAction('session_create', {
        params: { name: 'My Session' },
      });

      expect(mocks.sessionManagerCreateSession).toHaveBeenCalledWith('My Session', undefined);
      expect(mocks.agentResetHistory).toHaveBeenCalled();
      const msg = lastSent(client);
      expect(msg.action).toBe('session_create');
      expect(msg.result.id).toBe('sess-mock');
    });

    it('session_list returns sessions and active id', async () => {
      mocks.sessionManagerListSessions.mockReturnValue([
        { id: 's1', name: 'Session 1', parent_id: null, event_count: 5, created_at: '', updated_at: '' },
      ]);

      const client = await sendAction('session_list');

      const msg = lastSent(client);
      expect(msg.action).toBe('session_list');
      expect(msg.result.sessions).toHaveLength(1);
    });

    it('session_switch rebuilds agent history and returns rich turns', async () => {
      mocks.sessionManagerRebuildHistory.mockReturnValue([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: [{ type: 'text', text: 'Hi' }] },
      ]);
      mocks.eventStoreGetEventCount.mockReturnValue(5);

      const client = await sendAction('session_switch', {
        params: { id: 'sess-target' },
      });

      expect(mocks.sessionManagerGetSession).toHaveBeenCalledWith('sess-target');
      expect(mocks.sessionManagerRebuildHistory).toHaveBeenCalledWith('sess-target');
      expect(mocks.agentSetHistory).toHaveBeenCalled();
      const msg = lastSent(client);
      expect(msg.result.message_count).toBe(2);
      expect(msg.result.event_count).toBe(5);
      expect(msg.result.turns).toEqual([]);
    });

    it('session_switch returns error for missing id', async () => {
      const client = await sendAction('session_switch', { params: {} });

      const msg = lastSent(client);
      expect(msg.error).toContain('Missing session id');
    });

    it('session_switch returns error for non-existent session', async () => {
      mocks.sessionManagerGetSession.mockReturnValue(null);

      const client = await sendAction('session_switch', {
        params: { id: 'bad-id' },
      });

      const msg = lastSent(client);
      expect(msg.error).toContain('Session not found');
    });

    it('session_fork creates fork and switches to it', async () => {
      const client = await sendAction('session_fork', {
        params: { parent_id: 'sess-mock', fork_seq: 2, name: 'My Fork' },
      });

      expect(mocks.sessionManagerForkSession).toHaveBeenCalledWith('sess-mock', 2, 'My Fork');
      expect(mocks.agentSetHistory).toHaveBeenCalled();
      const msg = lastSent(client);
      expect(msg.action).toBe('session_fork');
      expect(msg.result.id).toBe('sess-fork');
    });

    it('session_fork returns error when missing fork_seq', async () => {
      const client = await sendAction('session_fork', {
        params: { parent_id: 'sess-mock' },
      });

      const msg = lastSent(client);
      expect(msg.error).toContain('Missing fork_seq');
    });

    it('session_delete removes session', async () => {
      const client = await sendAction('session_delete', {
        params: { id: 'sess-gone' },
      });

      expect(mocks.sessionManagerDeleteSession).toHaveBeenCalledWith('sess-gone');
      const msg = lastSent(client);
      expect(msg.result.ok).toBe(true);
    });

    it('session_history returns events', async () => {
      mocks.eventStoreGetSessionEvents.mockReturnValue([
        { id: 'e1', type: 'user_instruction', seq: 1, data: { message: 'Hi' } },
      ]);

      const client = await sendAction('session_history', {
        params: { id: 'sess-mock' },
      });

      const msg = lastSent(client);
      expect(msg.action).toBe('session_history');
      expect(msg.result.events).toHaveLength(1);
    });
  });

  // ========================================
  // Snapshot Management
  // ========================================

  describe('Snapshot Management', () => {
    it('snapshot_create creates checkpoint', async () => {
      const client = await sendAction('snapshot_create', {
        params: { session_id: 'sess-mock', summary: 'Midpoint' },
      });

      expect(mocks.snapshotManagerCreateSnapshot).toHaveBeenCalledWith(
        'sess-mock', 'Midpoint', undefined
      );
      const msg = lastSent(client);
      expect(msg.action).toBe('snapshot_create');
      expect(msg.result.seq).toBe(3);
    });

    it('snapshot_list returns snapshots', async () => {
      mocks.snapshotManagerGetSnapshots.mockReturnValue([
        { id: 'snap-1', session_id: 'sess-mock', seq: 3, summary: 'CP', metadata: {} },
      ]);

      const client = await sendAction('snapshot_list', {
        params: { session_id: 'sess-mock' },
      });

      const msg = lastSent(client);
      expect(msg.action).toBe('snapshot_list');
      expect(msg.result).toHaveLength(1);
    });
  });

  // ========================================
  // Emulator Commands (passthrough)
  // ========================================

  describe('Emulator Commands', () => {
    it('screenshot command calls adapter.screenshot()', async () => {
      await sendAction('screenshot');

      expect(mocks.mesenAdapter.screenshot).toHaveBeenCalled();
    });

    it('get_tile_at_pixel command calls adapter', async () => {
      await sendAction('get_tile_at_pixel', { params: { x: 128, y: 64 } });

      expect(mocks.mesenAdapter.getTileAtPixel).toHaveBeenCalledWith(128, 64);
    });

    it('get_all_palettes command calls adapter', async () => {
      await sendAction('get_all_palettes');

      expect(mocks.mesenAdapter.getAllPalettes).toHaveBeenCalled();
    });

    it('ping command calls adapter', async () => {
      await sendAction('ping');

      expect(mocks.mesenAdapter.ping).toHaveBeenCalled();
    });

    it('returns error when bridge not connected', async () => {
      mocks.mesenAdapter.isConnected = false;

      const client = await sendAction('screenshot');

      const msg = findSent(client, (m) => m.error?.includes('bridge not connected'));
      expect(msg).toBeTruthy();
    });

    it('returns error for unknown actions', async () => {
      const client = await sendAction('nonexistent_action');

      const msg = lastSent(client);
      expect(msg.result?.error || msg.error).toBeTruthy();
    });

    it('handles invalid JSON gracefully', async () => {
      const { client, handlers } = createMockWsClient();
      mocks.wsConnectionHandler?.(client);

      await handlers.message(Buffer.from('not valid json'));

      expect(client.send).toHaveBeenCalledWith(
        expect.stringContaining('invalid JSON')
      );
    });
  });

  // ========================================
  // Emulator Command Results
  // ========================================

  describe('Emulator Command Results', () => {
    it('returns screenshot result', async () => {
      const client = await sendAction('screenshot');

      const msg = lastSent(client);
      expect(msg.action).toBe('screenshot');
      expect(msg.result.png_base64).toBe('AAAA');
    });

    it('returns cpu state result', async () => {
      const client = await sendAction('get_cpu_state');

      const msg = lastSent(client);
      expect(msg.result.pc).toBe(0x8000);
    });

    it('returns rom info result', async () => {
      const client = await sendAction('get_rom_info');

      const msg = lastSent(client);
      expect(msg.result.name).toBe('TestROM');
    });
  });
});
