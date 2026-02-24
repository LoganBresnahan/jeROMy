/**
 * Tests for SnapshotManager.
 *
 * All tests use in-memory SQLite — no filesystem side effects.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { JeromyDatabase } from "./database.js";
import { EventStore } from "./eventStore.js";
import { SnapshotManager } from "./snapshotManager.js";
import type { NewEvent } from "./types.js";

// ============================================
// Helpers
// ============================================

function makeEvent(type: NewEvent["type"] = "tool_call"): NewEvent {
  return {
    type,
    data: { tool_use_id: "tu-1", name: "screenshot", input: {} },
    asset_type: null,
  } as NewEvent;
}

function makeUserInstruction(message: string): NewEvent<"user_instruction"> {
  return {
    type: "user_instruction",
    data: { message, has_images: false },
    asset_type: null,
  };
}

function createSession(db: JeromyDatabase, id: string): void {
  const now = new Date().toISOString();
  db.db
    .prepare(
      "INSERT INTO sessions (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)"
    )
    .run([id, `Session ${id}`, now, now]);
}

// ============================================
// Tests
// ============================================

describe("SnapshotManager", () => {
  let db: JeromyDatabase;
  let eventStore: EventStore;
  let snapshots: SnapshotManager;

  beforeEach(() => {
    db = new JeromyDatabase({ inMemory: true });
    eventStore = new EventStore(db.db);
    snapshots = new SnapshotManager(db.db, eventStore);
    createSession(db, "sess-1");
  });

  afterEach(() => {
    try { db?.close(); } catch { /* already closed */ }
  });

  // ========================================
  // createSnapshot
  // ========================================

  describe("createSnapshot", () => {
    it("creates a snapshot at current max seq", () => {
      eventStore.append("sess-1", makeEvent());
      eventStore.append("sess-1", makeEvent());
      eventStore.append("sess-1", makeEvent());

      const snap = snapshots.createSnapshot("sess-1", "First 3 events");
      expect(snap.seq).toBe(3);
      expect(snap.summary).toBe("First 3 events");
      expect(snap.session_id).toBe("sess-1");
    });

    it("creates a snapshot at seq 0 for empty session", () => {
      const snap = snapshots.createSnapshot("sess-1", "Empty session");
      expect(snap.seq).toBe(0);
    });

    it("generates unique IDs", () => {
      eventStore.append("sess-1", makeEvent());
      const snap1 = snapshots.createSnapshot("sess-1", "Snap 1");
      const snap2 = snapshots.createSnapshot("sess-1", "Snap 2");
      expect(snap1.id).not.toBe(snap2.id);
    });

    it("sets created_at timestamp", () => {
      const snap = snapshots.createSnapshot("sess-1", "Test");
      expect(snap.created_at).toBeTruthy();
      expect(new Date(snap.created_at).getTime()).toBeGreaterThan(0);
    });

    it("stores metadata", () => {
      eventStore.append("sess-1", makeEvent());
      const snap = snapshots.createSnapshot("sess-1", "With metadata", {
        discoveredMappings: { playerX: 0x0300 },
      });
      expect(snap.metadata.discoveredMappings).toEqual({ playerX: 0x0300 });
    });

    it("defaults metadata to empty object", () => {
      const snap = snapshots.createSnapshot("sess-1", "No metadata");
      expect(snap.metadata).toEqual({});
    });
  });

  // ========================================
  // getSnapshot
  // ========================================

  describe("getSnapshot", () => {
    it("returns snapshot by ID", () => {
      eventStore.append("sess-1", makeEvent());
      const created = snapshots.createSnapshot("sess-1", "Test");
      const fetched = snapshots.getSnapshot(created.id);
      expect(fetched).toBeTruthy();
      expect(fetched!.id).toBe(created.id);
      expect(fetched!.summary).toBe("Test");
    });

    it("returns null for non-existent ID", () => {
      expect(snapshots.getSnapshot("nonexistent")).toBeNull();
    });
  });

  // ========================================
  // getLatestSnapshot
  // ========================================

  describe("getLatestSnapshot", () => {
    it("returns null when no snapshots exist", () => {
      expect(snapshots.getLatestSnapshot("sess-1")).toBeNull();
    });

    it("returns the snapshot with highest seq", () => {
      eventStore.append("sess-1", makeEvent());
      snapshots.createSnapshot("sess-1", "At seq 1");

      eventStore.append("sess-1", makeEvent());
      eventStore.append("sess-1", makeEvent());
      snapshots.createSnapshot("sess-1", "At seq 3");

      const latest = snapshots.getLatestSnapshot("sess-1");
      expect(latest).toBeTruthy();
      expect(latest!.seq).toBe(3);
      expect(latest!.summary).toBe("At seq 3");
    });

    it("returns null for non-existent session", () => {
      expect(snapshots.getLatestSnapshot("nonexistent")).toBeNull();
    });
  });

  // ========================================
  // getSnapshots
  // ========================================

  describe("getSnapshots", () => {
    it("returns empty array when no snapshots exist", () => {
      expect(snapshots.getSnapshots("sess-1")).toEqual([]);
    });

    it("returns all snapshots in seq order", () => {
      eventStore.append("sess-1", makeEvent());
      snapshots.createSnapshot("sess-1", "First");

      eventStore.append("sess-1", makeEvent());
      snapshots.createSnapshot("sess-1", "Second");

      eventStore.append("sess-1", makeEvent());
      snapshots.createSnapshot("sess-1", "Third");

      const all = snapshots.getSnapshots("sess-1");
      expect(all.length).toBe(3);
      expect(all.map((s) => s.summary)).toEqual(["First", "Second", "Third"]);
      expect(all.map((s) => s.seq)).toEqual([1, 2, 3]);
    });

    it("isolates snapshots between sessions", () => {
      createSession(db, "sess-2");
      eventStore.append("sess-1", makeEvent());
      eventStore.append("sess-2", makeEvent());

      snapshots.createSnapshot("sess-1", "Session 1 snap");
      snapshots.createSnapshot("sess-2", "Session 2 snap");

      expect(snapshots.getSnapshots("sess-1").length).toBe(1);
      expect(snapshots.getSnapshots("sess-2").length).toBe(1);
      expect(snapshots.getSnapshots("sess-1")[0].summary).toBe("Session 1 snap");
    });
  });

  // ========================================
  // buildContext
  // ========================================

  describe("buildContext", () => {
    it("returns all events when no snapshot exists", () => {
      eventStore.append("sess-1", makeUserInstruction("One"));
      eventStore.append("sess-1", makeUserInstruction("Two"));
      eventStore.append("sess-1", makeUserInstruction("Three"));

      const ctx = snapshots.buildContext("sess-1");
      expect(ctx.snapshot).toBeNull();
      expect(ctx.recentEvents.length).toBe(3);
      expect(ctx.recentEvents[0].seq).toBe(1);
    });

    it("returns only events after snapshot seq", () => {
      eventStore.append("sess-1", makeUserInstruction("One"));
      eventStore.append("sess-1", makeUserInstruction("Two"));
      snapshots.createSnapshot("sess-1", "Checkpoint at 2");

      eventStore.append("sess-1", makeUserInstruction("Three"));
      eventStore.append("sess-1", makeUserInstruction("Four"));

      const ctx = snapshots.buildContext("sess-1");
      expect(ctx.snapshot).toBeTruthy();
      expect(ctx.snapshot!.seq).toBe(2);
      expect(ctx.recentEvents.length).toBe(2);
      expect(ctx.recentEvents[0].seq).toBe(3);
      expect(ctx.recentEvents[1].seq).toBe(4);
    });

    it("returns empty events when snapshot is at max seq", () => {
      eventStore.append("sess-1", makeEvent());
      eventStore.append("sess-1", makeEvent());
      snapshots.createSnapshot("sess-1", "All caught up");

      const ctx = snapshots.buildContext("sess-1");
      expect(ctx.snapshot).toBeTruthy();
      expect(ctx.snapshot!.seq).toBe(2);
      expect(ctx.recentEvents.length).toBe(0);
    });

    it("returns empty context for session with no events and no snapshots", () => {
      const ctx = snapshots.buildContext("sess-1");
      expect(ctx.snapshot).toBeNull();
      expect(ctx.recentEvents).toEqual([]);
    });

    it("uses the latest snapshot when multiple exist", () => {
      eventStore.append("sess-1", makeUserInstruction("One"));
      snapshots.createSnapshot("sess-1", "Early checkpoint");

      eventStore.append("sess-1", makeUserInstruction("Two"));
      eventStore.append("sess-1", makeUserInstruction("Three"));
      snapshots.createSnapshot("sess-1", "Later checkpoint");

      eventStore.append("sess-1", makeUserInstruction("Four"));

      const ctx = snapshots.buildContext("sess-1");
      expect(ctx.snapshot!.summary).toBe("Later checkpoint");
      expect(ctx.snapshot!.seq).toBe(3);
      expect(ctx.recentEvents.length).toBe(1);
      expect(ctx.recentEvents[0].seq).toBe(4);
    });
  });
});
