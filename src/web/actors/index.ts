/**
 * Actors barrel export
 */

// Turn actor
export { TurnActor } from './turn/TurnActor.js';
export type { TurnActorConfig } from './turn/TurnActor.js';
export type {
  TurnRole,
  TurnBindData,
  TextSegment,
  ToolBatch,
  ToolCall,
  ToolStatus,
  ToolResultData as TurnToolResultData,
  ScreenshotData as TurnScreenshotData,
  ErrorData as TurnErrorData,
  UsageData as TurnUsageData,
  ContentOrderEntry as TurnContentOrderEntry,
} from './turn/types.js';

// Virtual list actor
export { VirtualListActor } from './virtual-list/VirtualListActor.js';
export type {
  TurnData,
  VirtualListConfig,
  PoolStats,
  ContentOrderEntry,
} from './virtual-list/types.js';

// Gateway actor
export { GatewayActor } from './gateway/GatewayActor.js';
export type { GatewayConfig } from './gateway/GatewayActor.js';

// Input area actor
export { InputAreaActor } from './input-area/InputAreaActor.js';
export type { InputAreaConfig } from './input-area/InputAreaActor.js';

// Scroll actor
export { ScrollActor } from './scroll/ScrollActor.js';
export type { ScrollActorConfig } from './scroll/ScrollActor.js';

// Emulator sidebar (vanilla JS, not actor-based)
export { EmulatorSidebar, NES_PALETTE } from './sidebar/EmulatorSidebar.js';
