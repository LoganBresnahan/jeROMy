/**
 * GatewayActor
 *
 * Connects to the jeROMy WebSocket server and routes messages between
 * the browser UI and the backend agent/emulator.
 *
 * Key responsibilities:
 * - WebSocket lifecycle (connect, reconnect, send)
 * - Route agent events → VirtualListActor (with interleaving coordination)
 * - Route emulator responses → EmulatorSidebar
 * - Manage streaming turn lifecycle (start turn, finalize segments, end turn)
 *
 * Interleaving coordination (ported from Moby's handleStreamToken):
 * - Accumulates text tokens in _segmentContent
 * - On tool_call: finalizeCurrentSegment(), strips incomplete code fences,
 *   saves fence carry-forward for the next text segment
 * - After tool, on next text: needsNewSegment() → resumeWithNewSegment()
 *   with fence carry-forward prepended
 *
 * Publications:
 * - gateway.connected: boolean — WebSocket connection status
 * - gateway.streaming: boolean — whether the agent is currently streaming
 */

import { EventStateActor } from '../../state/EventStateActor.js';
import { EventStateManager } from '../../state/EventStateManager.js';
import { VirtualListActor } from '../virtual-list/VirtualListActor.js';
import { hasIncompleteFence } from '../../utils/codeBlocks.js';
import { uniqueId } from '../../utils/uniqueId.js';
import type { EmulatorSidebar } from '../sidebar/EmulatorSidebar.js';
import type { SessionPanel } from '../sidebar/SessionPanel.js';
import type { ActorConfig } from '../../state/types.js';

// ============================================
// Rich Turn (returned by server for history load)
// ============================================

interface RichTurn {
  role: 'user' | 'assistant';
  text: string;
  hasImages?: boolean;
  tools?: Array<{
    name: string;
    detail: string;
    result: string;
    isError: boolean;
  }>;
  usage?: { input_tokens: number; output_tokens: number };
}

// ============================================
// Configuration
// ============================================

export interface GatewayConfig {
  manager: EventStateManager;
  element: HTMLElement;
  virtualList: VirtualListActor;
  sidebar: EmulatorSidebar;
}

// ============================================
// WS Message Types
// ============================================

interface WsMessage {
  action: string;
  [key: string]: unknown;
}

// ============================================
// Gateway Actor
// ============================================

export class GatewayActor extends EventStateActor {
  private virtualList: VirtualListActor;
  private sidebar: EmulatorSidebar;
  private sessionPanel: SessionPanel | null = null;

  // ============================================
  // WebSocket State
  // ============================================

  private ws: WebSocket | null = null;
  private _wsUrl: string | null = null;
  private _connected = false;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _reconnectDelay = 2000;

  // ============================================
  // Streaming / Interleaving State
  // ============================================

  /** The currently active assistant turn ID (null when idle) */
  private _currentTurnId: string | null = null;

  /** Accumulated text for the current text segment */
  private _segmentContent = '';

  /** Whether we're in an active streaming turn */
  private _isStreaming = false;

  /** Current tool batch tracking: batch ID from VirtualList */
  private _currentBatchId: string | null = null;

  /** Index of the current tool within the active batch */
  private _currentToolIndex = -1;

  /** Fence carry-forward: incomplete code fence from finalized segment */
  private _pendingFenceCarry = '';

  /** Turn counter for generating unique turn IDs */
  private _turnCounter = 0;

  /** Whether the initial session history has been loaded after connect */
  private _initialLoadDone = false;

  // ============================================
  // Constructor
  // ============================================

  constructor(config: GatewayConfig) {
    const actorConfig: ActorConfig = {
      manager: config.manager,
      element: config.element,
      publications: {
        'gateway.connected': () => this._connected,
        'gateway.streaming': () => this._isStreaming,
      },
      subscriptions: {},
      enableDOMChangeDetection: false,
    };

    super(actorConfig);

    this.virtualList = config.virtualList;
    this.sidebar = config.sidebar;
  }

  // ============================================
  // WebSocket Lifecycle
  // ============================================

  connect(url: string): void {
    this._wsUrl = url;
    this._createConnection();
  }

  disconnect(): void {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._setConnected(false);
  }

  private _createConnection(): void {
    if (!this._wsUrl) return;

    try {
      this.ws = new WebSocket(this._wsUrl);
    } catch {
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this._setConnected(true);
      this._initialLoadDone = false;
      this.sidebar.log('Connected to jeROMy server', 'success');
      this.requestSessionList();
    };

    this.ws.onclose = () => {
      this._setConnected(false);
      this.sidebar.log('Disconnected — retrying in 2s...', 'error');
      this._scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror
    };

    this.ws.onmessage = (e: MessageEvent) => {
      try {
        const msg: WsMessage = JSON.parse(e.data as string);
        this._handleMessage(msg);
      } catch {
        console.error('[Gateway] Failed to parse WS message');
      }
    };
  }

  private _scheduleReconnect(): void {
    if (this._reconnectTimer) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._createConnection();
    }, this._reconnectDelay);
  }

  private _setConnected(connected: boolean): void {
    if (this._connected !== connected) {
      this._connected = connected;
      this.publish({ 'gateway.connected': connected });
      this.sidebar.setConnected(connected);
    }
  }

  // ============================================
  // Outbound API (browser → server)
  // ============================================

  /** Send a raw WS message. */
  send(action: string, params?: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.sidebar.log('Not connected', 'error');
      return;
    }
    this.ws.send(JSON.stringify({ action, params }));
  }

  /** Send a chat message to the agent. */
  sendChat(message: string, images?: Array<{ data: string; media_type: string }>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.sidebar.log('Not connected', 'error');
      return;
    }

    const payload: Record<string, unknown> = { action: 'chat', message };
    if (images && images.length > 0) {
      payload.images = images;
    }
    this.ws.send(JSON.stringify(payload));

    // Add user turn to the virtual list
    this._addUserTurn(message, !!(images && images.length > 0));

    // Mark as streaming (agent will respond)
    this._setStreaming(true);
  }

  /** Abort the currently running agent. */
  abortChat(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'chat_abort' }));
    }
    this._endCurrentTurn();
  }

  /** Reset the conversation history and start a new session. */
  resetChat(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'chat_reset' }));
    }
    this._endCurrentTurn();
    this._turnCounter = 0;
    this.virtualList.clear();
    this.sidebar.log('Chat history cleared', 'info');
  }

  // ============================================
  // Inbound Message Router
  // ============================================

  private _handleMessage(msg: WsMessage): void {
    const action = msg.action as string;

    // Agent events
    if (action.startsWith('agent_')) {
      this._handleAgentEvent(msg);
      return;
    }

    // Server log → sidebar
    if (action === 'server_log') {
      const level = (msg.level as string) || 'info';
      const text = msg.text as string;
      this.sidebar.log(`[server] ${text}`, level);
      return;
    }

    // Chat reset acknowledgment — refresh session list since server created a new session
    if (action === 'chat_reset') {
      this.requestSessionList();
      return;
    }

    // Session responses
    if (action === 'session_list') {
      const result = msg.result as { sessions: any[]; active_session_id: string | null };
      this.sessionPanel?.renderSessions(result.sessions, result.active_session_id);

      // On initial connect, load the active session's history into the chat
      if (!this._initialLoadDone && result.active_session_id) {
        this._initialLoadDone = true;
        this.switchToSession(result.active_session_id);
      }
      return;
    }

    if (action === 'session_switch') {
      if (msg.error) {
        this.sidebar.log(`Session switch failed: ${msg.error}`, 'error');
        return;
      }
      const result = msg.result as { session: any; turns: RichTurn[]; event_count: number };
      this._loadHistory(result.turns ?? []);
      this.requestSessionList();
      this.sidebar.log(`Switched to "${result.session.name}"`, 'success');
      return;
    }

    if (action === 'session_create') {
      if (msg.error) {
        this.sidebar.log(`Session create failed: ${msg.error}`, 'error');
        return;
      }
      // Clear chat for the new empty session
      this.virtualList.clear();
      this._endCurrentTurn();
      this._turnCounter = 0;
      this.requestSessionList();
      this.sidebar.log(`Created session "${(msg.result as any).name}"`, 'success');
      return;
    }

    if (action === 'session_fork') {
      if (msg.error) {
        this.sidebar.log(`Fork failed: ${msg.error}`, 'error');
        return;
      }
      // Fork at latest seq — chat stays the same, just update session list
      this.requestSessionList();
      this.sidebar.log(`Forked → "${(msg.result as any).name}"`, 'success');
      return;
    }

    if (action === 'session_delete') {
      if (msg.error) {
        this.sidebar.log(`Delete failed: ${msg.error}`, 'error');
        return;
      }
      const result = msg.result as { ok: boolean; was_active: boolean };
      if (result.was_active) {
        this.virtualList.clear();
        this._endCurrentTurn();
        this._turnCounter = 0;
      }
      this.requestSessionList();
      this.sidebar.log('Session deleted', 'info');
      return;
    }

    if (action === 'snapshot_create' || action === 'snapshot_list' ||
        action === 'session_history') {
      // These are data responses — log to sidebar for now
      this.sidebar.log(`[${action}] ${JSON.stringify(msg.result).slice(0, 200)}`, 'info');
      return;
    }

    // Error responses
    if (msg.error) {
      this.sidebar.log(`Error [${action}]: ${msg.error}`, 'error');
      return;
    }

    // Emulator responses → sidebar
    switch (action) {
      case 'screenshot':
        this.sidebar.renderScreenshot((msg.result as { png_base64: string }).png_base64);
        break;
      case 'get_all_palettes':
        this.sidebar.renderPalettes((msg.result as { palettes: unknown[] }).palettes);
        break;
      case 'get_tile_at_pixel':
        this.sidebar.renderTileInfo(msg.result as Record<string, unknown>);
        this.sidebar.log(`[tile] ${JSON.stringify(msg.result)}`, 'info');
        break;
      case 'get_lua_logs': {
        const luaResult = msg.result as { logs: Array<{ ts: number; msg: string }>; overflow?: number };
        this.sidebar.handleLuaLogs(luaResult.logs, luaResult.overflow);
        break;
      }
      default:
        this.sidebar.log(`[${action}] ${JSON.stringify(msg.result, null, 2)}`, 'info');
    }
  }

  // ============================================
  // Agent Event Handlers (interleaving coordination)
  // ============================================

  private _handleAgentEvent(msg: WsMessage): void {
    switch (msg.action) {
      case 'agent_text':
        this._handleAgentText(msg.text as string);
        break;
      case 'agent_tool_call':
        this._handleAgentToolCall(
          msg.name as string,
          msg.input as Record<string, unknown>
        );
        break;
      case 'agent_tool_result':
        this._handleAgentToolResult(
          msg.name as string,
          msg.result as string,
          msg.is_error as boolean
        );
        break;
      case 'agent_screenshot':
        this._handleAgentScreenshot(msg.png_base64 as string);
        break;
      case 'agent_done':
        this._handleAgentDone(
          msg.text as string,
          msg.usage as { input_tokens: number; output_tokens: number }
        );
        break;
      case 'agent_error':
        this._handleAgentError(msg.message as string);
        break;
    }
  }

  /**
   * Handle streaming text from the agent.
   *
   * - Lazy-creates the assistant turn if needed
   * - Completes any active tool batch
   * - Resumes with a new text segment if needed (after interleaving)
   * - Accumulates text and updates the virtual list
   */
  private _handleAgentText(text: string): void {
    // Ensure we have an assistant turn
    if (!this._currentTurnId) {
      this._startAssistantTurn();
    }

    const turnId = this._currentTurnId!;

    // If there's an active tool batch, complete it before resuming text
    if (this._currentBatchId) {
      this.virtualList.completeCurrentToolBatch(turnId);
      this._currentBatchId = null;
      this._currentToolIndex = -1;
    }

    // Check if we need a new text segment (after interleaving with tools/screenshots)
    const actor = this.virtualList.getBoundActor(turnId);
    if (actor?.needsNewSegment()) {
      this.virtualList.resumeWithNewSegment(turnId);

      // Apply fence carry-forward from the previously finalized segment
      if (this._pendingFenceCarry) {
        this._segmentContent = this._pendingFenceCarry;
        this._pendingFenceCarry = '';
      } else {
        this._segmentContent = '';
      }
    }

    // Accumulate text
    this._segmentContent += text;

    // Update the virtual list (lazy-creates segment if first text)
    this.virtualList.updateTextContent(turnId, this._segmentContent);
  }

  /**
   * Handle a tool call from the agent.
   *
   * - Finalizes any active text segment (strips incomplete code fences)
   * - Saves fence carry-forward state
   * - Starts a new tool batch or adds to existing batch
   */
  private _handleAgentToolCall(name: string, input: Record<string, unknown>): void {
    if (!this._currentTurnId) {
      this._startAssistantTurn();
    }

    const turnId = this._currentTurnId!;

    // Finalize current text segment if we have accumulated text
    if (this._segmentContent) {
      // Save fence carry-forward before finalizing
      const fenceState = hasIncompleteFence(this._segmentContent);
      if (fenceState.incomplete) {
        this._pendingFenceCarry = this._segmentContent.substring(fenceState.lastOpenIndex);
      } else {
        this._pendingFenceCarry = '';
      }

      this.virtualList.finalizeCurrentSegment(turnId);
    }

    // Build detail string from input params
    const detail = Object.entries(input)
      .slice(0, 3)
      .map(([k, v]) => {
        const val = typeof v === 'string'
          ? (v.length > 40 ? v.substring(0, 40) + '...' : v)
          : JSON.stringify(v);
        return `${k}: ${val}`;
      })
      .join(', ');

    // Start a new batch or add to existing
    if (!this._currentBatchId) {
      this._currentBatchId = this.virtualList.startToolBatch(turnId, [
        { name, detail },
      ]);
      this._currentToolIndex = 0;
    } else {
      this._currentToolIndex = this.virtualList.addToolToCurrentBatch(
        turnId,
        name,
        detail
      );
    }
  }

  /**
   * Handle a tool result from the agent.
   *
   * - Marks the tool as done (or error) in the current batch
   * - Adds the tool result as a content block
   */
  private _handleAgentToolResult(name: string, result: string, isError: boolean): void {
    if (!this._currentTurnId) return;

    const turnId = this._currentTurnId;

    // Mark tool as done in the batch
    if (this._currentBatchId && this._currentToolIndex >= 0) {
      this.virtualList.updateToolInCurrentBatch(
        turnId,
        this._currentToolIndex,
        isError ? 'error' : 'done'
      );
    }

    // Add the result as a content block
    this.virtualList.addToolResult(turnId, name, result, isError);
  }

  /**
   * Handle an inline screenshot from the agent.
   *
   * - Finalizes current text segment if needed
   * - Adds screenshot to the turn
   * - Also updates the emulator sidebar canvas
   */
  private _handleAgentScreenshot(base64: string): void {
    if (!this._currentTurnId) return;

    const turnId = this._currentTurnId;

    // Finalize text segment if we have accumulated text
    if (this._segmentContent && !this._currentBatchId) {
      const fenceState = hasIncompleteFence(this._segmentContent);
      if (fenceState.incomplete) {
        this._pendingFenceCarry = this._segmentContent.substring(fenceState.lastOpenIndex);
      } else {
        this._pendingFenceCarry = '';
      }
      this.virtualList.finalizeCurrentSegment(turnId);
    }

    // If there's an active batch, complete it first
    if (this._currentBatchId) {
      this.virtualList.completeCurrentToolBatch(turnId);
      this._currentBatchId = null;
      this._currentToolIndex = -1;
    }

    this.virtualList.addScreenshot(turnId, base64);

    // Also update the emulator sidebar
    this.sidebar.renderScreenshot(base64);
  }

  /**
   * Handle agent completion.
   *
   * - Completes any active tool batch
   * - Ends the streaming turn
   * - Adds usage stats
   */
  private _handleAgentDone(
    _text: string,
    usage: { input_tokens: number; output_tokens: number }
  ): void {
    if (!this._currentTurnId) return;

    const turnId = this._currentTurnId;

    // Complete any active tool batch
    if (this._currentBatchId) {
      this.virtualList.completeCurrentToolBatch(turnId);
      this._currentBatchId = null;
      this._currentToolIndex = -1;
    }

    // End streaming and add usage stats
    this.virtualList.endStreamingTurn();

    if (usage) {
      this.virtualList.addUsageStats(turnId, usage.input_tokens, usage.output_tokens);
    }

    this._endCurrentTurn();

    // Refresh session list (event count changed)
    this.requestSessionList();
  }

  /**
   * Handle agent error.
   *
   * - Completes any active tool batch
   * - Adds error message to turn
   * - Ends the streaming turn
   */
  private _handleAgentError(message: string): void {
    const turnId = this._currentTurnId;

    if (turnId) {
      // Complete any active tool batch
      if (this._currentBatchId) {
        this.virtualList.completeCurrentToolBatch(turnId);
        this._currentBatchId = null;
        this._currentToolIndex = -1;
      }

      this.virtualList.addError(turnId, message);
      this.virtualList.endStreamingTurn();
    }

    this._endCurrentTurn();
  }

  // ============================================
  // Turn Lifecycle Helpers
  // ============================================

  private _addUserTurn(message: string, hasImages: boolean): void {
    this._turnCounter++;
    const turnId = `user-${this._turnCounter}-${uniqueId()}`;

    this.virtualList.addTurn(turnId, 'user');
    this.virtualList.addTextSegment(
      turnId,
      hasImages ? `${message}\n[attached screenshot]` : message
    );
  }

  private _startAssistantTurn(): void {
    this._turnCounter++;
    const turnId = `assistant-${this._turnCounter}-${uniqueId()}`;

    this.virtualList.addTurn(turnId, 'assistant');
    this.virtualList.startStreamingTurn(turnId);

    this._currentTurnId = turnId;
    this._segmentContent = '';
    this._pendingFenceCarry = '';
    this._currentBatchId = null;
    this._currentToolIndex = -1;
  }

  private _endCurrentTurn(): void {
    this._currentTurnId = null;
    this._segmentContent = '';
    this._pendingFenceCarry = '';
    this._currentBatchId = null;
    this._currentToolIndex = -1;
    this._setStreaming(false);
  }

  private _setStreaming(streaming: boolean): void {
    if (this._isStreaming !== streaming) {
      this._isStreaming = streaming;
      this.publish({ 'gateway.streaming': streaming });
    }
  }

  // ============================================
  // Session Management
  // ============================================

  /** Wire up the session panel for rendering session list updates. */
  setSessionPanel(panel: SessionPanel): void {
    this.sessionPanel = panel;
  }

  /** Request the session list from the server. */
  requestSessionList(): void {
    this.send('session_list');
  }

  /** Create a new session and switch to it. */
  createSession(name: string): void {
    this.send('session_create', { name });
  }

  /** Switch to a different session (loads history into the chat). */
  switchToSession(id: string): void {
    this.send('session_switch', { id });
  }

  /** Fork the current session and switch to the fork. */
  forkCurrentSession(name: string, forkSeq: number): void {
    this.send('session_fork', { fork_seq: forkSeq, name });
  }

  /** Delete a session. */
  deleteSession(id: string): void {
    this.send('session_delete', { id });
  }

  // ============================================
  // History Loading (session switch)
  // ============================================

  /**
   * Load rich turns into the virtual list (used after session switch).
   * Clears the existing chat and rebuilds all turns from the server-provided data.
   */
  private _loadHistory(turns: RichTurn[]): void {
    this.virtualList.clear();
    this._endCurrentTurn();
    this._turnCounter = 0;

    for (const turn of turns) {
      this._turnCounter++;
      const turnId = `${turn.role}-${this._turnCounter}-${uniqueId()}`;

      this.virtualList.addTurn(turnId, turn.role);

      if (turn.role === 'user') {
        const text = turn.hasImages ? `${turn.text}\n[attached screenshot]` : turn.text;
        this.virtualList.addTextSegment(turnId, text);
      } else {
        // Assistant turn: tools → tool results → text → usage
        if (turn.tools && turn.tools.length > 0) {
          this.virtualList.startToolBatch(
            turnId,
            turn.tools.map((t) => ({ name: t.name, detail: t.detail }))
          );
          turn.tools.forEach((t, i) => {
            this.virtualList.updateToolInCurrentBatch(
              turnId,
              i,
              t.isError ? 'error' : 'done'
            );
          });
          this.virtualList.completeCurrentToolBatch(turnId);

          for (const tool of turn.tools) {
            if (tool.result) {
              this.virtualList.addToolResult(turnId, tool.name, tool.result, tool.isError);
            }
          }
        }

        if (turn.text) {
          this.virtualList.addTextSegment(turnId, turn.text);
        }

        if (turn.usage) {
          this.virtualList.addUsageStats(turnId, turn.usage.input_tokens, turn.usage.output_tokens);
        }
      }
    }
  }

  // ============================================
  // Accessors
  // ============================================

  get connected(): boolean {
    return this._connected;
  }

  get streaming(): boolean {
    return this._isStreaming;
  }

  // ============================================
  // Lifecycle
  // ============================================

  destroy(): void {
    this.disconnect();
    super.destroy();
  }
}
