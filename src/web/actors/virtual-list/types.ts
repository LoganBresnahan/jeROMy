/**
 * Types for VirtualListActor
 *
 * The VirtualListActor manages a pool of TurnActor instances,
 * rendering only visible turns and recycling actors as the user scrolls.
 *
 * Simplified from Moby's VirtualListActor types for the jeROMy ROM hacking agent.
 * Content types are tailored to jeROMy's needs: text, tools, tool results,
 * screenshots, errors, and usage stats.
 */

// ============================================
// Roles and Content Types
// ============================================

export type TurnRole = 'user' | 'assistant';

export type ContentType = 'text' | 'tools' | 'tool_result' | 'screenshot' | 'error' | 'usage';

export interface ContentOrderEntry {
  type: ContentType;
  index: number;
}

// ============================================
// Segment Data Types
// ============================================

export interface TextSegmentData {
  id: string;
  content: string;
  isContinuation: boolean;
  complete: boolean;
}

export interface ToolCallData {
  name: string;
  detail: string;
  status: 'pending' | 'running' | 'done' | 'error';
  result?: string;
  isError?: boolean;
}

export interface ToolBatchData {
  id: string;
  calls: ToolCallData[];
  expanded: boolean;
  complete: boolean;
}

export interface ToolResultData {
  id: string;
  name: string;
  result: string;
  isError: boolean;
}

export interface ScreenshotData {
  id: string;
  base64: string;
}

export interface ErrorData {
  id: string;
  message: string;
}

export interface UsageData {
  id: string;
  inputTokens: number;
  outputTokens: number;
}

// ============================================
// Turn Data (source of truth for all turns)
// ============================================

/**
 * Complete turn data stored by the VirtualListActor.
 * This is the source of truth - actors are just views into this data.
 */
export interface TurnData {
  turnId: string;
  role: TurnRole;
  timestamp: number;

  // Height tracking for virtual rendering
  height: number;
  heightMeasured: boolean;
  offsetTop: number;
  visible: boolean;
  index: number;

  // Content (parallel arrays indexed by contentOrder)
  textSegments: TextSegmentData[];
  toolBatches: ToolBatchData[];
  toolResults: ToolResultData[];
  screenshots: ScreenshotData[];
  errors: ErrorData[];
  usageStats: UsageData[];

  isStreaming: boolean;
  contentOrder: ContentOrderEntry[];
}

// ============================================
// Visibility Range
// ============================================

export interface VisibleRange {
  startIndex: number;
  endIndex: number;
}

// ============================================
// Configuration
// ============================================

export interface VirtualListConfig {
  /** Minimum pool size (pre-created actors). Default: 3 */
  minPoolSize?: number;
  /** Maximum pool size (actors kept when released). Default: 15 */
  maxPoolSize?: number;
  /** Default estimated height for unmeasured turns. Default: 0 */
  defaultTurnHeight?: number;
  /** Overscan: extra turns to render above/below viewport. Default: 2 */
  overscan?: number;
}

export const DEFAULT_CONFIG: Required<VirtualListConfig> = {
  minPoolSize: 3,
  maxPoolSize: 15,
  defaultTurnHeight: 0,
  overscan: 2
};

// ============================================
// Pool Statistics
// ============================================

export interface PoolStats {
  totalTurns: number;
  visibleTurns: number;
  actorsInUse: number;
  actorsInPool: number;
  totalCreated: number;
}
