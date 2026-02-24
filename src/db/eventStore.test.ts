/**
 * Tests for EventStore.
 *
 * All tests use in-memory SQLite — no filesystem side effects.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { JeromyDatabase } from "./database.js";
import { EventStore } from "./eventStore.js";
import type { NewEvent } from "./types.js";

// ============================================
// Helpers
// ============================================

function makeEvent(
  type: NewEvent["type"] = "tool_call",
  data?: Record<string, unknown>
): NewEvent {
  return {
    type,
    data: data ?? { tool_use_id: "tu-1", name: "screenshot", input: {} },
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

function makePaletteEdit(): NewEvent<"palette_edit"> {
  return {
    type: "palette_edit",
    data: { palette_id: 2, color_index: 1, old_color: 0, new_color: 39 },
    asset_type: "palette",
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

describe("EventStore", () => {
  let db: JeromyDatabase;
  let store: EventStore;

  beforeEach(() => {
    db = new JeromyDatabase({ inMemory: true });
    store = new EventStore(db.db);
    createSession(db, "sess-1");
  });

  afterEach(() => {
    try { db?.close(); } catch { /* already closed */ }
  });

  // ========================================
  // Append
  // ========================================

  describe("append", () => {
    it("returns sequence number 1 for first event", () => {
      const seq = store.append("sess-1", makeEvent());
      expect(seq).toBe(1);
    });

    it("increments sequence numbers", () => {
      const seq1 = store.append("sess-1", makeEvent());
      const seq2 = store.append("sess-1", makeEvent());
      const seq3 = store.append("sess-1", makeEvent());
      expect(seq1).toBe(1);
      expect(seq2).toBe(2);
      expect(seq3).toBe(3);
    });

    it("stores event data as JSON", () => {
      store.append("sess-1", makeUserInstruction("Make it orange"));
      const events = store.getSessionEvents("sess-1");
      expect(events[0].data).toEqual({
        message: "Make it orange",
        has_images: false,
      });
    });

    it("stores event type", () => {
      store.append("sess-1", makeUserInstruction("Hello"));
      const events = store.getSessionEvents("sess-1");
      expect(events[0].type).toBe("user_instruction");
    });

    it("stores asset_type", () => {
      store.append("sess-1", makePaletteEdit());
      const events = store.getSessionEvents("sess-1");
      expect(events[0].asset_type).toBe("palette");
    });

    it("stores null asset_type", () => {
      store.append("sess-1", makeEvent());
      const events = store.getSessionEvents("sess-1");
      expect(events[0].asset_type).toBeNull();
    });

    it("generates unique event IDs", () => {
      store.append("sess-1", makeEvent());
      store.append("sess-1", makeEvent());
      const events = store.getSessionEvents("sess-1");
      expect(events[0].id).not.toBe(events[1].id);
    });

    it("sets created_at timestamp", () => {
      store.append("sess-1", makeEvent());
      const events = store.getSessionEvents("sess-1");
      expect(events[0].created_at).toBeTruthy();
      // Should be a valid ISO string
      expect(new Date(events[0].created_at).getTime()).toBeGreaterThan(0);
    });

    it("stores blob data", () => {
      const png = new Uint8Array([137, 80, 78, 71]); // PNG header
      store.append(
        "sess-1",
        {
          type: "screenshot_captured",
          data: { context: "tool_result" },
          asset_type: null,
        } as NewEvent,
        png
      );
      const events = store.getSessionEvents("sess-1");
      expect(events[0].blob_data).toBeTruthy();
      // @signalapp/sqlcipher returns Uint8Array for BLOB
      const blob = events[0].blob_data!;
      expect(blob[0]).toBe(137);
      expect(blob[1]).toBe(80);
    });

    it("stores null blob_data when not provided", () => {
      store.append("sess-1", makeEvent());
      const events = store.getSessionEvents("sess-1");
      expect(events[0].blob_data).toBeNull();
    });
  });

  // ========================================
  // getSessionEvents
  // ========================================

  describe("getSessionEvents", () => {
    it("returns events in sequence order", () => {
      store.append("sess-1", makeUserInstruction("First"));
      store.append("sess-1", makeUserInstruction("Second"));
      store.append("sess-1", makeUserInstruction("Third"));

      const events = store.getSessionEvents("sess-1");
      expect(events.map((e) => (e.data as any).message)).toEqual([
        "First",
        "Second",
        "Third",
      ]);
    });

    it("returns seq numbers", () => {
      store.append("sess-1", makeEvent());
      store.append("sess-1", makeEvent());
      const events = store.getSessionEvents("sess-1");
      expect(events.map((e) => e.seq)).toEqual([1, 2]);
    });

    it("returns empty array for session with no events", () => {
      const events = store.getSessionEvents("sess-1");
      expect(events).toEqual([]);
    });

    it("returns empty array for non-existent session", () => {
      const events = store.getSessionEvents("nonexistent");
      expect(events).toEqual([]);
    });

    it("filters with afterSeq", () => {
      store.append("sess-1", makeUserInstruction("One"));
      store.append("sess-1", makeUserInstruction("Two"));
      store.append("sess-1", makeUserInstruction("Three"));

      const events = store.getSessionEvents("sess-1", 1);
      expect(events.length).toBe(2);
      expect(events[0].seq).toBe(2);
      expect(events[1].seq).toBe(3);
    });

    it("filters with afterSeq and limit", () => {
      store.append("sess-1", makeUserInstruction("One"));
      store.append("sess-1", makeUserInstruction("Two"));
      store.append("sess-1", makeUserInstruction("Three"));
      store.append("sess-1", makeUserInstruction("Four"));

      const events = store.getSessionEvents("sess-1", 1, 2);
      expect(events.length).toBe(2);
      expect(events[0].seq).toBe(2);
      expect(events[1].seq).toBe(3);
    });

    it("afterSeq beyond max returns empty", () => {
      store.append("sess-1", makeEvent());
      const events = store.getSessionEvents("sess-1", 999);
      expect(events).toEqual([]);
    });

    it("isolates events between sessions", () => {
      createSession(db, "sess-2");
      store.append("sess-1", makeUserInstruction("Session 1"));
      store.append("sess-2", makeUserInstruction("Session 2"));

      const events1 = store.getSessionEvents("sess-1");
      const events2 = store.getSessionEvents("sess-2");
      expect(events1.length).toBe(1);
      expect(events2.length).toBe(1);
      expect((events1[0].data as any).message).toBe("Session 1");
      expect((events2[0].data as any).message).toBe("Session 2");
    });
  });

  // ========================================
  // getEvent
  // ========================================

  describe("getEvent", () => {
    it("returns event by ID", () => {
      store.append("sess-1", makeUserInstruction("Hello"));
      const events = store.getSessionEvents("sess-1");
      const eventId = events[0].id;

      const event = store.getEvent(eventId);
      expect(event).toBeTruthy();
      expect(event!.type).toBe("user_instruction");
    });

    it("returns null for non-existent ID", () => {
      const event = store.getEvent("nonexistent");
      expect(event).toBeNull();
    });
  });

  // ========================================
  // getMaxSeq
  // ========================================

  describe("getMaxSeq", () => {
    it("returns 0 for empty session", () => {
      expect(store.getMaxSeq("sess-1")).toBe(0);
    });

    it("returns 0 for non-existent session", () => {
      expect(store.getMaxSeq("nonexistent")).toBe(0);
    });

    it("returns correct max after appends", () => {
      store.append("sess-1", makeEvent());
      store.append("sess-1", makeEvent());
      store.append("sess-1", makeEvent());
      expect(store.getMaxSeq("sess-1")).toBe(3);
    });
  });

  // ========================================
  // getEventCount
  // ========================================

  describe("getEventCount", () => {
    it("returns 0 for empty session", () => {
      expect(store.getEventCount("sess-1")).toBe(0);
    });

    it("returns correct count", () => {
      store.append("sess-1", makeEvent());
      store.append("sess-1", makeEvent());
      expect(store.getEventCount("sess-1")).toBe(2);
    });
  });

  // ========================================
  // copyEventLinks (zero-copy forking)
  // ========================================

  describe("copyEventLinks", () => {
    it("copies event links from parent to child", () => {
      store.append("sess-1", makeUserInstruction("One"));
      store.append("sess-1", makeUserInstruction("Two"));
      store.append("sess-1", makeUserInstruction("Three"));

      createSession(db, "sess-child");
      store.copyEventLinks("sess-1", "sess-child", 2);

      const childEvents = store.getSessionEvents("sess-child");
      expect(childEvents.length).toBe(2);
      expect(childEvents[0].seq).toBe(1);
      expect(childEvents[1].seq).toBe(2);
    });

    it("does not copy events beyond forkSeq", () => {
      store.append("sess-1", makeUserInstruction("One"));
      store.append("sess-1", makeUserInstruction("Two"));
      store.append("sess-1", makeUserInstruction("Three"));

      createSession(db, "sess-child");
      store.copyEventLinks("sess-1", "sess-child", 2);

      const childEvents = store.getSessionEvents("sess-child");
      expect(childEvents.length).toBe(2);
      // Event "Three" (seq 3) should not be copied
      expect(childEvents.every((e) => (e.data as any).message !== "Three")).toBe(
        true
      );
    });

    it("shares event IDs between parent and child (zero-copy)", () => {
      store.append("sess-1", makeUserInstruction("Shared"));

      createSession(db, "sess-child");
      store.copyEventLinks("sess-1", "sess-child", 1);

      const parentEvents = store.getSessionEvents("sess-1");
      const childEvents = store.getSessionEvents("sess-child");

      // Same event ID — data is not duplicated
      expect(childEvents[0].id).toBe(parentEvents[0].id);
    });

    it("child can grow independently after fork", () => {
      store.append("sess-1", makeUserInstruction("Shared"));

      createSession(db, "sess-child");
      store.copyEventLinks("sess-1", "sess-child", 1);

      // Append new event to child
      store.append("sess-child", makeUserInstruction("Child only"));

      const parentEvents = store.getSessionEvents("sess-1");
      const childEvents = store.getSessionEvents("sess-child");

      expect(parentEvents.length).toBe(1);
      expect(childEvents.length).toBe(2);
      expect((childEvents[1].data as any).message).toBe("Child only");
      expect(childEvents[1].seq).toBe(2);
    });

    it("parent can grow independently after fork", () => {
      store.append("sess-1", makeUserInstruction("Shared"));

      createSession(db, "sess-child");
      store.copyEventLinks("sess-1", "sess-child", 1);

      // Append new event to parent
      store.append("sess-1", makeUserInstruction("Parent only"));

      const parentEvents = store.getSessionEvents("sess-1");
      const childEvents = store.getSessionEvents("sess-child");

      expect(parentEvents.length).toBe(2);
      expect(childEvents.length).toBe(1);
    });

    it("copies nothing when forkSeq is 0", () => {
      store.append("sess-1", makeEvent());

      createSession(db, "sess-child");
      store.copyEventLinks("sess-1", "sess-child", 0);

      expect(store.getSessionEvents("sess-child").length).toBe(0);
    });

    it("handles forkSeq equal to max seq", () => {
      store.append("sess-1", makeEvent());
      store.append("sess-1", makeEvent());

      createSession(db, "sess-child");
      store.copyEventLinks("sess-1", "sess-child", 2);

      expect(store.getSessionEvents("sess-child").length).toBe(2);
    });
  });

  // ========================================
  // Event Types
  // ========================================

  describe("Event Types", () => {
    it("stores and retrieves user_instruction", () => {
      store.append("sess-1", makeUserInstruction("Make it blue"));
      const events = store.getSessionEvents("sess-1");
      expect(events[0].type).toBe("user_instruction");
      expect((events[0].data as any).message).toBe("Make it blue");
    });

    it("stores and retrieves palette_edit with asset_type", () => {
      store.append("sess-1", makePaletteEdit());
      const events = store.getSessionEvents("sess-1");
      expect(events[0].type).toBe("palette_edit");
      expect(events[0].asset_type).toBe("palette");
      expect((events[0].data as any).old_color).toBe(0);
      expect((events[0].data as any).new_color).toBe(39);
    });

    it("stores and retrieves assistant_response", () => {
      store.append("sess-1", {
        type: "assistant_response",
        data: {
          text: "Done!",
          content_blocks: [{ type: "text", text: "Done!" }],
          usage: { input_tokens: 100, output_tokens: 50 },
        },
        asset_type: null,
      } as NewEvent);

      const events = store.getSessionEvents("sess-1");
      expect(events[0].type).toBe("assistant_response");
      expect((events[0].data as any).usage.input_tokens).toBe(100);
    });

    it("stores and retrieves fork_created", () => {
      store.append("sess-1", {
        type: "fork_created",
        data: {
          parent_session_id: "sess-1",
          fork_seq: 5,
          child_session_id: "sess-child",
        },
        asset_type: null,
      } as NewEvent);

      const events = store.getSessionEvents("sess-1");
      expect(events[0].type).toBe("fork_created");
      expect((events[0].data as any).fork_seq).toBe(5);
    });
  });
});
