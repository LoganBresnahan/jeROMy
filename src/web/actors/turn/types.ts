/**
 * Types for TurnActor
 *
 * A "turn" represents a single user or assistant message in the conversation,
 * which may contain multiple interleaved content types:
 * - Text segments (can be split by tool/screenshot insertions)
 * - Tool call batches
 * - Tool results (formatted JSON, palette swatches)
 * - Screenshots (inline PNG images)
 * - Errors
 * - Usage stats
 */

// ============================================
// Content Ordering
// ============================================

export type ContentType = 'text' | 'tools' | 'tool_result' | 'screenshot' | 'error' | 'usage';

export interface ContentOrderEntry {
  type: ContentType;
  index: number;
}

// ============================================
// Text Segments
// ============================================

export interface TextSegment {
  id: string;
  content: string;
  containerId: string;
  isContinuation: boolean;
  complete: boolean;
}

// ============================================
// Tool Calls
// ============================================

export type ToolStatus = 'pending' | 'running' | 'done' | 'error';

export interface ToolCall {
  name: string;
  detail: string;
  status: ToolStatus;
  result?: string;
  isError?: boolean;
}

export interface ToolBatch {
  id: string;
  calls: ToolCall[];
  containerId: string;
  expanded: boolean;
  complete: boolean;
}

// ============================================
// Tool Results
// ============================================

export interface ToolResultData {
  id: string;
  name: string;
  result: string;
  isError: boolean;
  containerId: string;
}

// ============================================
// Screenshots
// ============================================

export interface ScreenshotData {
  id: string;
  base64: string;
  containerId: string;
}

// ============================================
// Errors
// ============================================

export interface ErrorData {
  id: string;
  message: string;
  containerId: string;
}

// ============================================
// Usage Stats
// ============================================

export interface UsageData {
  id: string;
  inputTokens: number;
  outputTokens: number;
  containerId: string;
}

// ============================================
// Turn Configuration
// ============================================

export type TurnRole = 'user' | 'assistant';

export interface TurnBindData {
  turnId: string;
  role: TurnRole;
  contentOrder?: ContentOrderEntry[];
}

// ============================================
// Turn State (for publications)
// ============================================

export interface TurnState {
  turnId: string | null;
  role: TurnRole | null;
  isStreaming: boolean;
  hasInterleaved: boolean;
  textSegmentCount: number;
  toolBatchCount: number;
}
