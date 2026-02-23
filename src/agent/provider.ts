/**
 * LLM Provider interface — abstraction layer for different AI model providers.
 * Implementations exist for Anthropic (Claude), with others addable later.
 */

// -- Content Blocks ----------------------------------------------------------

export type ContentBlock =
  | TextBlock
  | ImageBlock
  | ToolUseBlock
  | ToolResultBlock;

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ImageBlock {
  type: "image";
  media_type: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
  data: string; // base64
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string | ContentBlock[];
  is_error?: boolean;
}

// -- Messages ----------------------------------------------------------------

export interface LLMMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

// -- Tools -------------------------------------------------------------------

export interface LLMTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// -- Response ----------------------------------------------------------------

export interface LLMResponse {
  content: ContentBlock[];
  stop_reason: "end_turn" | "tool_use" | "max_tokens";
  usage: { input_tokens: number; output_tokens: number };
}

// -- Streaming ---------------------------------------------------------------

export type LLMStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_use_start"; id: string; name: string }
  | { type: "tool_input_delta"; partial_json: string }
  | { type: "tool_use_end" }
  | { type: "message_done"; response: LLMResponse };

// -- Provider Interface ------------------------------------------------------

export interface LLMChatOptions {
  system?: string;
  tools?: LLMTool[];
  max_tokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface LLMProvider {
  /** Non-streaming completion. */
  chat(messages: LLMMessage[], options: LLMChatOptions): Promise<LLMResponse>;

  /** Streaming completion — yields incremental events. */
  stream(
    messages: LLMMessage[],
    options: LLMChatOptions
  ): AsyncIterable<LLMStreamEvent>;
}
