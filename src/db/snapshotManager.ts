/**
 * Snapshot manager — context compression for long editing sessions.
 *
 * Snapshots capture a summary of events up to a given sequence number,
 * so the LLM context can be rebuilt from the latest snapshot + recent events
 * rather than the full event history.
 */

import type Database from "@signalapp/sqlcipher";
import type { Statement } from "@signalapp/sqlcipher";
import { EventStore } from "./eventStore.js";
import type { Snapshot, SnapshotMetadata, SeqEvent } from "./types.js";

// -- Helpers ------------------------------------------------------------------

function generateId(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

// -- Row types ----------------------------------------------------------------

interface SnapshotRow {
  id: string;
  session_id: string;
  seq: number;
  summary: string;
  metadata: string;
  created_at: string;
}

function rowToSnapshot(row: SnapshotRow): Snapshot {
  return {
    id: row.id,
    session_id: row.session_id,
    seq: row.seq,
    summary: row.summary,
    metadata: JSON.parse(row.metadata) as SnapshotMetadata,
    created_at: row.created_at,
  };
}

// -- SnapshotManager ----------------------------------------------------------

export class SnapshotManager {
  private readonly insertSnapshot: Statement;
  private readonly selectLatest: Statement;
  private readonly selectAll: Statement;
  private readonly selectById: Statement;

  constructor(
    private readonly db: Database,
    private readonly eventStore: EventStore
  ) {
    this.insertSnapshot = db.prepare(
      `INSERT INTO snapshots (id, session_id, seq, summary, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    this.selectLatest = db.prepare(
      `SELECT id, session_id, seq, summary, metadata, created_at
       FROM snapshots
       WHERE session_id = ?
       ORDER BY seq DESC
       LIMIT 1`
    );

    this.selectAll = db.prepare(
      `SELECT id, session_id, seq, summary, metadata, created_at
       FROM snapshots
       WHERE session_id = ?
       ORDER BY seq`
    );

    this.selectById = db.prepare(
      `SELECT id, session_id, seq, summary, metadata, created_at
       FROM snapshots
       WHERE id = ?`
    );
  }

  /**
   * Create a snapshot at the current sequence position in the session.
   *
   * @param sessionId - The session to snapshot.
   * @param summary - Human-readable summary of events up to this point.
   * @param metadata - Structured data (discovered mappings, palette state, etc.).
   */
  createSnapshot(
    sessionId: string,
    summary: string,
    metadata?: SnapshotMetadata
  ): Snapshot {
    const seq = this.eventStore.getMaxSeq(sessionId);
    const id = generateId();
    const ts = now();

    this.insertSnapshot.run([
      id,
      sessionId,
      seq,
      summary,
      JSON.stringify(metadata ?? {}),
      ts,
    ]);

    return this.getSnapshot(id)!;
  }

  /** Get a snapshot by ID. */
  getSnapshot(id: string): Snapshot | null {
    const row = this.selectById.get<SnapshotRow>([id]);
    return row ? rowToSnapshot(row) : null;
  }

  /** Get the most recent snapshot for a session (by seq). */
  getLatestSnapshot(sessionId: string): Snapshot | null {
    const row = this.selectLatest.get<SnapshotRow>([sessionId]);
    return row ? rowToSnapshot(row) : null;
  }

  /** Get all snapshots for a session, ordered by seq (ascending). */
  getSnapshots(sessionId: string): Snapshot[] {
    const rows = this.selectAll.all<SnapshotRow>([sessionId]);
    return rows.map(rowToSnapshot);
  }

  /**
   * Build LLM context from a session: latest snapshot + recent events.
   *
   * If no snapshot exists, returns all events.
   * If a snapshot exists, returns only events after the snapshot's seq.
   */
  buildContext(sessionId: string): {
    snapshot: Snapshot | null;
    recentEvents: SeqEvent[];
  } {
    const snapshot = this.getLatestSnapshot(sessionId);
    const afterSeq = snapshot ? snapshot.seq : 0;
    const recentEvents = this.eventStore.getSessionEvents(sessionId, afterSeq);
    return { snapshot, recentEvents };
  }
}
