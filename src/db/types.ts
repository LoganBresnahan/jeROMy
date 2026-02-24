/**
 * Type definitions for the event-sourced database layer.
 *
 * Covers events, sessions, snapshots, and their metadata.
 */

import type { ContentBlock } from "../agent/provider.js";

// -- Event Types --------------------------------------------------------------

export type EventType =
  | "user_instruction"
  | "assistant_response"
  | "tool_call"
  | "tool_result"
  | "screenshot_captured"
  | "memory_read"
  | "memory_write"
  | "disassembly_analyzed"
  | "palette_edit"
  | "sprite_edit"
  | "mapping_discovered"
  | "mapping_hypothesis"
  | "edit_completed"
  | "edit_verified"
  | "fork_created";

export type AssetType =
  | "palette"
  | "sprite"
  | "tile"
  | "logic"
  | "text"
  | "audio"
  | null;

// -- Event Data Payloads (discriminated union) --------------------------------

export interface UserInstructionData {
  message: string;
  has_images: boolean;
  /** Raw images attached by the user (base64 data + media type). */
  images?: Array<{ data: string; media_type: string }>;
}

export interface AssistantResponseData {
  text: string;
  /** Full ContentBlock[] from the LLM response — enables lossless history rebuild. */
  content_blocks: ContentBlock[];
  usage: { input_tokens: number; output_tokens: number };
}

export interface ToolCallData {
  tool_use_id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultData {
  tool_use_id: string;
  name: string;
  result: string;
  is_error: boolean;
  /** Full content blocks for mixed results (screenshots). */
  content_blocks?: ContentBlock[];
}

export interface ScreenshotCapturedData {
  /** Where the screenshot came from. */
  context: "tool_result" | "verification" | "manual";
}

export interface MemoryReadData {
  address: number;
  length: number;
  mem_type: string;
  bytes: number[];
}

export interface MemoryWriteData {
  address: number;
  bytes: number[];
  mem_type: string;
  old_bytes?: number[];
}

export interface DisassemblyAnalyzedData {
  address: number;
  length: number;
  arch: string;
  instructions: string;
}

export interface PaletteEditData {
  palette_id: number;
  color_index: number;
  old_color: number;
  new_color: number;
}

export interface SpriteEditData {
  tile_id: number;
  description: string;
}

export interface MappingDiscoveredData {
  address: number;
  asset_type: AssetType;
  description: string;
  confirmed: true;
}

export interface MappingHypothesisData {
  address: number;
  asset_type: AssetType;
  description: string;
  confidence: number;
}

export interface EditCompletedData {
  summary: string;
}

export interface EditVerifiedData {
  summary: string;
  verified_by: "user";
}

export interface ForkCreatedData {
  parent_session_id: string;
  fork_seq: number;
  child_session_id: string;
}

// -- Event type → data mapping ------------------------------------------------

export interface EventDataMap {
  user_instruction: UserInstructionData;
  assistant_response: AssistantResponseData;
  tool_call: ToolCallData;
  tool_result: ToolResultData;
  screenshot_captured: ScreenshotCapturedData;
  memory_read: MemoryReadData;
  memory_write: MemoryWriteData;
  disassembly_analyzed: DisassemblyAnalyzedData;
  palette_edit: PaletteEditData;
  sprite_edit: SpriteEditData;
  mapping_discovered: MappingDiscoveredData;
  mapping_hypothesis: MappingHypothesisData;
  edit_completed: EditCompletedData;
  edit_verified: EditVerifiedData;
  fork_created: ForkCreatedData;
}

// -- Event (stored row) -------------------------------------------------------

export interface DbEvent<T extends EventType = EventType> {
  id: string;
  type: T;
  data: EventDataMap[T];
  asset_type: AssetType;
  created_at: string;
  blob_data?: Uint8Array | null;
}

/** Event with its sequence number within a session. */
export interface SeqEvent<T extends EventType = EventType> extends DbEvent<T> {
  seq: number;
}

/** Input for appending a new event (id and created_at are auto-generated). */
export interface NewEvent<T extends EventType = EventType> {
  type: T;
  data: EventDataMap[T];
  asset_type: AssetType;
}

// -- Session ------------------------------------------------------------------

export interface Session {
  id: string;
  name: string;
  parent_id: string | null;
  fork_seq: number | null;
  created_at: string;
  updated_at: string;
  metadata: SessionMetadata;
}

export interface SessionMetadata {
  rom_sha1?: string;
  rom_name?: string;
  notes?: string;
  [key: string]: unknown;
}

export interface SessionSummary {
  id: string;
  name: string;
  parent_id: string | null;
  event_count: number;
  created_at: string;
  updated_at: string;
}

// -- Snapshot -----------------------------------------------------------------

export interface Snapshot {
  id: string;
  session_id: string;
  seq: number;
  summary: string;
  metadata: SnapshotMetadata;
  created_at: string;
}

export interface SnapshotMetadata {
  discovered_mappings?: Array<{
    address: number;
    asset_type: AssetType;
    description: string;
  }>;
  palette_state?: Record<number, number[]>;
  [key: string]: unknown;
}
