import { describe, it, expect } from "vitest";
import type {
  LLMProvider,
  LLMMessage,
  LLMChatOptions,
  LLMResponse,
  LLMStreamEvent,
  ContentBlock,
  LLMTool,
} from "./provider.js";

describe("provider types", () => {
  it("LLMMessage supports string content", () => {
    const msg: LLMMessage = { role: "user", content: "Hello" };
    expect(msg.role).toBe("user");
    expect(msg.content).toBe("Hello");
  });

  it("LLMMessage supports content block array", () => {
    const msg: LLMMessage = {
      role: "user",
      content: [
        { type: "text", text: "Look at this:" },
        { type: "image", media_type: "image/png", data: "base64data" },
      ],
    };
    expect(msg.content).toHaveLength(2);
  });

  it("LLMResponse round-trips through JSON", () => {
    const resp: LLMResponse = {
      content: [{ type: "text", text: "Hello" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 5 },
    };
    const json = JSON.stringify(resp);
    const parsed: LLMResponse = JSON.parse(json);
    expect(parsed.stop_reason).toBe("end_turn");
    expect(parsed.content[0]).toEqual({ type: "text", text: "Hello" });
  });

  it("tool_use blocks contain id, name, and input", () => {
    const block: ContentBlock = {
      type: "tool_use",
      id: "call_123",
      name: "screenshot",
      input: {},
    };
    expect(block.type).toBe("tool_use");
    if (block.type === "tool_use") {
      expect(block.id).toBe("call_123");
      expect(block.name).toBe("screenshot");
    }
  });

  it("tool_result blocks reference a tool_use_id", () => {
    const block: ContentBlock = {
      type: "tool_result",
      tool_use_id: "call_123",
      content: '{"pong": true}',
    };
    expect(block.type).toBe("tool_result");
    if (block.type === "tool_result") {
      expect(block.tool_use_id).toBe("call_123");
    }
  });

  it("LLMTool has the expected JSON Schema structure", () => {
    const tool: LLMTool = {
      name: "test_tool",
      description: "A test tool",
      input_schema: {
        type: "object",
        properties: {
          x: { type: "number" },
        },
        required: ["x"],
      },
    };
    expect(tool.input_schema.type).toBe("object");
    expect(tool.input_schema.required).toEqual(["x"]);
  });

  it("a mock provider can implement the interface", async () => {
    const mockProvider: LLMProvider = {
      async chat(messages, options) {
        return {
          content: [{ type: "text", text: "mock response" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 1, output_tokens: 1 },
        };
      },
      async *stream(messages, options) {
        yield { type: "text_delta", text: "mock " };
        yield { type: "text_delta", text: "stream" };
        yield {
          type: "message_done",
          response: {
            content: [{ type: "text", text: "mock stream" }],
            stop_reason: "end_turn",
            usage: { input_tokens: 1, output_tokens: 2 },
          },
        };
      },
    };

    const resp = await mockProvider.chat(
      [{ role: "user", content: "test" }],
      {}
    );
    expect(resp.content[0]).toEqual({ type: "text", text: "mock response" });

    const events: LLMStreamEvent[] = [];
    for await (const event of mockProvider.stream(
      [{ role: "user", content: "test" }],
      {}
    )) {
      events.push(event);
    }
    expect(events).toHaveLength(3);
    expect(events[0].type).toBe("text_delta");
    expect(events[2].type).toBe("message_done");
  });
});
