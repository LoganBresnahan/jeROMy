/**
 * Anthropic Claude provider — implements LLMProvider using @anthropic-ai/sdk.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  LLMProvider,
  LLMMessage,
  LLMChatOptions,
  LLMResponse,
  LLMStreamEvent,
  ContentBlock,
  ImageBlock,
} from "../provider.js";

export interface AnthropicProviderOptions {
  apiKey?: string; // defaults to ANTHROPIC_API_KEY env var
  model?: string; // env JEROMY_MODEL, defaults to claude-sonnet-4-20250514
  log?: (text: string) => void; // log callback (default: console.log)
}

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  readonly model: string;
  private log: (text: string) => void;

  constructor(options: AnthropicProviderOptions = {}) {
    this.client = new Anthropic({
      apiKey: options.apiKey, // SDK reads ANTHROPIC_API_KEY if undefined
    });
    this.model = options.model ?? "claude-sonnet-4-20250514";
    this.log = options.log ?? console.log.bind(console);
  }

  async chat(
    messages: LLMMessage[],
    options: LLMChatOptions
  ): Promise<LLMResponse> {
    this.log(`[LLM] → Request (non-streaming): model=${this.model} messages=${messages.length} max_tokens=${options.max_tokens ?? 4096} tools=${options.tools?.length ?? 0}`);
    const t0 = performance.now();

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options.max_tokens ?? 4096,
      messages: messages.map(toAnthropicMessage),
      ...(options.system ? { system: options.system } : {}),
      ...(options.tools?.length
        ? { tools: options.tools as Anthropic.Messages.Tool[] }
        : {}),
      ...(options.temperature != null
        ? { temperature: options.temperature }
        : {}),
    });

    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
    this.log(`[LLM] ← Response: stop_reason=${response.stop_reason} tokens=${response.usage.input_tokens}in/${response.usage.output_tokens}out elapsed=${elapsed}s`);

    return fromAnthropicResponse(response);
  }

  async *stream(
    messages: LLMMessage[],
    options: LLMChatOptions
  ): AsyncIterable<LLMStreamEvent> {
    this.log(`[LLM] → Request (stream): model=${this.model} messages=${messages.length} max_tokens=${options.max_tokens ?? 4096} tools=${options.tools?.length ?? 0}`);
    const t0 = performance.now();

    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: options.max_tokens ?? 4096,
      messages: messages.map(toAnthropicMessage),
      ...(options.system ? { system: options.system } : {}),
      ...(options.tools?.length
        ? { tools: options.tools as Anthropic.Messages.Tool[] }
        : {}),
      ...(options.temperature != null
        ? { temperature: options.temperature }
        : {}),
    });

    if (options.signal) {
      options.signal.addEventListener(
        "abort",
        () => stream.abort(),
        { once: true }
      );
    }

    let firstTokenTime: number | null = null;
    for await (const event of stream) {
      if (!firstTokenTime && (event.type === "content_block_delta")) {
        firstTokenTime = performance.now();
        this.log(`[LLM]   First token after ${((firstTokenTime - t0) / 1000).toFixed(2)}s`);
      }
      const mapped = mapStreamEvent(event);
      if (mapped) yield mapped;
    }

    // Yield the final assembled response
    const finalMessage = await stream.finalMessage();
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
    this.log(`[LLM] ← Response: stop_reason=${finalMessage.stop_reason} tokens=${finalMessage.usage.input_tokens}in/${finalMessage.usage.output_tokens}out elapsed=${elapsed}s`);

    yield {
      type: "message_done",
      response: fromAnthropicResponse(finalMessage),
    };
  }
}

// -- Mapping helpers ---------------------------------------------------------

function toAnthropicMessage(
  msg: LLMMessage
): Anthropic.Messages.MessageParam {
  if (typeof msg.content === "string") {
    return { role: msg.role, content: msg.content };
  }

  const blocks: Anthropic.Messages.ContentBlockParam[] = msg.content.map(
    (block) => {
      switch (block.type) {
        case "text":
          return { type: "text" as const, text: block.text };

        case "image":
          return {
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: (block as ImageBlock).media_type,
              data: (block as ImageBlock).data,
            },
          };

        case "tool_use":
          return {
            type: "tool_use" as const,
            id: block.id,
            name: block.name,
            input: block.input,
          };

        case "tool_result": {
          const content =
            typeof block.content === "string"
              ? block.content
              : block.content.map((b) => {
                  if (b.type === "text")
                    return { type: "text" as const, text: b.text };
                  if (b.type === "image")
                    return {
                      type: "image" as const,
                      source: {
                        type: "base64" as const,
                        media_type: (b as ImageBlock).media_type,
                        data: (b as ImageBlock).data,
                      },
                    };
                  return { type: "text" as const, text: JSON.stringify(b) };
                });
          return {
            type: "tool_result" as const,
            tool_use_id: block.tool_use_id,
            content,
            ...(block.is_error ? { is_error: true } : {}),
          };
        }

        default:
          return { type: "text" as const, text: JSON.stringify(block) };
      }
    }
  );

  return { role: msg.role, content: blocks };
}

function fromAnthropicResponse(
  resp: Anthropic.Messages.Message
): LLMResponse {
  const content: ContentBlock[] = resp.content.map((block) => {
    if (block.type === "text") {
      return { type: "text", text: block.text };
    }
    if (block.type === "tool_use") {
      return {
        type: "tool_use",
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      };
    }
    // Fallback for any other block types
    return { type: "text", text: JSON.stringify(block) };
  });

  return {
    content,
    stop_reason: resp.stop_reason as LLMResponse["stop_reason"],
    usage: {
      input_tokens: resp.usage.input_tokens,
      output_tokens: resp.usage.output_tokens,
    },
  };
}

function mapStreamEvent(
  event: Anthropic.Messages.MessageStreamEvent
): LLMStreamEvent | null {
  switch (event.type) {
    case "content_block_start":
      if (event.content_block.type === "tool_use") {
        return {
          type: "tool_use_start",
          id: event.content_block.id,
          name: event.content_block.name,
        };
      }
      return null;

    case "content_block_delta":
      if (event.delta.type === "text_delta") {
        return { type: "text_delta", text: event.delta.text };
      }
      if (event.delta.type === "input_json_delta") {
        return {
          type: "tool_input_delta",
          partial_json: event.delta.partial_json,
        };
      }
      return null;

    case "content_block_stop":
      // We don't know if this was a tool_use block ending, but the agent
      // handles this via the final message_done event
      return null;

    default:
      return null;
  }
}
