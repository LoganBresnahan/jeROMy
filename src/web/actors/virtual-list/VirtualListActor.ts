/**
 * VirtualListActor
 *
 * Manages all turn data (source of truth) and pools TurnActor instances
 * for efficient rendering of the conversation view.
 *
 * Architecture:
 * - Extends EventStateActor (light DOM, no shadow root)
 * - Maintains ordered list of TurnData as the single source of truth
 * - Pools TurnActor instances for reuse when virtual scrolling is enabled
 * - Currently binds ALL turns (virtual scrolling deferred — see VIRTUAL_SCROLL markers)
 *
 * Performance:
 * - O(1) actor acquisition/release from pool
 * - O(1) turn lookup by ID via Map
 * - Height caching for future virtual scroll support
 *
 * Publications:
 * - virtualList.turnCount: number — total turns in the list
 * - virtualList.streaming: boolean — whether any turn is currently streaming
 */

import { EventStateActor } from '../../state/EventStateActor.js';
import { EventStateManager } from '../../state/EventStateManager.js';
import { TurnActor } from '../turn/TurnActor.js';
import type { ActorConfig } from '../../state/types.js';
import type {
  TurnData,
  TurnRole,
  TextSegmentData,
  ToolBatchData,
  ToolCallData,
  ToolResultData,
  ScreenshotData,
  ErrorData,
  UsageData,
  VisibleRange,
  VirtualListConfig,
  PoolStats
} from './types.js';
import { DEFAULT_CONFIG } from './types.js';

// ============================================
// Actor Binding
// ============================================

interface BoundActor {
  actor: TurnActor;
  turnId: string;
  element: HTMLElement;
  resizeObserver: ResizeObserver;
}

// ============================================
// VirtualListActor
// ============================================

export class VirtualListActor extends EventStateActor {
  // ============================================
  // Configuration
  // ============================================

  private readonly config: Required<VirtualListConfig>;

  // ============================================
  // Turn Data (source of truth)
  // ============================================

  /** All turns in order */
  private _turns: TurnData[] = [];

  /** Quick lookup by turnId */
  private _turnMap: Map<string, TurnData> = new Map();

  /** The currently streaming turn (if any) */
  private _streamingTurnId: string | null = null;

  // ============================================
  // Actor Pool
  // ============================================

  /** Available actors for reuse */
  private _pool: TurnActor[] = [];

  /** Actors currently bound to turns */
  private _boundActors: Map<string, BoundActor> = new Map();

  /** Total actors ever created (for stats) */
  private _totalCreated = 0;

  // ============================================
  // Scroll + Height
  // ============================================

  /** The scrollable container element */
  private _scrollContainer: HTMLElement;

  /** Content container inside the scroll container */
  private _contentContainer: HTMLElement;

  /** Scroll event handler reference (for cleanup) */
  private _scrollHandler: (() => void) | null = null;

  /** Total content height (sum of all turn heights) */
  private _totalHeight = 0;

  /** Current visible range (for future virtual scrolling) */
  private _visibleRange: VisibleRange = {
    startIndex: 0,
    endIndex: -1
  };

  // ============================================
  // Constructor
  // ============================================

  constructor(
    manager: EventStateManager,
    scrollContainer: HTMLElement,
    options?: {
      config?: VirtualListConfig;
    }
  ) {
    // Create content container inside scroll container
    const contentContainer = document.createElement('div');
    contentContainer.className = 'virtual-list-content';
    contentContainer.style.position = 'relative';
    contentContainer.style.width = '100%';
    scrollContainer.appendChild(contentContainer);

    const actorConfig: ActorConfig = {
      manager,
      element: contentContainer,
      publications: {
        'virtualList.turnCount': () => this._turns.length,
        'virtualList.streaming': () => this._streamingTurnId !== null
      },
      subscriptions: {},
      enableDOMChangeDetection: false
    };

    super(actorConfig);

    this.config = { ...DEFAULT_CONFIG, ...options?.config };
    this._scrollContainer = scrollContainer;
    this._contentContainer = contentContainer;

    this.setupScrollHandling();
    this.prewarmPool();
  }

  // ============================================
  // Initialization
  // ============================================

  private setupScrollHandling(): void {
    this._scrollHandler = () => {
      // VIRTUAL_SCROLL: When virtual scrolling is enabled, this would
      // debounce and call updateVisibility() to recalculate which turns
      // are in the viewport and reconcile bound actors accordingly.
      this.updateVisibility();
    };

    this._scrollContainer.addEventListener('scroll', this._scrollHandler, { passive: true });
  }

  private prewarmPool(): void {
    for (let i = 0; i < this.config.minPoolSize; i++) {
      const actor = this.createActor();
      this._pool.push(actor);
    }
  }

  // ============================================
  // Actor Pool Management
  // ============================================

  private createActor(): TurnActor {
    this._totalCreated++;

    // Create host element for the actor
    const hostElement = document.createElement('div');
    hostElement.className = 'virtual-list-turn';

    return new TurnActor({
      manager: this.manager,
      element: hostElement,
    });
  }

  private acquireActor(): TurnActor {
    let actor = this._pool.pop();

    if (!actor) {
      actor = this.createActor();
    }

    return actor;
  }

  private releaseActor(actor: TurnActor): void {
    actor.reset();

    // Remove from DOM
    actor.getElement().remove();

    // Keep in pool up to max size
    if (this._pool.length < this.config.maxPoolSize) {
      this._pool.push(actor);
    } else {
      actor.destroy();
    }
  }

  getPoolStats(): PoolStats {
    return {
      totalTurns: this._turns.length,
      visibleTurns: this._boundActors.size,
      actorsInUse: this._boundActors.size,
      actorsInPool: this._pool.length,
      totalCreated: this._totalCreated
    };
  }

  // ============================================
  // Turn Management
  // ============================================

  /**
   * Add a new turn to the list.
   * Returns the turn data for further updates.
   */
  addTurn(turnId: string, role: TurnRole): TurnData {
    const turn: TurnData = {
      turnId,
      role,
      timestamp: Date.now(),
      height: this.config.defaultTurnHeight,
      heightMeasured: false,
      offsetTop: this._totalHeight,
      visible: false,
      index: this._turns.length,
      textSegments: [],
      toolBatches: [],
      toolResults: [],
      screenshots: [],
      errors: [],
      usageStats: [],
      isStreaming: false,
      contentOrder: []
    };

    this._turns.push(turn);
    this._turnMap.set(turnId, turn);
    this._totalHeight += turn.height;

    // Bind immediately (no virtual scrolling yet)
    this.bindActorToTurn(turn);

    this.publish({
      'virtualList.turnCount': this._turns.length
    });

    return turn;
  }

  /**
   * Get a turn by ID.
   */
  getTurn(turnId: string): TurnData | undefined {
    return this._turnMap.get(turnId);
  }

  /**
   * Get the currently streaming turn.
   */
  getStreamingTurn(): TurnData | undefined {
    return this._streamingTurnId
      ? this._turnMap.get(this._streamingTurnId)
      : undefined;
  }

  /**
   * Get the bound actor for a turn (if any).
   */
  getBoundActor(turnId: string): TurnActor | undefined {
    return this._boundActors.get(turnId)?.actor;
  }

  /**
   * Remove all turns and release all actors.
   */
  clear(): void {
    // Release all bound actors
    for (const [, bound] of this._boundActors) {
      bound.resizeObserver.disconnect();
      this.releaseActor(bound.actor);
    }
    this._boundActors.clear();

    // Clear turn data
    this._turns = [];
    this._turnMap.clear();
    this._streamingTurnId = null;
    this._totalHeight = 0;
    this._visibleRange = { startIndex: 0, endIndex: -1 };

    this.publish({
      'virtualList.turnCount': 0,
      'virtualList.streaming': false
    });
  }

  // ============================================
  // Streaming Turn Lifecycle
  // ============================================

  /**
   * Start streaming on a turn.
   * Always ensures an actor is bound for the streaming turn.
   */
  startStreamingTurn(turnId: string): void {
    const turn = this._turnMap.get(turnId);
    if (!turn) return;

    turn.isStreaming = true;
    this._streamingTurnId = turnId;

    // Ensure an actor is bound (should already be since we bind all turns)
    let bound = this._boundActors.get(turnId);
    if (!bound) {
      this.bindActorToTurn(turn);
      bound = this._boundActors.get(turnId);
    }

    if (bound) {
      bound.actor.startStreaming();
      // Measure after streaming header renders
      this.measureTurnHeight(turnId);
    }

    this.publish({
      'virtualList.streaming': true
    });
  }

  /**
   * End streaming on the current turn.
   */
  endStreamingTurn(): void {
    if (!this._streamingTurnId) return;

    const turn = this._turnMap.get(this._streamingTurnId);
    if (turn) {
      turn.isStreaming = false;
    }

    const bound = this._boundActors.get(this._streamingTurnId);
    if (bound) {
      bound.actor.endStreaming();
      this.measureTurnHeight(this._streamingTurnId);
    }

    this._streamingTurnId = null;

    this.publish({
      'virtualList.streaming': false
    });
  }

  // ============================================
  // Text Segment Delegation
  // ============================================

  /**
   * Add a text segment to a turn.
   * Returns the segment ID, or null if the turn was not found.
   */
  addTextSegment(turnId: string, content: string, isContinuation = false): string | null {
    const turn = this._turnMap.get(turnId);
    if (!turn) return null;

    const segmentIndex = turn.textSegments.length;
    const segmentId = `${turnId}-text-${segmentIndex + 1}`;
    const segment: TextSegmentData = {
      id: segmentId,
      content,
      isContinuation,
      complete: !turn.isStreaming
    };

    turn.textSegments.push(segment);
    turn.contentOrder.push({ type: 'text', index: segmentIndex });

    // Delegate to bound actor
    const bound = this._boundActors.get(turnId);
    if (bound) {
      bound.actor.createTextSegment(content, { isContinuation });
    }

    return segmentId;
  }

  /**
   * Update text content in the current (last) segment.
   */
  updateTextContent(turnId: string, content: string): void {
    const turn = this._turnMap.get(turnId);
    if (!turn) return;

    const lastSegment = turn.textSegments[turn.textSegments.length - 1];
    if (lastSegment) {
      lastSegment.content = content;
    }

    const bound = this._boundActors.get(turnId);
    if (bound) {
      bound.actor.updateTextContent(content);
    }
  }

  /**
   * Finalize current segment before interleaving with other content.
   */
  finalizeCurrentSegment(turnId: string): boolean {
    const turn = this._turnMap.get(turnId);
    if (!turn) return false;

    const lastSegment = turn.textSegments[turn.textSegments.length - 1];
    if (lastSegment) {
      lastSegment.complete = true;
    }

    const bound = this._boundActors.get(turnId);
    if (bound) {
      return bound.actor.finalizeCurrentSegment();
    }

    return false;
  }

  /**
   * Resume with a new continuation segment after interleaving.
   * Creates the segment in both data and actor.
   *
   * NOTE: We add data directly here instead of using addTextSegment
   * because resumeWithNewSegment() already creates the segment in the actor,
   * and addTextSegment would create a duplicate.
   */
  resumeWithNewSegment(turnId: string): void {
    const turn = this._turnMap.get(turnId);
    if (!turn) return;

    // Create segment in actor first (if bound)
    const bound = this._boundActors.get(turnId);
    if (bound) {
      bound.actor.resumeWithNewSegment();
    }

    // Add segment data directly (NOT via addTextSegment — that would duplicate in the actor)
    const segmentIndex = turn.textSegments.length;
    const segmentId = `${turnId}-text-${segmentIndex + 1}`;
    const segment: TextSegmentData = {
      id: segmentId,
      content: '',
      isContinuation: true,
      complete: false
    };

    turn.textSegments.push(segment);
    turn.contentOrder.push({ type: 'text', index: segmentIndex });
  }

  // ============================================
  // Tool Batch Delegation
  // ============================================

  /**
   * Start a tool batch.
   * Returns the batch ID, or null if the turn was not found.
   */
  startToolBatch(turnId: string, tools: Array<{ name: string; detail: string }>): string | null {
    const turn = this._turnMap.get(turnId);
    if (!turn) return null;

    const batchIndex = turn.toolBatches.length;
    const batchId = `${turnId}-tools-${batchIndex + 1}`;
    const batch: ToolBatchData = {
      id: batchId,
      calls: tools.map(tool => ({
        name: tool.name,
        detail: tool.detail,
        status: 'running' as const
      })),
      expanded: false,
      complete: false
    };

    turn.toolBatches.push(batch);
    turn.contentOrder.push({ type: 'tools', index: batchIndex });

    const bound = this._boundActors.get(turnId);
    if (bound) {
      bound.actor.startToolBatch(tools);
    }

    return batchId;
  }

  /**
   * Update a tool's status within the current (last) batch.
   */
  updateToolInCurrentBatch(turnId: string, index: number, status: ToolCallData['status']): void {
    const turn = this._turnMap.get(turnId);
    if (!turn) return;

    // Update the last batch's tool at the given index
    const lastBatch = turn.toolBatches[turn.toolBatches.length - 1];
    if (lastBatch && lastBatch.calls[index]) {
      lastBatch.calls[index].status = status;
    }

    const bound = this._boundActors.get(turnId);
    if (bound) {
      bound.actor.updateTool(index, status);
    }
  }

  /**
   * Add another tool to the current (last) batch.
   * Returns the index of the newly added tool.
   */
  addToolToCurrentBatch(turnId: string, name: string, detail: string): number {
    const turn = this._turnMap.get(turnId);
    if (!turn) return -1;

    const lastBatch = turn.toolBatches[turn.toolBatches.length - 1];
    if (!lastBatch) return -1;

    const index = lastBatch.calls.length;
    lastBatch.calls.push({
      name,
      detail,
      status: 'running' as const,
    });

    const bound = this._boundActors.get(turnId);
    if (bound) {
      bound.actor.addToolToBatch(name, detail);
    }

    return index;
  }

  /**
   * Complete the current (last) tool batch.
   */
  completeCurrentToolBatch(turnId: string): void {
    const turn = this._turnMap.get(turnId);
    if (!turn) return;

    const lastBatch = turn.toolBatches[turn.toolBatches.length - 1];
    if (lastBatch) {
      lastBatch.complete = true;
    }

    const bound = this._boundActors.get(turnId);
    if (bound) {
      bound.actor.completeToolBatch();
    }
  }

  // ============================================
  // jeROMy-specific Content Delegation
  // ============================================

  /**
   * Add a tool result to a turn.
   */
  addToolResult(turnId: string, name: string, result: string, isError: boolean): void {
    const turn = this._turnMap.get(turnId);
    if (!turn) return;

    const resultIndex = turn.toolResults.length;
    const resultId = `${turnId}-result-${resultIndex + 1}`;
    const toolResult: ToolResultData = {
      id: resultId,
      name,
      result,
      isError
    };

    turn.toolResults.push(toolResult);
    turn.contentOrder.push({ type: 'tool_result', index: resultIndex });

    const bound = this._boundActors.get(turnId);
    if (bound) {
      bound.actor.addToolResult(name, result, isError);
    }
  }

  /**
   * Add a screenshot to a turn.
   */
  addScreenshot(turnId: string, base64: string): void {
    const turn = this._turnMap.get(turnId);
    if (!turn) return;

    const screenshotIndex = turn.screenshots.length;
    const screenshotId = `${turnId}-screenshot-${screenshotIndex + 1}`;
    const screenshot: ScreenshotData = {
      id: screenshotId,
      base64
    };

    turn.screenshots.push(screenshot);
    turn.contentOrder.push({ type: 'screenshot', index: screenshotIndex });

    const bound = this._boundActors.get(turnId);
    if (bound) {
      bound.actor.addScreenshot(base64);
    }
  }

  /**
   * Add an error to a turn.
   */
  addError(turnId: string, message: string): void {
    const turn = this._turnMap.get(turnId);
    if (!turn) return;

    const errorIndex = turn.errors.length;
    const errorId = `${turnId}-error-${errorIndex + 1}`;
    const error: ErrorData = {
      id: errorId,
      message
    };

    turn.errors.push(error);
    turn.contentOrder.push({ type: 'error', index: errorIndex });

    const bound = this._boundActors.get(turnId);
    if (bound) {
      bound.actor.addError(message);
    }
  }

  /**
   * Add usage stats to a turn.
   */
  addUsageStats(turnId: string, input: number, output: number): void {
    const turn = this._turnMap.get(turnId);
    if (!turn) return;

    const usageIndex = turn.usageStats.length;
    const usageId = `${turnId}-usage-${usageIndex + 1}`;
    const usage: UsageData = {
      id: usageId,
      inputTokens: input,
      outputTokens: output
    };

    turn.usageStats.push(usage);
    turn.contentOrder.push({ type: 'usage', index: usageIndex });

    const bound = this._boundActors.get(turnId);
    if (bound) {
      bound.actor.addUsageStats(input, output);
    }
  }

  // ============================================
  // Visibility + Binding
  // ============================================

  /**
   * Calculate which turns are in the viewport + overscan.
   *
   * VIRTUAL_SCROLL: Currently a no-op since all turns are always bound.
   * When virtual scrolling is enabled, this would:
   * 1. Read scrollTop and clientHeight from the scroll container
   * 2. Walk _turns to find which are in [scrollTop - overscan, scrollTop + viewportHeight + overscan]
   * 3. Call reconcileActors() to bind/unbind as needed
   */
  private updateVisibility(): void {
    // VIRTUAL_SCROLL: Implement viewport intersection calculation here.
    // For now, all turns are bound on creation and never unbound until clear().
  }

  /**
   * Bind an actor to a turn: acquire from pool, append to DOM, restore content.
   */
  private bindActorToTurn(turn: TurnData): void {
    const actor = this.acquireActor();
    const element = actor.getElement();

    // VIRTUAL_SCROLL: When virtual scrolling is enabled, position absolutely:
    // element.style.position = 'absolute';
    // element.style.top = `${turn.offsetTop}px`;
    // element.style.left = '0';
    // element.style.right = '0';

    // Append to content container
    this._contentContainer.appendChild(element);

    // Bind turn data to the actor
    actor.bind({
      turnId: turn.turnId,
      role: turn.role
    });

    // Restore streaming state if active
    if (turn.isStreaming) {
      actor.startStreaming();
    }

    // Restore all previously recorded content
    this.restoreTurnContent(actor, turn);

    // Observe height changes for layout tracking
    const resizeObserver = new ResizeObserver(() => {
      this.measureTurnHeight(turn.turnId);
    });
    resizeObserver.observe(element);

    // Store binding
    this._boundActors.set(turn.turnId, {
      actor,
      turnId: turn.turnId,
      element,
      resizeObserver
    });

    // Measure initial height
    this.measureTurnHeight(turn.turnId);
  }

  /**
   * Unbind an actor from a turn and release it back to the pool.
   */
  private unbindActor(turnId: string): void {
    const bound = this._boundActors.get(turnId);
    if (!bound) return;

    bound.resizeObserver.disconnect();
    this.releaseActor(bound.actor);
    this._boundActors.delete(turnId);
  }

  /**
   * Replay contentOrder to reconstruct a turn's content in a freshly acquired actor.
   * This is the inverse of the incremental content updates — it replays them all at once.
   */
  private restoreTurnContent(actor: TurnActor, turn: TurnData): void {
    for (const entry of turn.contentOrder) {
      switch (entry.type) {
        case 'text': {
          const segment = turn.textSegments[entry.index];
          if (segment) {
            actor.createTextSegment(segment.content, { isContinuation: segment.isContinuation });
          }
          break;
        }

        case 'tools': {
          const batch = turn.toolBatches[entry.index];
          if (batch) {
            actor.startToolBatch(batch.calls.map(c => ({ name: c.name, detail: c.detail })));
            // Restore individual tool statuses
            batch.calls.forEach((call, i) => {
              if (call.status !== 'running') {
                actor.updateTool(i, call.status);
              }
            });
            if (batch.complete) {
              actor.completeToolBatch();
            }
          }
          break;
        }

        case 'tool_result': {
          const result = turn.toolResults[entry.index];
          if (result) {
            actor.addToolResult(result.name, result.result, result.isError);
          }
          break;
        }

        case 'screenshot': {
          const screenshot = turn.screenshots[entry.index];
          if (screenshot) {
            actor.addScreenshot(screenshot.base64);
          }
          break;
        }

        case 'error': {
          const error = turn.errors[entry.index];
          if (error) {
            actor.addError(error.message);
          }
          break;
        }

        case 'usage': {
          const usage = turn.usageStats[entry.index];
          if (usage) {
            actor.addUsageStats(usage.inputTokens, usage.outputTokens);
          }
          break;
        }
      }
    }
  }

  // ============================================
  // Height Management
  // ============================================

  /**
   * Measure actual DOM height of a bound turn's element.
   * Updates the turn's cached height and recalculates offsets for all following turns.
   */
  private measureTurnHeight(turnId: string): void {
    const bound = this._boundActors.get(turnId);
    const turn = this._turnMap.get(turnId);
    if (!bound || !turn) return;

    const measuredHeight = bound.element.offsetHeight;

    if (measuredHeight > 0 && measuredHeight !== turn.height) {
      const heightDelta = measuredHeight - turn.height;
      turn.height = measuredHeight;
      turn.heightMeasured = true;

      // VIRTUAL_SCROLL: Update offsets for all following turns
      for (let i = turn.index + 1; i < this._turns.length; i++) {
        this._turns[i].offsetTop += heightDelta;

        // VIRTUAL_SCROLL: Reposition bound actors
        // const followingBound = this._boundActors.get(this._turns[i].turnId);
        // if (followingBound) {
        //   followingBound.element.style.top = `${this._turns[i].offsetTop}px`;
        // }
      }

      this._totalHeight += heightDelta;

      // VIRTUAL_SCROLL: Update content container height for scroll sizing
      // this._contentContainer.style.height = `${this._totalHeight}px`;
    }
  }

  // ============================================
  // Lifecycle
  // ============================================

  destroy(): void {
    // Remove scroll handler
    if (this._scrollHandler) {
      this._scrollContainer.removeEventListener('scroll', this._scrollHandler);
      this._scrollHandler = null;
    }

    // Release all bound actors
    for (const [, bound] of this._boundActors) {
      bound.resizeObserver.disconnect();
      bound.actor.destroy();
    }
    this._boundActors.clear();

    // Destroy pooled actors
    for (const actor of this._pool) {
      actor.destroy();
    }
    this._pool = [];

    // Remove content container
    this._contentContainer.remove();

    // Clear data
    this._turns = [];
    this._turnMap.clear();
    this._streamingTurnId = null;
    this._totalHeight = 0;

    super.destroy();
  }
}
