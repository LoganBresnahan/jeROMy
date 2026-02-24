/**
 * Session manager — CRUD, forking, and history rebuild.
 *
 * Sessions are containers for event sequences. Forking creates a new session
 * that shares events with its parent up to the fork point (zero-copy via the
 * session_events join table).
 *
 * `rebuildHistory()` converts DB events back into the `LLMMessage[]` format
 * expected by the Agent, enabling session switching and restart recovery.
 */

import type Database from "@signalapp/sqlcipher";
import type { Statement } from "@signalapp/sqlcipher";
import type { LLMMessage, ContentBlock } from "../agent/provider.js";
import { EventStore } from "./eventStore.js";
import type {
  Session,
  SessionMetadata,
  SessionSummary,
  NewEvent,
  SeqEvent,
  AssistantResponseData,
  ToolCallData,
  ToolResultData,
  UserInstructionData,
} from "./types.js";

// -- Helpers ------------------------------------------------------------------

function generateId(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

// -- Row types ----------------------------------------------------------------

interface SessionRow {
  id: string;
  name: string;
  parent_id: string | null;
  fork_seq: number | null;
  created_at: string;
  updated_at: string;
  metadata: string;
}

interface SessionSummaryRow extends SessionRow {
  event_count: number;
}

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    name: row.name,
    parent_id: row.parent_id,
    fork_seq: row.fork_seq,
    created_at: row.created_at,
    updated_at: row.updated_at,
    metadata: JSON.parse(row.metadata) as SessionMetadata,
  };
}

function rowToSummary(row: SessionSummaryRow): SessionSummary {
  return {
    id: row.id,
    name: row.name,
    parent_id: row.parent_id,
    event_count: row.event_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// -- SessionManager -----------------------------------------------------------

export class SessionManager {
  private readonly insertSession: Statement;
  private readonly selectSession: Statement;
  private readonly selectSessions: Statement;
  private readonly updateSessionStmt: Statement;
  private readonly updateSessionName: Statement;
  private readonly deleteSessionStmt: Statement;
  private readonly touchSession: Statement;

  constructor(
    private readonly db: Database,
    private readonly eventStore: EventStore
  ) {
    this.insertSession = db.prepare(
      `INSERT INTO sessions (id, name, parent_id, fork_seq, created_at, updated_at, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    this.selectSession = db.prepare(
      `SELECT id, name, parent_id, fork_seq, created_at, updated_at, metadata
       FROM sessions WHERE id = ?`
    );

    this.selectSessions = db.prepare(
      `SELECT s.id, s.name, s.parent_id, s.fork_seq, s.created_at, s.updated_at, s.metadata,
              (SELECT COUNT(*) FROM session_events se WHERE se.session_id = s.id) as event_count
       FROM sessions s
       ORDER BY s.updated_at DESC`
    );

    this.updateSessionStmt = db.prepare(
      `UPDATE sessions SET name = ?, metadata = ?, updated_at = ? WHERE id = ?`
    );

    this.updateSessionName = db.prepare(
      `UPDATE sessions SET name = ?, updated_at = ? WHERE id = ?`
    );

    this.deleteSessionStmt = db.prepare(`DELETE FROM sessions WHERE id = ?`);

    this.touchSession = db.prepare(
      `UPDATE sessions SET updated_at = ? WHERE id = ?`
    );
  }

  /** Create a new root session. */
  createSession(name: string, metadata?: SessionMetadata): Session {
    const id = generateId();
    const ts = now();
    this.insertSession.run([
      id,
      name,
      null,
      null,
      ts,
      ts,
      JSON.stringify(metadata ?? {}),
    ]);
    return this.getSession(id)!;
  }

  /** Get a session by ID. Returns null if not found. */
  getSession(id: string): Session | null {
    const row = this.selectSession.get<SessionRow>([id]);
    return row ? rowToSession(row) : null;
  }

  /** List all sessions, most recently updated first. */
  listSessions(): SessionSummary[] {
    const rows = this.selectSessions.all<SessionSummaryRow>();
    return rows.map(rowToSummary);
  }

  /** Update a session's name and/or metadata. */
  updateSession(
    id: string,
    updates: Partial<Pick<Session, "name" | "metadata">>
  ): void {
    const session = this.getSession(id);
    if (!session) throw new Error(`Session not found: ${id}`);

    const newName = updates.name ?? session.name;
    const newMetadata = updates.metadata
      ? { ...session.metadata, ...updates.metadata }
      : session.metadata;

    this.updateSessionStmt.run([
      newName,
      JSON.stringify(newMetadata),
      now(),
      id,
    ]);
  }

  /** Delete a session. Cascades to session_events and snapshots. */
  deleteSession(id: string): void {
    this.deleteSessionStmt.run([id]);
  }

  /** Get the most recently updated session, or null if none exist. */
  getMostRecentSession(): Session | null {
    const sessions = this.listSessions();
    return sessions.length > 0 ? this.getSession(sessions[0].id) : null;
  }

  /**
   * Fork a session at a given sequence number.
   *
   * Creates a new child session that shares events 1..forkSeq with the parent
   * (zero-copy). Appends a `fork_created` event to the child at forkSeq+1.
   *
   * @param parentId - The session to fork from.
   * @param forkSeq - The sequence number to fork at (inclusive).
   * @param name - Name for the new child session.
   * @returns The newly created child session.
   */
  forkSession(parentId: string, forkSeq: number, name: string): Session {
    const parent = this.getSession(parentId);
    if (!parent) throw new Error(`Session not found: ${parentId}`);

    const maxSeq = this.eventStore.getMaxSeq(parentId);
    if (forkSeq < 1 || forkSeq > maxSeq) {
      throw new Error(
        `Fork seq ${forkSeq} out of range (1..${maxSeq})`
      );
    }

    const childId = generateId();
    const ts = now();

    this.db.transaction(() => {
      // 1. Create the child session
      this.insertSession.run([
        childId,
        name,
        parentId,
        forkSeq,
        ts,
        ts,
        JSON.stringify(parent.metadata),
      ]);

      // 2. Zero-copy: link parent's events 1..forkSeq to child
      this.eventStore.copyEventLinks(parentId, childId, forkSeq);

      // 3. Append a fork_created event to the child
      this.eventStore.append(childId, {
        type: "fork_created",
        asset_type: null,
        data: {
          parent_session_id: parentId,
          fork_seq: forkSeq,
          child_session_id: childId,
        },
      } as NewEvent);
    })();

    return this.getSession(childId)!;
  }

  /**
   * Get the fork tree — all sessions with their parent-child relationships.
   */
  getForkTree(): SessionSummary[] {
    return this.listSessions();
  }

  /** Touch a session's updated_at timestamp (e.g. after appending events). */
  touch(sessionId: string): void {
    this.touchSession.run([now(), sessionId]);
  }

  /**
   * Rebuild the agent's LLMMessage[] history from a session's events.
   *
   * Converts the event log back into the format the Anthropic API expects:
   * - user_instruction → user message
   * - assistant_response → assistant message (with full ContentBlock[])
   * - tool_call batches → assistant message with ToolUseBlocks
   * - tool_result batches → user message with ToolResultBlocks
   *
   * @param sessionId - The session to rebuild from.
   * @param fromSeq - Start from this sequence number (exclusive). Default: 0 (all events).
   */
  rebuildHistory(sessionId: string, fromSeq?: number): LLMMessage[] {
    const events = this.eventStore.getSessionEvents(sessionId, fromSeq);
    return eventsToHistory(events);
  }
}

// -- History Reconstruction ---------------------------------------------------

/**
 * Convert a sequence of DB events into LLMMessage[] for the agent.
 *
 * Strategy:
 * - `assistant_response` events contain the full ContentBlock[] array,
 *   so we just use that directly as the assistant message content.
 * - `user_instruction` events become user text messages.
 * - `tool_call` events are accumulated into the preceding assistant message.
 * - `tool_result` events are accumulated into a user message with ToolResultBlocks.
 * - Domain events (palette_edit, etc.) are skipped — they're metadata.
 *
 * Because the server records events in order as the agent runs, the event
 * sequence naturally reflects the message structure.
 */
function eventsToHistory(events: SeqEvent[]): LLMMessage[] {
  const messages: LLMMessage[] = [];

  // Group tool_call and tool_result events
  let pendingToolCalls: ToolCallData[] = [];
  let pendingToolResults: ToolResultData[] = [];

  for (const event of events) {
    switch (event.type) {
      case "user_instruction": {
        // Flush any pending tool results before adding a new user message
        flushToolResults(messages, pendingToolResults);
        pendingToolResults = [];

        const data = event.data as UserInstructionData;
        if (data.images?.length) {
          const content: ContentBlock[] = data.images.map((img) => ({
            type: "image" as const,
            media_type: img.media_type as "image/png",
            data: img.data,
          }));
          content.push({ type: "text" as const, text: data.message });
          messages.push({ role: "user", content });
        } else {
          messages.push({ role: "user", content: data.message });
        }
        break;
      }

      case "assistant_response": {
        // Flush any pending tool calls and results before the assistant message
        flushToolCalls(messages, pendingToolCalls);
        pendingToolCalls = [];
        flushToolResults(messages, pendingToolResults);
        pendingToolResults = [];

        const data = event.data as AssistantResponseData;
        if (data.content_blocks?.length) {
          messages.push({ role: "assistant", content: data.content_blocks });
        } else {
          messages.push({ role: "assistant", content: data.text });
        }
        break;
      }

      case "tool_call": {
        const data = event.data as ToolCallData;
        pendingToolCalls.push(data);
        break;
      }

      case "tool_result": {
        // Flush pending tool calls before accumulating results
        if (pendingToolCalls.length > 0) {
          flushToolCalls(messages, pendingToolCalls);
          pendingToolCalls = [];
        }
        const data = event.data as ToolResultData;
        pendingToolResults.push(data);
        break;
      }

      // Domain events (palette_edit, memory_write, etc.) are metadata
      // and don't map to LLM messages. Skip them.
      default:
        break;
    }
  }

  // Flush any remaining tool calls/results
  flushToolCalls(messages, pendingToolCalls);
  flushToolResults(messages, pendingToolResults);

  return messages;
}

function flushToolCalls(
  messages: LLMMessage[],
  toolCalls: ToolCallData[]
): void {
  if (toolCalls.length === 0) return;

  const content: ContentBlock[] = toolCalls.map((tc) => ({
    type: "tool_use" as const,
    id: tc.tool_use_id,
    name: tc.name,
    input: tc.input,
  }));

  messages.push({ role: "assistant", content });
}

function flushToolResults(
  messages: LLMMessage[],
  toolResults: ToolResultData[]
): void {
  if (toolResults.length === 0) return;

  const content: ContentBlock[] = toolResults.map((tr) => ({
    type: "tool_result" as const,
    tool_use_id: tr.tool_use_id,
    content: tr.content_blocks ?? tr.result,
    is_error: tr.is_error,
  }));

  messages.push({ role: "user", content });
}
