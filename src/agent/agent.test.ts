import { describe, it, expect, vi } from "vitest";
import { Agent, type AgentEvent } from "./agent.js";
import type {
  LLMProvider,
  LLMMessage,
  LLMChatOptions,
  LLMResponse,
  LLMStreamEvent,
} from "./provider.js";

/** Collect all events from an agent run. */
async function collectEvents(
  agent: Agent,
  instruction: string
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of agent.run(instruction)) {
    events.push(event);
  }
  return events;
}

/** Create a mock provider that returns a simple text response. */
function textProvider(text: string): LLMProvider {
  return {
    async chat() {
      return {
        content: [{ type: "text", text }],
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 5 },
      };
    },
    async *stream(_messages: LLMMessage[], _options: LLMChatOptions) {
      yield { type: "text_delta" as const, text };
      yield {
        type: "message_done" as const,
        response: {
          content: [{ type: "text" as const, text }],
          stop_reason: "end_turn" as const,
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      };
    },
  };
}

/** Create a mock provider that calls a tool, then responds with text. */
function toolThenTextProvider(
  toolName: string,
  toolInput: Record<string, unknown>,
  finalText: string
): LLMProvider {
  let callCount = 0;
  return {
    async chat() {
      throw new Error("not used");
    },
    async *stream(_messages: LLMMessage[], _options: LLMChatOptions) {
      callCount++;
      if (callCount === 1) {
        // First call: return a tool_use
        yield { type: "text_delta" as const, text: "Let me check..." };
        yield {
          type: "message_done" as const,
          response: {
            content: [
              { type: "text" as const, text: "Let me check..." },
              {
                type: "tool_use" as const,
                id: "call_1",
                name: toolName,
                input: toolInput,
              },
            ],
            stop_reason: "tool_use" as const,
            usage: { input_tokens: 20, output_tokens: 15 },
          },
        };
      } else {
        // Second call (after tool result): return final text
        yield { type: "text_delta" as const, text: finalText };
        yield {
          type: "message_done" as const,
          response: {
            content: [{ type: "text" as const, text: finalText }],
            stop_reason: "end_turn" as const,
            usage: { input_tokens: 30, output_tokens: 10 },
          },
        };
      }
    },
  };
}

/** Create a mock adapter with all methods as vi.fn(). */
function mockAdapter(overrides: Record<string, any> = {}) {
  return {
    isConnected: true,
    screenshot: vi.fn().mockResolvedValue({ png_base64: "AAAA" }),
    getTileAtPixel: vi
      .fn()
      .mockResolvedValue({ tile_id: 1, palette_id: 0, tile_x: 16, tile_y: 15 }),
    getPalette: vi
      .fn()
      .mockResolvedValue({ palette_id: 0, colors: [0, 1, 2, 3], background_color: 0 }),
    writePalette: vi
      .fn()
      .mockResolvedValue({ palette_id: 0, color_index: 1, old_color: 1, new_color: 0x27 }),
    getAllPalettes: vi.fn().mockResolvedValue({ palettes: [] }),
    readMemory: vi
      .fn()
      .mockResolvedValue({ address: 0, mem_type: "cpuDebug", bytes: [0] }),
    writeMemory: vi
      .fn()
      .mockResolvedValue({ address: 0, mem_type: "cpu", bytes_written: 1 }),
    getCpuState: vi
      .fn()
      .mockResolvedValue({ a: 0, x: 0, y: 0, sp: 0xfd, pc: 0x8000, status: 0, cycle: 0, scanline: 0, ppu_cycle: 0 }),
    getRomInfo: vi
      .fn()
      .mockResolvedValue({ name: "Test", path: "/test", sha1: "abc", format: "iNES" }),
    saveState: vi.fn().mockResolvedValue({ slot: 0, action: "saved" }),
    loadState: vi.fn().mockResolvedValue({ slot: 0, action: "loaded" }),
    ping: vi.fn().mockResolvedValue({ pong: true, timestamp: 0 }),
    rawRequest: vi.fn().mockResolvedValue({}),
    listen: vi.fn(),
    shutdown: vi.fn(),
    ...overrides,
  } as any;
}

describe("Agent", () => {
  it("streams text and completes for a simple response", async () => {
    const agent = new Agent(textProvider("Hello!"), mockAdapter());
    const events = await collectEvents(agent, "Hi");

    const textDeltas = events.filter((e) => e.type === "text_delta");
    expect(textDeltas.length).toBeGreaterThan(0);

    const done = events.find((e) => e.type === "done");
    expect(done).toBeDefined();
    if (done?.type === "done") {
      expect(done.text).toBe("Hello!");
      expect(done.usage.input_tokens).toBe(10);
    }
  });

  it("executes a tool call and continues", async () => {
    const adapter = mockAdapter();
    const provider = toolThenTextProvider("get_palette", { palette_id: 0 }, "Palette 0 has colors...");
    const agent = new Agent(provider, adapter);

    const events = await collectEvents(agent, "What palette is this?");

    // Should have tool_call and tool_result events
    const toolCall = events.find((e) => e.type === "tool_call");
    expect(toolCall).toBeDefined();
    if (toolCall?.type === "tool_call") {
      expect(toolCall.name).toBe("get_palette");
    }

    const toolResult = events.find((e) => e.type === "tool_result");
    expect(toolResult).toBeDefined();

    // Should end with done
    const done = events.find((e) => e.type === "done");
    expect(done).toBeDefined();

    // Adapter should have been called
    expect(adapter.getPalette).toHaveBeenCalledWith(0);
  });

  it("returns screenshot events as images", async () => {
    const adapter = mockAdapter();
    const provider = toolThenTextProvider("screenshot", {}, "I can see the game.");
    const agent = new Agent(provider, adapter);

    const events = await collectEvents(agent, "Take a screenshot");

    const screenshot = events.find((e) => e.type === "screenshot");
    expect(screenshot).toBeDefined();
    if (screenshot?.type === "screenshot") {
      expect(screenshot.png_base64).toBe("AAAA");
    }
  });

  it("reports errors from tool execution", async () => {
    const adapter = mockAdapter({
      getPalette: vi.fn().mockRejectedValue(new Error("bridge disconnected")),
    });
    const provider = toolThenTextProvider(
      "get_palette",
      { palette_id: 0 },
      "There was an error."
    );
    const agent = new Agent(provider, adapter);

    const events = await collectEvents(agent, "Get palette");

    const toolResult = events.find(
      (e) => e.type === "tool_result" && e.is_error
    );
    expect(toolResult).toBeDefined();
    if (toolResult?.type === "tool_result") {
      expect(toolResult.result).toContain("bridge disconnected");
    }
  });

  it("limits iterations to prevent infinite loops", async () => {
    // Provider always returns tool_use
    const infiniteToolProvider: LLMProvider = {
      async chat() {
        throw new Error("not used");
      },
      async *stream() {
        yield {
          type: "message_done" as const,
          response: {
            content: [
              {
                type: "tool_use" as const,
                id: `call_${Date.now()}`,
                name: "ping",
                input: {},
              },
            ],
            stop_reason: "tool_use" as const,
            usage: { input_tokens: 1, output_tokens: 1 },
          },
        };
      },
    };

    const adapter = mockAdapter();
    const agent = new Agent(infiniteToolProvider, adapter, {
      maxIterations: 3,
    });

    const events = await collectEvents(agent, "Loop forever");
    const error = events.find((e) => e.type === "error");
    expect(error).toBeDefined();
    if (error?.type === "error") {
      expect(error.message).toContain("maximum iterations");
    }
  });

  it("abort stops the agent", async () => {
    // Provider that waits long enough for abort to fire
    const slowProvider: LLMProvider = {
      async chat() {
        throw new Error("not used");
      },
      async *stream(_msgs, options) {
        // Wait long enough for the abort to trigger
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 5000);
          options.signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            resolve();
          });
        });
        // After abort, just return without yielding anything
        if (options.signal?.aborted) return;
        yield { type: "text_delta" as const, text: "should not reach" };
        yield {
          type: "message_done" as const,
          response: {
            content: [{ type: "text" as const, text: "should not reach" }],
            stop_reason: "end_turn" as const,
            usage: { input_tokens: 1, output_tokens: 1 },
          },
        };
      },
    };

    const agent = new Agent(slowProvider, mockAdapter());

    // Abort after a short delay
    setTimeout(() => agent.abort(), 20);

    const events = await collectEvents(agent, "Do something slow");
    const error = events.find((e) => e.type === "error");
    expect(error).toBeDefined();
    if (error?.type === "error") {
      expect(error.message).toContain("aborted");
    }
  });

  it("maintains conversation history across runs", async () => {
    let callCount = 0;
    let lastMessages: any[] = [];

    const trackingProvider: LLMProvider = {
      async chat() {
        throw new Error("not used");
      },
      async *stream(messages) {
        callCount++;
        lastMessages = [...messages];
        yield { type: "text_delta" as const, text: `Response ${callCount}` };
        yield {
          type: "message_done" as const,
          response: {
            content: [{ type: "text" as const, text: `Response ${callCount}` }],
            stop_reason: "end_turn" as const,
            usage: { input_tokens: 1, output_tokens: 1 },
          },
        };
      },
    };

    const agent = new Agent(trackingProvider, mockAdapter());

    await collectEvents(agent, "First message");
    expect(callCount).toBe(1);

    await collectEvents(agent, "Second message");
    expect(callCount).toBe(2);

    // Second call should have history: user1, assistant1, user2
    expect(lastMessages.length).toBe(3);
    expect(lastMessages[0].role).toBe("user");
    expect(lastMessages[0].content).toBe("First message");
    expect(lastMessages[1].role).toBe("assistant");
    expect(lastMessages[2].role).toBe("user");
    expect(lastMessages[2].content).toBe("Second message");
  });

  it("resetHistory clears conversation", async () => {
    let lastMessages: any[] = [];

    const trackingProvider: LLMProvider = {
      async chat() {
        throw new Error("not used");
      },
      async *stream(messages) {
        lastMessages = [...messages];
        yield {
          type: "message_done" as const,
          response: {
            content: [{ type: "text" as const, text: "ok" }],
            stop_reason: "end_turn" as const,
            usage: { input_tokens: 1, output_tokens: 1 },
          },
        };
      },
    };

    const agent = new Agent(trackingProvider, mockAdapter());

    await collectEvents(agent, "Message 1");
    agent.resetHistory();
    await collectEvents(agent, "Message 2");

    // After reset, should only have the new message
    expect(lastMessages.length).toBe(1);
    expect(lastMessages[0].content).toBe("Message 2");
  });
});
