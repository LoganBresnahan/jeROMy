/**
 * Agent core — orchestrates the LLM tool loop.
 *
 * Takes a user instruction, streams LLM responses, executes tool calls
 * against the emulator, and iterates until the task is complete.
 */

import { PNG } from "pngjs";
import type {
  LLMProvider,
  LLMMessage,
  LLMStreamEvent,
  ContentBlock,
  ImageBlock,
  ToolUseBlock,
} from "./provider.js";
import type { MesenAdapter } from "../bridge/mesen/index.js";
import type { Disassembler } from "./disassembler.js";
import type { GameMapping } from "../mappings/types.js";
import { loadMapping } from "../mappings/loader.js";
import { agentTools, executeTool, type ToolResult } from "./tools.js";
import { buildSystemPrompt } from "./prompts.js";

/** Decoded image stored for tool access. */
export interface StoredImage {
  data: Buffer;
  width: number;
  height: number;
}

// -- Agent Events (yielded to the caller) ------------------------------------

export type AgentEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; name: string; input: Record<string, unknown> }
  | {
      type: "tool_result";
      name: string;
      result: string;
      is_error: boolean;
    }
  | { type: "screenshot"; png_base64: string }
  | {
      type: "done";
      text: string;
      usage: { input_tokens: number; output_tokens: number };
    }
  | { type: "error"; message: string };

// -- Options -----------------------------------------------------------------

export interface AgentOptions {
  /** Max tool-loop iterations before stopping (default: 50). */
  maxIterations?: number;
  /** Max tokens per LLM response (default: 4096). */
  maxTokens?: number;
  /** Temperature for LLM (default: undefined — use provider default). */
  temperature?: number;
  /** Log callback — receives all agent trace messages. */
  log?: (text: string) => void;
}

// -- Agent -------------------------------------------------------------------

const DEFAULT_MAX_ITERATIONS = 50;

export class Agent {
  private provider: LLMProvider;
  private adapter: MesenAdapter;
  private disassembler: Disassembler | null;
  private log: (text: string) => void;
  private options: Required<
    Pick<AgentOptions, "maxIterations" | "maxTokens">
  > & { temperature?: number };

  /** Conversation history for the current session. */
  private history: LLMMessage[] = [];
  private abortController: AbortController | null = null;

  /** Currently loaded game mapping (set by buildContextualPrompt). */
  private currentMapping: GameMapping | null = null;

  /** Decoded user-uploaded images, keyed by "image_0", "image_1", etc. */
  private imageStore: Map<string, StoredImage> = new Map();
  private imageCounter = 0;

  constructor(
    provider: LLMProvider,
    adapter: MesenAdapter,
    options: AgentOptions = {},
    disassembler: Disassembler | null = null
  ) {
    this.provider = provider;
    this.adapter = adapter;
    this.disassembler = disassembler;
    this.log = options.log ?? console.log.bind(console);
    this.options = {
      maxIterations: options.maxIterations ?? DEFAULT_MAX_ITERATIONS,
      maxTokens: options.maxTokens ?? 4096,
      temperature: options.temperature,
    };
  }

  /** Cancel a running agent loop. */
  abort(): void {
    this.abortController?.abort();
  }

  /** Clear conversation history (start fresh). */
  resetHistory(): void {
    this.history = [];
    this.imageStore.clear();
    this.imageCounter = 0;
    this.log("[Agent] Image store cleared");
  }

  /** Get the image store (for tool access). */
  getImageStore(): Map<string, StoredImage> {
    return this.imageStore;
  }

  /** Replace conversation history (used by session manager to restore state). */
  setHistory(messages: LLMMessage[]): void {
    this.history = messages;
  }

  /** Get a copy of the current conversation history. */
  getHistory(): LLMMessage[] {
    return [...this.history];
  }

  /**
   * Run a user instruction through the tool loop.
   * Yields AgentEvents as the agent streams text, calls tools, etc.
   *
   * @param instruction - The user's text message
   * @param options - Optional images to include (e.g. user-captured screenshots)
   */
  async *run(
    instruction: string,
    options?: { images?: Array<{ data: string; media_type: string }> }
  ): AsyncIterable<AgentEvent> {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    const runStart = performance.now();

    try {
      // Build the system prompt with runtime context
      const systemPrompt = await this.buildContextualPrompt();

      // Add user message to history (with optional attached images)
      if (options?.images?.length) {
        const content: ContentBlock[] = options.images.map((img) => ({
          type: "image" as const,
          media_type: img.media_type as ImageBlock["media_type"],
          data: img.data,
        }));
        content.push({ type: "text" as const, text: instruction });
        this.history.push({ role: "user", content });

        // Decode and store images for tool access (extract_sprite)
        for (const img of options.images) {
          try {
            const png = PNG.sync.read(Buffer.from(img.data, "base64"));
            const key = `image_${this.imageCounter++}`;
            this.imageStore.set(key, {
              data: png.data,
              width: png.width,
              height: png.height,
            });
            this.log(`[Agent] Stored reference image ${key} (${png.width}x${png.height})`);
          } catch (err: any) {
            this.log(`[Agent] Failed to decode uploaded image: ${err.message}`);
          }
        }
      } else {
        this.history.push({ role: "user", content: instruction });
      }

      this.log(`[Agent] ── Run start ── history=${this.history.length} messages, maxIter=${this.options.maxIterations}`);

      let totalUsage = { input_tokens: 0, output_tokens: 0 };
      let finalText = "";

      for (let iteration = 0; iteration < this.options.maxIterations; iteration++) {
        if (signal.aborted) break;

        this.log(`[Agent] ── Iteration ${iteration + 1}/${this.options.maxIterations} ── history=${this.history.length} messages`);

        // Stream the LLM response
        const assistantBlocks: ContentBlock[] = [];
        let currentText = "";

        for await (const event of this.provider.stream(this.history, {
          system: systemPrompt,
          tools: agentTools,
          max_tokens: this.options.maxTokens,
          temperature: this.options.temperature,
          signal,
        })) {
          if (signal.aborted) break;

          if (event.type === "text_delta") {
            currentText += event.text;
            yield { type: "text_delta", text: event.text };
          } else if (event.type === "message_done") {
            assistantBlocks.push(...event.response.content);
            totalUsage.input_tokens += event.response.usage.input_tokens;
            totalUsage.output_tokens += event.response.usage.output_tokens;

            // Log the full response content
            const textBlocks = event.response.content.filter(
              (b): b is { type: "text"; text: string } => b.type === "text"
            );
            const toolBlocks = event.response.content.filter(
              (b) => b.type === "tool_use"
            );
            this.log(`[Agent]   Response: stop_reason=${event.response.stop_reason} text_blocks=${textBlocks.length} tool_calls=${toolBlocks.length} tokens=${event.response.usage.input_tokens}in/${event.response.usage.output_tokens}out`);

            // Log assistant text content
            if (textBlocks.length > 0) {
              const fullText = textBlocks.map((b) => b.text).join("");
              const preview = fullText.length > 2000 ? fullText.slice(0, 2000) + "…" : fullText;
              this.log(`[Agent]   Assistant text:\n${preview}`);
            }

            // Log tool calls summary
            for (const block of toolBlocks) {
              if (block.type === "tool_use") {
                const inputStr = JSON.stringify(block.input);
                const inputPreview = inputStr.length > 200 ? inputStr.slice(0, 200) + "…" : inputStr;
                this.log(`[Agent]   Tool call: ${block.name}(${inputPreview})`);
              }
            }

            // Check if we're done (no tool calls)
            if (event.response.stop_reason !== "tool_use") {
              // Extract final text from response
              finalText = textBlocks.map((b) => b.text).join("");

              // Add assistant response to history
              this.history.push({
                role: "assistant",
                content: assistantBlocks,
              });

              const elapsed = ((performance.now() - runStart) / 1000).toFixed(1);
              this.log(`[Agent] ── Run complete ── iterations=${iteration + 1} total_tokens=${totalUsage.input_tokens}in/${totalUsage.output_tokens}out elapsed=${elapsed}s`);

              yield { type: "done", text: finalText, usage: totalUsage };
              return;
            }
          }
        }

        if (signal.aborted) break;

        // Add assistant response to history
        this.history.push({ role: "assistant", content: assistantBlocks });

        // Execute tool calls
        const toolUseBlocks = assistantBlocks.filter(
          (b): b is ToolUseBlock => b.type === "tool_use"
        );

        if (toolUseBlocks.length === 0) {
          // No tool calls and not end_turn — shouldn't happen, but handle gracefully
          this.log("[Agent]   No tool calls and no end_turn — finishing");
          finalText = currentText;
          yield { type: "done", text: finalText, usage: totalUsage };
          return;
        }

        const toolResultBlocks: ContentBlock[] = [];

        for (const toolCall of toolUseBlocks) {
          if (signal.aborted) break;

          yield {
            type: "tool_call",
            name: toolCall.name,
            input: toolCall.input,
          };

          let result: ToolResult;
          let isError = false;
          const toolStart = performance.now();
          try {
            result = await executeTool(
              toolCall.name,
              toolCall.input,
              this.adapter,
              this.disassembler,
              this.currentMapping,
              this.imageStore
            );
          } catch (err: any) {
            result = { type: "text", text: `Error: ${err.message}` };
            isError = true;
          }
          const toolElapsed = ((performance.now() - toolStart) / 1000).toFixed(2);

          // Build tool_result content block
          if (result.type === "text") {
            const resultPreview = result.text.length > 300 ? result.text.slice(0, 300) + "…" : result.text;
            this.log(`[Agent]   Tool result: ${toolCall.name} ${isError ? "FAILED" : "ok"} (${toolElapsed}s) → ${resultPreview}`);

            toolResultBlocks.push({
              type: "tool_result",
              tool_use_id: toolCall.id,
              content: result.text,
              is_error: isError,
            });

            yield {
              type: "tool_result",
              name: toolCall.name,
              result: result.text,
              is_error: isError,
            };
          } else {
            // Mixed content (screenshot with image)
            const contentTypes = result.content.map((b) => b.type).join(", ");
            this.log(`[Agent]   Tool result: ${toolCall.name} ok (${toolElapsed}s) → [${contentTypes}]`);

            toolResultBlocks.push({
              type: "tool_result",
              tool_use_id: toolCall.id,
              content: result.content,
            });

            // Emit screenshot event for the UI
            for (const block of result.content) {
              if (block.type === "image") {
                yield { type: "screenshot", png_base64: block.data };
              }
            }

            yield {
              type: "tool_result",
              name: toolCall.name,
              result: `[${toolCall.name} completed]`,
              is_error: false,
            };
          }
        }

        // Add tool results as a user message (Anthropic API convention)
        this.history.push({ role: "user", content: toolResultBlocks });
      }

      // Exited the loop — either aborted or hit max iterations
      const elapsed = ((performance.now() - runStart) / 1000).toFixed(1);
      if (signal.aborted) {
        this.log(`[Agent] ── Run aborted ── elapsed=${elapsed}s`);
        yield { type: "error", message: "Agent was aborted" };
      } else {
        this.log(`[Agent] ── Run hit max iterations (${this.options.maxIterations}) ── elapsed=${elapsed}s`);
        yield {
          type: "error",
          message: `Agent reached maximum iterations (${this.options.maxIterations})`,
        };
      }
    } catch (err: any) {
      const elapsed = ((performance.now() - runStart) / 1000).toFixed(1);
      if (signal.aborted) {
        this.log(`[Agent] ── Run aborted (exception) ── elapsed=${elapsed}s`);
        yield { type: "error", message: "Agent was aborted" };
      } else {
        this.log(`[Agent] ── Run error ── ${err.message} elapsed=${elapsed}s`);
        this.log(err.stack ?? "");
        yield { type: "error", message: `Agent error: ${err.message}` };
      }
    } finally {
      this.abortController = null;
    }
  }

  /** Get the currently loaded game mapping (if any). */
  getMapping(): GameMapping | null {
    return this.currentMapping;
  }

  /** Build system prompt with runtime context from the emulator. */
  private async buildContextualPrompt(): Promise<string> {
    let romInfo, palettes, emulatorStatus;
    try {
      if (this.adapter.isConnected) {
        [romInfo, palettes, emulatorStatus] = await Promise.all([
          this.adapter.getRomInfo().catch(() => undefined),
          this.adapter.getAllPalettes().catch(() => undefined),
          this.adapter.getEmulatorStatus().catch(() => undefined),
        ]);
      }
    } catch {
      // Non-critical — just use base prompt
    }

    // Load game mapping by ROM SHA1 (if available)
    let mapping: GameMapping | null = null;
    if (romInfo?.sha1) {
      try {
        mapping = loadMapping(romInfo.sha1);
        if (mapping) {
          this.log(`[Agent] Loaded game mapping: ${mapping.rom_name} (${Object.keys(mapping.tiles).length} tiles, ${Object.keys(mapping.addresses).length} addresses)`);
        }
      } catch {
        // Non-critical — mapping file may not exist or be malformed
      }
    }
    this.currentMapping = mapping;

    return buildSystemPrompt({ romInfo, palettes, mapping, emulatorPaused: emulatorStatus?.paused });
  }
}
