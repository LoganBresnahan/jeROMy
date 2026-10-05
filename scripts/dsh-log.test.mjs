// ADR-0011: the session reader decodes dsh's multi-frame zstd JSONL and
// renders what the model saw and did. Fixture events are shaped after a real
// v4 log (session-14597bd5, 2026-10-05, hand-checked by Claude against
// `zstd -dc`); only the shapes matter here, not the values.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import {
  attachmentPath,
  decompressFrames,
  listSessions,
  parseEvents,
  renderTranscript,
  resolveSession,
  summarize,
} from "./dsh-log.mjs";

const EVENTS = [
  { type: "session", version: 4, id: "session-aaaa1111", createdAt: 1_791_164_438_935, cwd: "/home/oof/rom_hacks", isSeeded: false, delegationDepth: 0, agentPreset: "standard" },
  { type: "turn/start", seq: 1, time: 1_791_164_549_584, data: { turn: 1 } },
  { type: "user/message", seq: 2, time: 1_791_164_549_614, data: { content: [{ type: "text", text: "[emulator view] The user clicked pixel (146, 111)" }], source: { kind: "jeromy-view" }, role: "user", id: "u1" } },
  { type: "user/message", seq: 3, time: 1_791_164_549_614, data: { content: [{ type: "text", text: "what tile did I just click?" }], source: { kind: "user" }, role: "user", id: "u2" } },
  { type: "request/context", seq: 4, time: 1_791_164_549_617, data: { provider: "deepseek-official", model: "deepseek-flash", contextWindow: 1_000_000 } },
  { type: "session/title", seq: 5, time: 1_791_164_549_621, data: { title: "Which tile did I click", messageSeqs: [3], source: { kind: "fallback" } } },
  {
    type: "assistant/message",
    seq: 6,
    time: 1_791_164_551_228,
    data: {
      turn: 1,
      step: 1,
      message: {
        role: "assistant",
        content: [
          { type: "reasoning", text: "Let me read the tile." },
          { type: "text", text: "I'll inspect that tile." },
          { type: "tool-call", id: "call_1", name: "read_tile", arguments: '{"tile_id": 36}' },
        ],
        source: { kind: "model", provider: "deepseek-official", model: "deepseek-flash" },
        id: "a1",
      },
      usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 1000, cacheWriteTokens: 0, totalTokens: 1120 },
      stream: [{ type: "chunk", time: 1, chunk: { type: "block-start", index: 0, blockType: "reasoning" } }],
    },
  },
  { type: "tool/call", seq: 7, time: 1_791_164_551_230, data: { turn: 1, step: 1, callId: "call_1", name: "read_tile", arguments: '{"tile_id": 36}' } },
  {
    type: "tool/result",
    seq: 8,
    time: 1_791_164_551_464,
    data: {
      turn: 1,
      step: 1,
      message: {
        role: "tool",
        source: { kind: "tool", callId: "call_1" },
        toolCallId: "call_1",
        content: [
          { type: "text", text: "$24 (source: chrRom)" },
          { type: "image", attachment: { attachmentId: "sha256:b1f3f84eb8557ae9318819de32cd7ec2f9260e47bf5a1c15a8a7544c8a88a7db", mediaType: "image/png", bytes: 2601, width: 256, height: 240 } },
        ],
        isError: false,
        id: "t1",
      },
    },
  },
  { type: "tool/call", seq: 9, time: 1_791_164_551_500, data: { turn: 1, step: 1, callId: "call_2", name: "screenshot", arguments: "{}" } },
  { type: "tool/result", seq: 10, time: 1_791_164_551_600, data: { turn: 1, step: 1, message: { role: "tool", source: { kind: "tool", callId: "call_2" }, toolCallId: "call_2", content: [{ type: "text", text: "Screenshot is empty: the emulator is paused" }], isError: true, id: "t2" } } },
  { type: "turn/end", seq: 11, time: 1_791_164_607_715, data: { turn: 1, reason: { kind: "completed" } } },
];

function framesFor(events) {
  // dsh appends one zstd frame per checkpoint; emulate three checkpoints.
  const lines = events.map((e) => `${JSON.stringify(e)}\n`);
  const chunks = [lines.slice(0, 4).join(""), lines.slice(4, 9).join(""), lines.slice(9).join("")];
  return Buffer.concat(chunks.map((c) => zlib.zstdCompressSync(Buffer.from(c))));
}

function tempStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-log-"));
  const dir = path.join(root, "--home-oof-rom_hacks--", "session-aaaa1111");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "session.v4.jsonl.zstd"), framesFor(EVENTS));
  const older = path.join(root, "--home-oof--", "session-bbbb2222");
  fs.mkdirSync(older, { recursive: true });
  fs.writeFileSync(path.join(older, "session.jsonl.zstd"), zlib.zstdCompressSync(Buffer.from(`${JSON.stringify({ type: "session", version: 0, id: "session-bbbb2222", createdAt: 1, cwd: "/home/oof" })}\n`)));
  const past = new Date(Date.now() - 3_600_000);
  fs.utimesSync(path.join(older, "session.jsonl.zstd"), past, past);
  return root;
}

describe("dsh-log (ADR-0011)", () => {
  it("decodes every appended zstd frame, not just the first", () => {
    const text = decompressFrames(framesFor(EVENTS));
    expect(parseEvents(text)).toHaveLength(EVENTS.length);
  });

  it("tolerates a torn trailing line while dsh is still writing", () => {
    const text = `${JSON.stringify(EVENTS[0])}\n{"type":"turn/sta`;
    expect(parseEvents(text)).toHaveLength(1);
  });

  it("lists sessions newest first and resolves `latest` and id prefixes", () => {
    const root = tempStore();
    const all = listSessions(root);
    expect(all.map((s) => s.id)).toEqual(["session-aaaa1111", "session-bbbb2222"]);
    expect(resolveSession("latest", root).id).toBe("session-aaaa1111");
    expect(resolveSession("bbbb", root).id).toBe("session-bbbb2222");
    expect(() => resolveSession("zzzz", root)).toThrow(/no session/);
  });

  it("summarizes turns, tool calls, errors, images, injected kinds and usage", () => {
    const s = summarize(EVENTS);
    expect(s.title).toBe("Which tile did I click");
    expect(s.model).toBe("deepseek-flash");
    expect(s.turns).toBe(1);
    expect(s.toolCalls).toBe(2);
    expect(s.toolErrors).toBe(1);
    expect(s.images).toBe(1);
    expect(s.toolsByName).toEqual({ read_tile: 1, screenshot: 1 });
    expect(s.injectedKinds).toEqual({ "jeromy-view": 1, user: 1 });
    expect(s.usage).toEqual({ inputTokens: 100, cacheReadTokens: 1000, outputTokens: 20 });
    expect(s.firstUser).toBe("what tile did I just click?");
  });

  it("renders reasoning, tool calls by name, results, errors and image paths", () => {
    const out = renderTranscript(EVENTS);
    expect(out).toContain("USER <jeromy-view>");
    expect(out).toContain("▷ Let me read the tile.");
    expect(out).toContain('→ read_tile {"tile_id": 36}');
    expect(out).toContain("RESULT read_tile");
    expect(out).toContain("RESULT screenshot ERROR");
    expect(out).toContain("in 100 (cache 1000) out 20");
    expect(out).toContain(attachmentPath("sha256:b1f3f84eb8557ae9318819de32cd7ec2f9260e47bf5a1c15a8a7544c8a88a7db"));
    expect(out).not.toContain("block-start");
  });

  it("hides reasoning on request and filters by seq for tailing", () => {
    expect(renderTranscript(EVENTS, { reasoning: false })).not.toContain("▷");
    const tail = renderTranscript(EVENTS, { since: 8 });
    expect(tail).not.toContain("read_tile");
    expect(tail).toContain("RESULT screenshot ERROR");
    expect(tail).toContain("turn 1 end");
  });

  it("maps an attachment id to the content-addressed object path", () => {
    expect(attachmentPath("sha256:b1f3abc", "/x")).toBe("/x/b1/b1f3abc");
  });
});
