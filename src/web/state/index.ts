/**
 * Event State Management System
 *
 * Barrel export for the actor-based state management framework.
 */

// Core types
export type {
  GlobalState,
  PublicationGetter,
  SubscriptionHandler,
  PublicationMap,
  SubscriptionMap,
  ActorRegistration,
  StateChangeEvent,
  ActorConfig,
  LoggerConfig
} from './types';
export { LogLevel } from './types';

// Logger
export { EventStateLogger, logger, setLogLevel, shouldLog, enableDebugMode, disableDebugMode } from './EventStateLogger';

// Manager
export { EventStateManager } from './EventStateManager';

// Actor base classes
export { EventStateActor } from './EventStateActor';
export { ShadowActor } from './ShadowActor';
export type { ShadowActorConfig } from './ShadowActor';
export { InterleavedShadowActor } from './InterleavedShadowActor';
export type { ShadowContainer, InterleavedShadowConfig } from './InterleavedShadowActor';

// Shared styles
export {
  shadowBaseStyles,
  interleavedBaseStyles,
  commonButtonStyles,
  scrollbarStyles,
  inputStyles
} from './sharedStyles';
