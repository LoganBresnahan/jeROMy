/**
 * Tests for SessionManager.
 *
 * All tests use in-memory SQLite — no filesystem side effects.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { JeromyDatabase } from "./database.js";
import { EventStore } from "./eventStore.js";
import { SessionManager } from "./sessionManager.js";
import type { NewEvent } from "./types.js";

// ============================================
// Helpers
// ============================================

function makeUserInstruction(message: string, images?: Array<{ data: string; media_type: string }>): NewEvent<"user_instruction"> {
  return {
    type: "user_instruction",
    data: { message, has_images: !!images?.length, images },
    asset_type: null,
  };
}

function makeAssistantResponse(text: string, usage = { input_tokens: 100, output_tokens: 50 }): NewEvent<"assistant_response"> {
  return {
    type: "assistant_response",
    data: {
      text,
      content_blocks: [{ type: "text", text }],
      usage,
    },
    asset_type: null,
  };
}

function makeToolCall(name: string, toolUseId: string, input: Record<string, unknown> = {}): NewEvent<"tool_call"> {
  return {
    type: "tool_call",
    data: { tool_use_id: toolUseId, name, input },
    asset_type: null,
  };
}

function makeToolResult(name: string, toolUseId: string, result: string, isError = false): NewEvent<"tool_result"> {
  return {
    type: "tool_result",
    data: { tool_use_id: toolUseId, name, result, is_error: isError },
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

// ============================================
// Tests
// ============================================

describe("SessionManager", () => {
  let db: JeromyDatabase;
  let eventStore: EventStore;
  let manager: SessionManager;

  beforeEach(() => {
    db = new JeromyDatabase({ inMemory: true });
    eventStore = new EventStore(db.db);
    manager = new SessionManager(db.db, eventStore);
  });

  afterEach(() => {
    try { db?.close(); } catch { /* already closed */ }
  });

  // ========================================
  // CRUD
  // ========================================

  describe("createSession", () => {
    it("creates a session with a UUID", () => {
      const session = manager.createSession("Test Session");
      expect(session.id).toBeTruthy();
      expect(session.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("stores the session name", () => {
      const session = manager.createSession("My ROM Hack");
      expect(session.name).toBe("My ROM Hack");
    });

    it("sets created_at and updated_at", () => {
      const session = manager.createSession("Test");
      expect(session.created_at).toBeTruthy();
      expect(session.updated_at).toBeTruthy();
    });

    it("sets parent_id and fork_seq to null for root sessions", () => {
      const session = manager.createSession("Root");
      expect(session.parent_id).toBeNull();
      expect(session.fork_seq).toBeNull();
    });

    it("stores metadata", () => {
      const session = manager.createSession("Test", {
        rom_sha1: "abc123",
        rom_name: "Super Mario Bros",
      });
      expect(session.metadata.rom_sha1).toBe("abc123");
      expect(session.metadata.rom_name).toBe("Super Mario Bros");
    });

    it("defaults metadata to empty object", () => {
      const session = manager.createSession("Test");
      expect(session.metadata).toEqual({});
    });
  });

  describe("getSession", () => {
    it("returns a session by ID", () => {
      const created = manager.createSession("Test");
      const retrieved = manager.getSession(created.id);
      expect(retrieved).toBeTruthy();
      expect(retrieved!.name).toBe("Test");
    });

    it("returns null for non-existent ID", () => {
      expect(manager.getSession("nonexistent")).toBeNull();
    });
  });

  describe("listSessions", () => {
    it("returns empty array when no sessions exist", () => {
      expect(manager.listSessions()).toEqual([]);
    });

    it("returns sessions most recently updated first", () => {
      const s1 = manager.createSession("First");
      const s2 = manager.createSession("Second");
      // Manually set distinct timestamps to guarantee ordering
      db.db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?")
        .run(["2026-01-01T00:00:01.000Z", s2.id]);
      db.db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?")
        .run(["2026-01-01T00:00:02.000Z", s1.id]);

      const list = manager.listSessions();
      expect(list[0].id).toBe(s1.id);
      expect(list[1].id).toBe(s2.id);
    });

    it("includes event counts", () => {
      const session = manager.createSession("Test");
      eventStore.append(session.id, makeUserInstruction("Hello"));
      eventStore.append(session.id, makeAssistantResponse("Hi"));

      const list = manager.listSessions();
      expect(list[0].event_count).toBe(2);
    });
  });

  describe("updateSession", () => {
    it("updates session name", () => {
      const session = manager.createSession("Old Name");
      manager.updateSession(session.id, { name: "New Name" });
      expect(manager.getSession(session.id)!.name).toBe("New Name");
    });

    it("updates session metadata", () => {
      const session = manager.createSession("Test");
      manager.updateSession(session.id, {
        metadata: { rom_sha1: "abc" },
      });
      expect(manager.getSession(session.id)!.metadata.rom_sha1).toBe("abc");
    });

    it("merges metadata (does not replace)", () => {
      const session = manager.createSession("Test", { rom_name: "SMB" });
      manager.updateSession(session.id, {
        metadata: { rom_sha1: "abc" },
      });
      const updated = manager.getSession(session.id)!;
      expect(updated.metadata.rom_name).toBe("SMB");
      expect(updated.metadata.rom_sha1).toBe("abc");
    });

    it("updates updated_at timestamp", () => {
      const session = manager.createSession("Test");
      // Set a known old timestamp
      db.db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?")
        .run(["2020-01-01T00:00:00.000Z", session.id]);

      manager.updateSession(session.id, { name: "Updated" });
      const updated = manager.getSession(session.id)!;
      expect(updated.updated_at).not.toBe("2020-01-01T00:00:00.000Z");
    });

    it("throws for non-existent session", () => {
      expect(() => {
        manager.updateSession("nonexistent", { name: "X" });
      }).toThrow("Session not found");
    });
  });

  describe("deleteSession", () => {
    it("removes the session", () => {
      const session = manager.createSession("Doomed");
      manager.deleteSession(session.id);
      expect(manager.getSession(session.id)).toBeNull();
    });

    it("cascades to session_events", () => {
      const session = manager.createSession("Doomed");
      eventStore.append(session.id, makeUserInstruction("Hello"));
      manager.deleteSession(session.id);

      // session_events should be gone
      expect(eventStore.getSessionEvents(session.id)).toEqual([]);
    });

    it("does not throw for non-existent session", () => {
      expect(() => manager.deleteSession("nonexistent")).not.toThrow();
    });
  });

  describe("getMostRecentSession", () => {
    it("returns null when no sessions exist", () => {
      expect(manager.getMostRecentSession()).toBeNull();
    });

    it("returns the most recently updated session", () => {
      manager.createSession("First");
      const second = manager.createSession("Second");
      manager.touch(second.id);

      const recent = manager.getMostRecentSession();
      expect(recent!.id).toBe(second.id);
    });
  });

  // ========================================
  // Forking
  // ========================================

  describe("forkSession", () => {
    it("creates a child session", () => {
      const parent = manager.createSession("Parent");
      eventStore.append(parent.id, makeUserInstruction("Hello"));

      const child = manager.forkSession(parent.id, 1, "Child");
      expect(child.id).not.toBe(parent.id);
      expect(child.name).toBe("Child");
    });

    it("sets parent_id and fork_seq on child", () => {
      const parent = manager.createSession("Parent");
      eventStore.append(parent.id, makeUserInstruction("Hello"));
      eventStore.append(parent.id, makeAssistantResponse("Hi"));

      const child = manager.forkSession(parent.id, 1, "Fork at 1");
      expect(child.parent_id).toBe(parent.id);
      expect(child.fork_seq).toBe(1);
    });

    it("copies parent events up to forkSeq (zero-copy)", () => {
      const parent = manager.createSession("Parent");
      eventStore.append(parent.id, makeUserInstruction("One"));
      eventStore.append(parent.id, makeAssistantResponse("Two"));
      eventStore.append(parent.id, makeUserInstruction("Three"));

      const child = manager.forkSession(parent.id, 2, "Fork");

      // Child gets: 2 shared events + 1 fork_created = 3
      const childEvents = eventStore.getSessionEvents(child.id);
      expect(childEvents.length).toBe(3);
      expect(childEvents[0].type).toBe("user_instruction");
      expect(childEvents[1].type).toBe("assistant_response");
      expect(childEvents[2].type).toBe("fork_created");
    });

    it("shared events have same IDs (zero-copy proof)", () => {
      const parent = manager.createSession("Parent");
      eventStore.append(parent.id, makeUserInstruction("Shared"));

      const child = manager.forkSession(parent.id, 1, "Fork");

      const parentEvents = eventStore.getSessionEvents(parent.id);
      const childEvents = eventStore.getSessionEvents(child.id);

      expect(childEvents[0].id).toBe(parentEvents[0].id);
    });

    it("does not copy events beyond forkSeq", () => {
      const parent = manager.createSession("Parent");
      eventStore.append(parent.id, makeUserInstruction("Before fork"));
      eventStore.append(parent.id, makeUserInstruction("After fork"));

      const child = manager.forkSession(parent.id, 1, "Fork");

      const childEvents = eventStore.getSessionEvents(child.id);
      // seq 1: shared event, seq 2: fork_created (NOT "After fork")
      expect(childEvents.length).toBe(2);
      expect(childEvents[1].type).toBe("fork_created");
    });

    it("appends fork_created event with correct data", () => {
      const parent = manager.createSession("Parent");
      eventStore.append(parent.id, makeUserInstruction("Hello"));

      const child = manager.forkSession(parent.id, 1, "Fork");

      const childEvents = eventStore.getSessionEvents(child.id);
      const forkEvent = childEvents.find((e) => e.type === "fork_created")!;
      expect(forkEvent).toBeTruthy();
      expect((forkEvent.data as any).parent_session_id).toBe(parent.id);
      expect((forkEvent.data as any).fork_seq).toBe(1);
      expect((forkEvent.data as any).child_session_id).toBe(child.id);
    });

    it("inherits parent metadata", () => {
      const parent = manager.createSession("Parent", {
        rom_sha1: "abc",
        rom_name: "SMB",
      });
      eventStore.append(parent.id, makeUserInstruction("Hello"));

      const child = manager.forkSession(parent.id, 1, "Fork");
      expect(child.metadata.rom_sha1).toBe("abc");
      expect(child.metadata.rom_name).toBe("SMB");
    });

    it("child can grow independently", () => {
      const parent = manager.createSession("Parent");
      eventStore.append(parent.id, makeUserInstruction("Shared"));

      const child = manager.forkSession(parent.id, 1, "Fork");
      eventStore.append(child.id, makeUserInstruction("Child only"));

      const parentEvents = eventStore.getSessionEvents(parent.id);
      const childEvents = eventStore.getSessionEvents(child.id);

      expect(parentEvents.length).toBe(1);
      // Child: 1 shared + 1 fork_created + 1 new = 3
      expect(childEvents.length).toBe(3);
    });

    it("parent can grow independently", () => {
      const parent = manager.createSession("Parent");
      eventStore.append(parent.id, makeUserInstruction("Shared"));

      manager.forkSession(parent.id, 1, "Fork");
      eventStore.append(parent.id, makeUserInstruction("Parent only"));

      const parentEvents = eventStore.getSessionEvents(parent.id);
      expect(parentEvents.length).toBe(2);
    });

    it("throws for non-existent parent", () => {
      expect(() => {
        manager.forkSession("nonexistent", 1, "Fork");
      }).toThrow("Session not found");
    });

    it("throws for forkSeq = 0", () => {
      const parent = manager.createSession("Parent");
      eventStore.append(parent.id, makeUserInstruction("Hello"));

      expect(() => {
        manager.forkSession(parent.id, 0, "Fork");
      }).toThrow("out of range");
    });

    it("throws for forkSeq beyond max", () => {
      const parent = manager.createSession("Parent");
      eventStore.append(parent.id, makeUserInstruction("Hello"));

      expect(() => {
        manager.forkSession(parent.id, 99, "Fork");
      }).toThrow("out of range");
    });

    it("throws for negative forkSeq", () => {
      const parent = manager.createSession("Parent");
      eventStore.append(parent.id, makeUserInstruction("Hello"));

      expect(() => {
        manager.forkSession(parent.id, -1, "Fork");
      }).toThrow("out of range");
    });

    it("allows forkSeq at max seq", () => {
      const parent = manager.createSession("Parent");
      eventStore.append(parent.id, makeUserInstruction("One"));
      eventStore.append(parent.id, makeAssistantResponse("Two"));

      const child = manager.forkSession(parent.id, 2, "Fork at end");
      const childEvents = eventStore.getSessionEvents(child.id);
      // 2 shared + 1 fork_created
      expect(childEvents.length).toBe(3);
    });

    it("supports fork of a fork", () => {
      const root = manager.createSession("Root");
      eventStore.append(root.id, makeUserInstruction("Root event"));

      const child = manager.forkSession(root.id, 1, "Child");
      eventStore.append(child.id, makeUserInstruction("Child event"));

      // Fork the child at its seq 2 (fork_created from first fork)
      const grandchild = manager.forkSession(child.id, 2, "Grandchild");
      const gcEvents = eventStore.getSessionEvents(grandchild.id);

      // Grandchild has: 1 shared root + 1 fork_created (from child) + 1 fork_created (own) = 3
      expect(gcEvents.length).toBe(3);
      expect(grandchild.parent_id).toBe(child.id);
    });
  });

  // ========================================
  // History Rebuild
  // ========================================

  describe("rebuildHistory", () => {
    it("returns empty array for empty session", () => {
      const session = manager.createSession("Empty");
      const history = manager.rebuildHistory(session.id);
      expect(history).toEqual([]);
    });

    it("converts user_instruction to user message", () => {
      const session = manager.createSession("Test");
      eventStore.append(session.id, makeUserInstruction("Make it orange"));

      const history = manager.rebuildHistory(session.id);
      expect(history.length).toBe(1);
      expect(history[0].role).toBe("user");
      expect(history[0].content).toBe("Make it orange");
    });

    it("converts user_instruction with images", () => {
      const session = manager.createSession("Test");
      eventStore.append(
        session.id,
        makeUserInstruction("Check this", [
          { data: "AAAA==", media_type: "image/png" },
        ])
      );

      const history = manager.rebuildHistory(session.id);
      expect(history.length).toBe(1);
      expect(history[0].role).toBe("user");
      expect(Array.isArray(history[0].content)).toBe(true);
      const blocks = history[0].content as any[];
      expect(blocks.find((b: any) => b.type === "image")).toBeTruthy();
      expect(blocks.find((b: any) => b.type === "text")?.text).toBe(
        "Check this"
      );
    });

    it("converts assistant_response to assistant message", () => {
      const session = manager.createSession("Test");
      eventStore.append(session.id, makeUserInstruction("Hello"));
      eventStore.append(session.id, makeAssistantResponse("Hi there!"));

      const history = manager.rebuildHistory(session.id);
      expect(history.length).toBe(2);
      expect(history[1].role).toBe("assistant");
    });

    it("uses content_blocks from assistant_response when available", () => {
      const session = manager.createSession("Test");
      eventStore.append(session.id, makeUserInstruction("Hello"));
      eventStore.append(session.id, {
        type: "assistant_response",
        data: {
          text: "Hi",
          content_blocks: [
            { type: "text", text: "Hi" },
            { type: "tool_use", id: "tu-1", name: "screenshot", input: {} },
          ],
          usage: { input_tokens: 100, output_tokens: 50 },
        },
        asset_type: null,
      } as NewEvent);

      const history = manager.rebuildHistory(session.id);
      const assistantContent = history[1].content as any[];
      expect(assistantContent.length).toBe(2);
      expect(assistantContent[1].type).toBe("tool_use");
    });

    it("converts tool_call + tool_result into LLM message pairs", () => {
      const session = manager.createSession("Test");
      eventStore.append(session.id, makeUserInstruction("Get palette"));
      eventStore.append(
        session.id,
        makeToolCall("get_palette", "tu-1", { palette_id: 0 })
      );
      eventStore.append(
        session.id,
        makeToolResult("get_palette", "tu-1", '{"colors":[0,1,2,3]}')
      );

      const history = manager.rebuildHistory(session.id);
      // user instruction + assistant (tool_call) + user (tool_result)
      expect(history.length).toBe(3);
      expect(history[1].role).toBe("assistant");
      expect(history[2].role).toBe("user");

      // Tool call should be ToolUseBlock
      const assistantBlocks = history[1].content as any[];
      expect(assistantBlocks[0].type).toBe("tool_use");
      expect(assistantBlocks[0].id).toBe("tu-1");
      expect(assistantBlocks[0].name).toBe("get_palette");

      // Tool result should be ToolResultBlock
      const userBlocks = history[2].content as any[];
      expect(userBlocks[0].type).toBe("tool_result");
      expect(userBlocks[0].tool_use_id).toBe("tu-1");
    });

    it("groups multiple tool calls into one assistant message", () => {
      const session = manager.createSession("Test");
      eventStore.append(session.id, makeUserInstruction("Do stuff"));
      eventStore.append(
        session.id,
        makeToolCall("screenshot", "tu-1")
      );
      eventStore.append(
        session.id,
        makeToolCall("get_palette", "tu-2", { palette_id: 0 })
      );
      eventStore.append(
        session.id,
        makeToolResult("screenshot", "tu-1", "[screenshot]")
      );
      eventStore.append(
        session.id,
        makeToolResult("get_palette", "tu-2", '{"colors":[0,1,2,3]}')
      );

      const history = manager.rebuildHistory(session.id);
      // user + assistant (2 tool calls) + user (2 tool results)
      expect(history.length).toBe(3);

      const assistantBlocks = history[1].content as any[];
      expect(assistantBlocks.length).toBe(2);
      expect(assistantBlocks[0].name).toBe("screenshot");
      expect(assistantBlocks[1].name).toBe("get_palette");
    });

    it("skips domain events (palette_edit, etc.)", () => {
      const session = manager.createSession("Test");
      eventStore.append(session.id, makeUserInstruction("Hello"));
      eventStore.append(session.id, makePaletteEdit());
      eventStore.append(session.id, makeAssistantResponse("Done"));

      const history = manager.rebuildHistory(session.id);
      expect(history.length).toBe(2); // user + assistant (palette_edit skipped)
    });

    it("skips fork_created events", () => {
      const parent = manager.createSession("Parent");
      eventStore.append(parent.id, makeUserInstruction("Hello"));
      const child = manager.forkSession(parent.id, 1, "Fork");

      const history = manager.rebuildHistory(child.id);
      // Only the shared user_instruction, fork_created is skipped
      expect(history.length).toBe(1);
      expect(history[0].role).toBe("user");
    });

    it("respects fromSeq parameter", () => {
      const session = manager.createSession("Test");
      eventStore.append(session.id, makeUserInstruction("First"));
      eventStore.append(session.id, makeAssistantResponse("Response 1"));
      eventStore.append(session.id, makeUserInstruction("Second"));
      eventStore.append(session.id, makeAssistantResponse("Response 2"));

      const history = manager.rebuildHistory(session.id, 2);
      expect(history.length).toBe(2); // Only events after seq 2
      expect(history[0].role).toBe("user");
      expect((history[0].content as string)).toBe("Second");
    });

    it("round-trips a full conversation", () => {
      const session = manager.createSession("Test");

      // Simulate: user → assistant with tool calls → tool results → assistant done
      eventStore.append(session.id, makeUserInstruction("Make the rock orange"));
      eventStore.append(
        session.id,
        makeToolCall("get_palette", "tu-1", { palette_id: 2 })
      );
      eventStore.append(
        session.id,
        makeToolResult("get_palette", "tu-1", '{"colors":[15,0,16,48]}')
      );
      eventStore.append(session.id, {
        type: "assistant_response",
        data: {
          text: "Done! Changed palette 2.",
          content_blocks: [
            { type: "text", text: "Done! Changed palette 2." },
          ],
          usage: { input_tokens: 500, output_tokens: 100 },
        },
        asset_type: null,
      } as NewEvent);

      const history = manager.rebuildHistory(session.id);

      // Should have: user, assistant (tool_call), user (tool_result), assistant (done)
      expect(history.length).toBe(4);
      expect(history[0].role).toBe("user");
      expect(history[1].role).toBe("assistant");
      expect(history[2].role).toBe("user");
      expect(history[3].role).toBe("assistant");
    });
  });
});
