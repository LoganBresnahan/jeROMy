/**
 * ScrollActor
 *
 * Auto-scrolls the chat container to the bottom during streaming.
 * Respects user intent: if the user has manually scrolled up, auto-scroll
 * is suspended until they scroll back near the bottom.
 *
 * Uses a lightweight EventStateActor (no Shadow DOM needed).
 *
 * Subscriptions:
 * - virtualList.streaming: boolean — trigger auto-scroll during streaming
 */

import { EventStateActor } from '../../state/EventStateActor.js';
import { EventStateManager } from '../../state/EventStateManager.js';
import type { ActorConfig } from '../../state/types.js';

// ============================================
// Configuration
// ============================================

export interface ScrollActorConfig {
  manager: EventStateManager;
  /** The scrollable container element (same element the VirtualList uses) */
  element: HTMLElement;
  /** Distance from bottom (px) to consider "near bottom". Default: 80 */
  threshold?: number;
}

// ============================================
// Actor
// ============================================

export class ScrollActor extends EventStateActor {
  private readonly scrollContainer: HTMLElement;
  private readonly threshold: number;

  /** Whether auto-scroll is active (user hasn't scrolled away) */
  private _autoScrollEnabled = true;

  /** Whether we're currently in a streaming turn */
  private _isStreaming = false;

  /** RAF handle for scroll animation */
  private _rafHandle: number | null = null;

  /** MutationObserver for content changes */
  private _contentObserver: MutationObserver | null = null;

  constructor(config: ScrollActorConfig) {
    const actorConfig: ActorConfig = {
      manager: config.manager,
      element: config.element,
      publications: {},
      subscriptions: {
        'virtualList.streaming': (value: unknown) => {
          this._isStreaming = value as boolean;
          if (this._isStreaming) {
            // Re-enable auto-scroll when a new stream starts
            this._autoScrollEnabled = true;
            this._observeContentChanges();
            this.scrollToBottom();
          } else {
            this._stopObserving();
          }
        },
      },
      enableDOMChangeDetection: false,
    };

    super(actorConfig);

    this.scrollContainer = config.element;
    this.threshold = config.threshold ?? 80;

    // Track user scroll to detect manual scroll-up
    this.scrollContainer.addEventListener('scroll', this._onScroll, { passive: true });
  }

  // ============================================
  // Scroll Logic
  // ============================================

  /** Scroll to the bottom of the container. */
  scrollToBottom(): void {
    if (!this._autoScrollEnabled) return;

    if (this._rafHandle) {
      cancelAnimationFrame(this._rafHandle);
    }

    this._rafHandle = requestAnimationFrame(() => {
      this._rafHandle = null;
      this.scrollContainer.scrollTop = this.scrollContainer.scrollHeight;
    });
  }

  /** Check if the scroll position is near the bottom. */
  private _isNearBottom(): boolean {
    const { scrollTop, scrollHeight, clientHeight } = this.scrollContainer;
    return scrollHeight - scrollTop - clientHeight < this.threshold;
  }

  // ============================================
  // Event Handlers
  // ============================================

  private _onScroll = (): void => {
    if (!this._isStreaming) return;

    // If user scrolled away from bottom, disable auto-scroll
    // If they scroll back near bottom, re-enable it
    this._autoScrollEnabled = this._isNearBottom();
  };

  // ============================================
  // Content Observation
  // ============================================

  /**
   * During streaming, observe DOM mutations on the scroll container
   * to auto-scroll when new content appears.
   */
  private _observeContentChanges(): void {
    this._stopObserving();

    this._contentObserver = new MutationObserver(() => {
      this.scrollToBottom();
    });

    this._contentObserver.observe(this.scrollContainer, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  private _stopObserving(): void {
    if (this._contentObserver) {
      this._contentObserver.disconnect();
      this._contentObserver = null;
    }
  }

  // ============================================
  // Lifecycle
  // ============================================

  destroy(): void {
    this.scrollContainer.removeEventListener('scroll', this._onScroll);
    this._stopObserving();

    if (this._rafHandle) {
      cancelAnimationFrame(this._rafHandle);
      this._rafHandle = null;
    }

    super.destroy();
  }
}
