/**
 * Database layer — barrel exports.
 */

// Core
export { JeromyDatabase } from "./database.js";
export type { DatabaseOptions } from "./database.js";

// Event store
export { EventStore } from "./eventStore.js";

// Session manager
export { SessionManager } from "./sessionManager.js";

// Snapshot manager
export { SnapshotManager } from "./snapshotManager.js";

// Types
export type {
  EventType,
  AssetType,
  DbEvent,
  SeqEvent,
  NewEvent,
  UserInstructionData,
  AssistantResponseData,
  ToolCallData,
  ToolResultData,
  ScreenshotCapturedData,
  MemoryReadData,
  MemoryWriteData,
  DisassemblyAnalyzedData,
  PaletteEditData,
  SpriteEditData,
  MappingDiscoveredData,
  MappingHypothesisData,
  EditCompletedData,
  EditVerifiedData,
  ForkCreatedData,
  EventDataMap,
  Session,
  SessionMetadata,
  SessionSummary,
  Snapshot,
  SnapshotMetadata,
} from "./types.js";
