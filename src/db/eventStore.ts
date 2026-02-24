/**
 * Append-only event store.
 *
 * Events are immutable rows in the `events` table. They are linked to sessions
 * via the `session_events` M:N join table, which assigns each event a 1-based
 * sequence number within a session.
 *
 * Zero-copy forking is implemented by copying `session_events` rows (just
 * session_id + event_id + seq) without duplicating event data.
 */

import type Database from "@signalapp/sqlcipher";
import type { Statement } from "@signalapp/sqlcipher";
import type { DbEvent, EventType, NewEvent, SeqEvent } from "./types.js";

// -- Helpers ------------------------------------------------------------------

function generateId(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

// -- Row → DbEvent conversion ------------------------------------------------

interface EventRow {
  id: string;
  type: string;
  data: string;
  asset_type: string | null;
  created_at: string;
  blob_data: Uint8Array | null;
}

interface SeqEventRow extends EventRow {
  seq: number;
}

function rowToEvent(row: EventRow): DbEvent {
  return {
    id: row.id,
    type: row.type as EventType,
    data: JSON.parse(row.data),
    asset_type: row.asset_type as DbEvent["asset_type"],
    created_at: row.created_at,
    blob_data: row.blob_data,
  };
}

function rowToSeqEvent(row: SeqEventRow): SeqEvent {
  return {
    ...rowToEvent(row),
    seq: row.seq,
  };
}

// -- EventStore ---------------------------------------------------------------

export class EventStore {
  private readonly insertEvent: Statement;
  private readonly insertSessionEvent: Statement;
  private readonly selectEvent: Statement;
  private readonly selectSessionEvents: Statement;
  private readonly selectSessionEventsAfter: Statement;
  private readonly selectSessionEventsRange: Statement;
  private readonly selectMaxSeq: Statement;
  private readonly selectEventCount: Statement;
  private readonly copyLinks: Statement;

  constructor(private readonly db: Database) {
    this.insertEvent = db.prepare(
      `INSERT INTO events (id, type, data, asset_type, created_at, blob_data)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    this.insertSessionEvent = db.prepare(
      `INSERT INTO session_events (session_id, event_id, seq)
       VALUES (?, ?, ?)`
    );

    this.selectEvent = db.prepare(
      `SELECT id, type, data, asset_type, created_at, blob_data
       FROM events WHERE id = ?`
    );

    this.selectSessionEvents = db.prepare(
      `SELECT e.id, e.type, e.data, e.asset_type, e.created_at, e.blob_data, se.seq
       FROM session_events se
       JOIN events e ON e.id = se.event_id
       WHERE se.session_id = ?
       ORDER BY se.seq`
    );

    this.selectSessionEventsAfter = db.prepare(
      `SELECT e.id, e.type, e.data, e.asset_type, e.created_at, e.blob_data, se.seq
       FROM session_events se
       JOIN events e ON e.id = se.event_id
       WHERE se.session_id = ? AND se.seq > ?
       ORDER BY se.seq`
    );

    this.selectSessionEventsRange = db.prepare(
      `SELECT e.id, e.type, e.data, e.asset_type, e.created_at, e.blob_data, se.seq
       FROM session_events se
       JOIN events e ON e.id = se.event_id
       WHERE se.session_id = ? AND se.seq > ?
       ORDER BY se.seq
       LIMIT ?`
    );

    this.selectMaxSeq = db.prepare(
      `SELECT COALESCE(MAX(seq), 0) as max_seq
       FROM session_events WHERE session_id = ?`
    );

    this.selectEventCount = db.prepare(
      `SELECT COUNT(*) as count
       FROM session_events WHERE session_id = ?`
    );

    this.copyLinks = db.prepare(
      `INSERT INTO session_events (session_id, event_id, seq)
       SELECT ?, event_id, seq
       FROM session_events
       WHERE session_id = ? AND seq <= ?`
    );
  }

  /**
   * Append an event to a session. Returns the assigned sequence number.
   *
   * @param sessionId - The session to append to.
   * @param event - Event type, data, and asset_type.
   * @param blobData - Optional binary data (e.g. PNG screenshot).
   * @returns The 1-based sequence number within the session.
   */
  append(
    sessionId: string,
    event: NewEvent,
    blobData?: Uint8Array
  ): number {
    const id = generateId();
    const createdAt = now();
    const data = JSON.stringify(event.data);

    const seq = this.db.transaction(() => {
      const maxSeq = this.getMaxSeq(sessionId);
      const nextSeq = maxSeq + 1;

      this.insertEvent.run([
        id,
        event.type,
        data,
        event.asset_type,
        createdAt,
        blobData ?? null,
      ]);

      this.insertSessionEvent.run([sessionId, id, nextSeq]);

      return nextSeq;
    })();

    return seq;
  }

  /**
   * Get all events for a session, ordered by sequence.
   *
   * @param sessionId - The session to query.
   * @param afterSeq - Only return events after this sequence number (exclusive).
   * @param limit - Max number of events to return.
   */
  getSessionEvents(
    sessionId: string,
    afterSeq?: number,
    limit?: number
  ): SeqEvent[] {
    let rows: SeqEventRow[];

    if (afterSeq != null && limit != null) {
      rows = this.selectSessionEventsRange.all<SeqEventRow>([
        sessionId,
        afterSeq,
        limit,
      ]);
    } else if (afterSeq != null) {
      rows = this.selectSessionEventsAfter.all<SeqEventRow>([
        sessionId,
        afterSeq,
      ]);
    } else {
      rows = this.selectSessionEvents.all<SeqEventRow>([sessionId]);
    }

    return rows.map(rowToSeqEvent);
  }

  /** Get a single event by ID. Returns null if not found. */
  getEvent(eventId: string): DbEvent | null {
    const row = this.selectEvent.get<EventRow>([eventId]);
    return row ? rowToEvent(row) : null;
  }

  /** Get the current max sequence number for a session (0 if empty). */
  getMaxSeq(sessionId: string): number {
    const row = this.selectMaxSeq.get<{ max_seq: number }>([sessionId]);
    return row?.max_seq ?? 0;
  }

  /** Get the total event count for a session. */
  getEventCount(sessionId: string): number {
    const row = this.selectEventCount.get<{ count: number }>([sessionId]);
    return row?.count ?? 0;
  }

  /**
   * Copy event links from a parent session to a child session (zero-copy fork).
   * Copies session_events rows for seq 1..forkSeq from parentId to childId.
   * No event data is duplicated — only the 3-column reference rows.
   */
  copyEventLinks(
    parentId: string,
    childId: string,
    forkSeq: number
  ): void {
    this.copyLinks.run([childId, parentId, forkSeq]);
  }
}
