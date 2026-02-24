// @vitest-environment happy-dom
/**
 * Tests for VirtualListActor
 *
 * Adapted from Moby's VirtualListActor.test.ts for jeROMy.
 * Drops thinking, shell, pending files, drawing tests.
 * Adds tool result, screenshot, error, usage stats tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventStateManager } from '../../state/EventStateManager';
import { resetUniqueIdCounter } from '../../utils/uniqueId';

// ============================================
// Mocks
// ============================================

// Mock ResizeObserver (not available in happy-dom)
const resizeObserverInstances: any[] = [];
globalThis.ResizeObserver = class ResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor() { resizeObserverInstances.push(this); }
} as any;

// Track all mock TurnActor instances for assertions
const mockTurnActorInstances: any[] = [];

vi.mock('../turn/TurnActor.js', () => {
  class MockTurnActor {
    private _element: HTMLElement;

    constructor(config: { manager: any; element: HTMLElement }) {
      this._element = config.element;
      mockTurnActorInstances.push(this);
    }

    reset = vi.fn();
    bind = vi.fn();
    startStreaming = vi.fn();
    endStreaming = vi.fn();
    isStreaming = vi.fn().mockReturnValue(false);
    needsNewSegment = vi.fn().mockReturnValue(false);
    hasInterleaved = vi.fn().mockReturnValue(false);
    createTextSegment = vi.fn().mockReturnValue('seg-1');
    updateTextContent = vi.fn();
    finalizeCurrentSegment = vi.fn().mockReturnValue(true);
    resumeWithNewSegment = vi.fn();
    startToolBatch = vi.fn().mockReturnValue('batch-1');
    updateTool = vi.fn();
    addToolToBatch = vi.fn().mockReturnValue(0);
    completeToolBatch = vi.fn();
    addToolResult = vi.fn().mockReturnValue('result-1');
    addScreenshot = vi.fn().mockReturnValue('screenshot-1');
    addError = vi.fn().mockReturnValue('error-1');
    addUsageStats = vi.fn().mockReturnValue('usage-1');
    getElement() { return this._element; }
    destroy = vi.fn();
  }

  return { TurnActor: MockTurnActor };
});

import { VirtualListActor } from './VirtualListActor';

// ============================================
// Tests
// ============================================

describe('VirtualListActor', () => {
  let manager: EventStateManager;
  let scrollContainer: HTMLElement;
  let actor: VirtualListActor;

  beforeEach(() => {
    resetUniqueIdCounter();
    mockTurnActorInstances.length = 0;
    manager = new EventStateManager();
    scrollContainer = document.createElement('div');
    document.body.appendChild(scrollContainer);
  });

  afterEach(() => {
    actor?.destroy();
    manager.resetStyles();
    scrollContainer.remove();
  });

  function createActor(config?: { config?: Record<string, number> }) {
    actor = new VirtualListActor(manager, scrollContainer, config);
    return actor;
  }

  // ========================================
  // Constructor
  // ========================================

  describe('Constructor', () => {
    it('creates a content container inside the scroll container', () => {
      createActor();
      const content = scrollContainer.querySelector('.virtual-list-content');
      expect(content).toBeTruthy();
      expect(content!.parentElement).toBe(scrollContainer);
    });

    it('sets relative position and full width on content container', () => {
      createActor();
      const content = scrollContainer.querySelector('.virtual-list-content') as HTMLElement;
      expect(content.style.position).toBe('relative');
      expect(content.style.width).toBe('100%');
    });

    it('pre-warms pool with default minPoolSize (3) actors', () => {
      createActor();
      expect(mockTurnActorInstances.length).toBe(3);
      const stats = actor.getPoolStats();
      expect(stats.actorsInPool).toBe(3);
      expect(stats.totalCreated).toBe(3);
    });

    it('respects custom minPoolSize config', () => {
      createActor({ config: { minPoolSize: 5 } });
      expect(mockTurnActorInstances.length).toBe(5);
      expect(actor.getPoolStats().actorsInPool).toBe(5);
    });

    it('sets up scroll event listener on scroll container', () => {
      const addSpy = vi.spyOn(scrollContainer, 'addEventListener');
      createActor();
      expect(addSpy).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true });
    });
  });

  // ========================================
  // Pool Management
  // ========================================

  describe('Pool Management', () => {
    it('acquires actors from the pool when adding turns', () => {
      createActor();
      expect(actor.getPoolStats().actorsInPool).toBe(3);

      actor.addTurn('turn-1', 'user');

      expect(actor.getPoolStats().actorsInPool).toBe(2);
      expect(actor.getPoolStats().actorsInUse).toBe(1);
    });

    it('creates new actors when pool is exhausted', () => {
      createActor({ config: { minPoolSize: 1 } });
      expect(mockTurnActorInstances.length).toBe(1);

      actor.addTurn('turn-1', 'user');
      actor.addTurn('turn-2', 'assistant');

      // Pool had 1, used 1, needed 1 more → created 1 more
      expect(mockTurnActorInstances.length).toBe(2);
    });

    it('releases actors back to pool on clear', () => {
      createActor({ config: { minPoolSize: 1, maxPoolSize: 10 } });
      actor.addTurn('turn-1', 'user');
      actor.addTurn('turn-2', 'assistant');
      expect(actor.getPoolStats().actorsInUse).toBe(2);

      actor.clear();

      expect(actor.getPoolStats().actorsInUse).toBe(0);
      // Actors should have been reset before returning to pool
      const resetCalls = mockTurnActorInstances.filter(a => a.reset.mock.calls.length > 0);
      expect(resetCalls.length).toBeGreaterThan(0);
    });

    it('destroys excess actors beyond maxPoolSize on clear', () => {
      createActor({ config: { minPoolSize: 0, maxPoolSize: 1 } });
      actor.addTurn('t1', 'user');
      actor.addTurn('t2', 'assistant');
      actor.addTurn('t3', 'user');

      actor.clear();

      expect(actor.getPoolStats().actorsInPool).toBeLessThanOrEqual(1);
    });

    it('getPoolStats returns correct statistics', () => {
      createActor();

      const initial = actor.getPoolStats();
      expect(initial).toEqual({
        totalTurns: 0,
        visibleTurns: 0,
        actorsInUse: 0,
        actorsInPool: 3,
        totalCreated: 3
      });

      actor.addTurn('turn-1', 'user');

      const afterOne = actor.getPoolStats();
      expect(afterOne.totalTurns).toBe(1);
      expect(afterOne.actorsInUse).toBe(1);
      expect(afterOne.actorsInPool).toBe(2);
    });

    it('tracks totalCreated across pool exhaustion', () => {
      createActor({ config: { minPoolSize: 1 } });
      expect(actor.getPoolStats().totalCreated).toBe(1);

      actor.addTurn('t1', 'user');
      actor.addTurn('t2', 'assistant');

      expect(actor.getPoolStats().totalCreated).toBe(2);
    });
  });

  // ========================================
  // Turn Management
  // ========================================

  describe('Turn Management', () => {
    beforeEach(() => {
      createActor();
    });

    it('addTurn creates turn data with correct fields', () => {
      const turn = actor.addTurn('user-1', 'user');

      expect(turn.turnId).toBe('user-1');
      expect(turn.role).toBe('user');
      expect(turn.index).toBe(0);
      expect(turn.isStreaming).toBe(false);
      expect(turn.textSegments).toEqual([]);
      expect(turn.toolBatches).toEqual([]);
      expect(turn.toolResults).toEqual([]);
      expect(turn.screenshots).toEqual([]);
      expect(turn.errors).toEqual([]);
      expect(turn.usageStats).toEqual([]);
      expect(turn.contentOrder).toEqual([]);
    });

    it('addTurn binds an actor to the turn', () => {
      actor.addTurn('user-1', 'user');
      const bound = actor.getBoundActor('user-1') as any;

      expect(bound).toBeTruthy();
      expect(bound.bind).toHaveBeenCalledWith({
        turnId: 'user-1',
        role: 'user'
      });
    });

    it('addTurn appends actor element to content container', () => {
      actor.addTurn('user-1', 'user');
      const content = scrollContainer.querySelector('.virtual-list-content')!;

      expect(content.children.length).toBe(1);
      expect((content.children[0] as HTMLElement).className).toBe('virtual-list-turn');
    });

    it('addTurn assigns sequential indices', () => {
      const t1 = actor.addTurn('t1', 'user');
      const t2 = actor.addTurn('t2', 'assistant');
      const t3 = actor.addTurn('t3', 'user');

      expect(t1.index).toBe(0);
      expect(t2.index).toBe(1);
      expect(t3.index).toBe(2);
    });

    it('addTurn accumulates offsetTop from default heights', () => {
      actor.addTurn('t1', 'user');
      const t2 = actor.addTurn('t2', 'assistant');

      // Default height is 0, so offset is 0
      expect(t2.offsetTop).toBe(0);
    });

    it('getTurn returns correct turn by ID', () => {
      actor.addTurn('user-1', 'user');
      actor.addTurn('assistant-1', 'assistant');

      expect(actor.getTurn('user-1')?.role).toBe('user');
      expect(actor.getTurn('assistant-1')?.role).toBe('assistant');
      expect(actor.getTurn('nonexistent')).toBeUndefined();
    });

    it('getBoundActor returns the actor for a turn', () => {
      actor.addTurn('user-1', 'user');

      expect(actor.getBoundActor('user-1')).toBeTruthy();
      expect(actor.getBoundActor('nonexistent')).toBeUndefined();
    });

    it('getStreamingTurn returns undefined when no streaming turn', () => {
      actor.addTurn('user-1', 'user');
      expect(actor.getStreamingTurn()).toBeUndefined();
    });
  });

  // ========================================
  // Streaming Lifecycle
  // ========================================

  describe('Streaming Lifecycle', () => {
    beforeEach(() => {
      createActor();
    });

    it('startStreamingTurn marks turn as streaming', () => {
      actor.addTurn('a1', 'assistant');
      actor.startStreamingTurn('a1');

      expect(actor.getTurn('a1')?.isStreaming).toBe(true);
      expect(actor.getStreamingTurn()?.turnId).toBe('a1');
    });

    it('startStreamingTurn calls actor.startStreaming()', () => {
      actor.addTurn('a1', 'assistant');
      const bound = actor.getBoundActor('a1') as any;

      actor.startStreamingTurn('a1');

      expect(bound.startStreaming).toHaveBeenCalled();
    });

    it('endStreamingTurn clears streaming state', () => {
      actor.addTurn('a1', 'assistant');
      actor.startStreamingTurn('a1');
      actor.endStreamingTurn();

      expect(actor.getStreamingTurn()).toBeUndefined();
      expect(actor.getTurn('a1')?.isStreaming).toBe(false);
    });

    it('endStreamingTurn calls actor.endStreaming()', () => {
      actor.addTurn('a1', 'assistant');
      const bound = actor.getBoundActor('a1') as any;
      actor.startStreamingTurn('a1');

      actor.endStreamingTurn();

      expect(bound.endStreaming).toHaveBeenCalled();
    });

    it('endStreamingTurn is a no-op when no streaming turn', () => {
      actor.addTurn('user-1', 'user');
      // Should not throw
      actor.endStreamingTurn();
    });

    it('ignores startStreamingTurn for non-existent turns', () => {
      actor.startStreamingTurn('nonexistent');
      expect(actor.getStreamingTurn()).toBeUndefined();
    });
  });

  // ========================================
  // Text Segment Delegation
  // ========================================

  describe('Text Segments', () => {
    beforeEach(() => {
      createActor();
    });

    it('addTextSegment creates segment data', () => {
      actor.addTurn('t1', 'assistant');
      const segId = actor.addTextSegment('t1', 'Hello world');

      expect(segId).not.toBeNull();
      const turn = actor.getTurn('t1')!;
      expect(turn.textSegments.length).toBe(1);
      expect(turn.textSegments[0].content).toBe('Hello world');
      expect(turn.textSegments[0].isContinuation).toBe(false);
    });

    it('addTextSegment delegates to bound actor', () => {
      actor.addTurn('t1', 'assistant');
      const bound = actor.getBoundActor('t1') as any;

      actor.addTextSegment('t1', 'Hello');

      expect(bound.createTextSegment).toHaveBeenCalledWith('Hello', { isContinuation: false });
    });

    it('addTextSegment with isContinuation flag', () => {
      actor.addTurn('t1', 'assistant');
      actor.addTextSegment('t1', 'First');
      actor.addTextSegment('t1', 'Second', true);

      const turn = actor.getTurn('t1')!;
      expect(turn.textSegments[1].isContinuation).toBe(true);
    });

    it('addTextSegment tracks contentOrder', () => {
      actor.addTurn('t1', 'assistant');
      actor.addTextSegment('t1', 'First');
      actor.addTextSegment('t1', 'Second');

      const turn = actor.getTurn('t1')!;
      expect(turn.contentOrder).toEqual([
        { type: 'text', index: 0 },
        { type: 'text', index: 1 }
      ]);
    });

    it('addTextSegment generates unique segment IDs', () => {
      actor.addTurn('t1', 'assistant');
      actor.addTextSegment('t1', 'First');
      actor.addTextSegment('t1', 'Second');

      const turn = actor.getTurn('t1')!;
      expect(turn.textSegments[0].id).not.toBe(turn.textSegments[1].id);
    });

    it('updateTextContent updates last segment', () => {
      actor.addTurn('t1', 'assistant');
      actor.addTextSegment('t1', 'Hello');
      actor.updateTextContent('t1', 'Hello World');

      const turn = actor.getTurn('t1')!;
      expect(turn.textSegments[0].content).toBe('Hello World');
    });

    it('updateTextContent delegates to bound actor', () => {
      actor.addTurn('t1', 'assistant');
      actor.addTextSegment('t1', 'Hello');
      const bound = actor.getBoundActor('t1') as any;

      actor.updateTextContent('t1', 'Updated');

      expect(bound.updateTextContent).toHaveBeenCalledWith('Updated');
    });

    it('finalizeCurrentSegment marks segment as complete', () => {
      actor.addTurn('t1', 'assistant');
      actor.startStreamingTurn('t1');
      actor.addTextSegment('t1', 'Content');

      // During streaming, segment.complete defaults to false
      const turn = actor.getTurn('t1')!;
      expect(turn.textSegments[0].complete).toBe(false);

      actor.finalizeCurrentSegment('t1');

      expect(turn.textSegments[0].complete).toBe(true);
    });

    it('finalizeCurrentSegment delegates to bound actor', () => {
      actor.addTurn('t1', 'assistant');
      actor.addTextSegment('t1', 'Content');
      const bound = actor.getBoundActor('t1') as any;

      actor.finalizeCurrentSegment('t1');

      expect(bound.finalizeCurrentSegment).toHaveBeenCalled();
    });

    it('finalizeCurrentSegment returns false for non-existent turn', () => {
      expect(actor.finalizeCurrentSegment('nonexistent')).toBe(false);
    });

    it('resumeWithNewSegment creates a continuation segment', () => {
      actor.addTurn('t1', 'assistant');
      actor.addTextSegment('t1', 'First');
      actor.resumeWithNewSegment('t1');

      const turn = actor.getTurn('t1')!;
      expect(turn.textSegments.length).toBe(2);
      expect(turn.textSegments[1].isContinuation).toBe(true);
      expect(turn.textSegments[1].content).toBe('');
    });

    it('resumeWithNewSegment delegates to bound actor', () => {
      actor.addTurn('t1', 'assistant');
      actor.addTextSegment('t1', 'First');
      const bound = actor.getBoundActor('t1') as any;

      actor.resumeWithNewSegment('t1');

      expect(bound.resumeWithNewSegment).toHaveBeenCalled();
    });

    it('resumeWithNewSegment tracks contentOrder', () => {
      actor.addTurn('t1', 'assistant');
      actor.addTextSegment('t1', 'First');
      actor.resumeWithNewSegment('t1');

      const turn = actor.getTurn('t1')!;
      expect(turn.contentOrder).toEqual([
        { type: 'text', index: 0 },
        { type: 'text', index: 1 }
      ]);
    });

    it('addTextSegment returns null for non-existent turn', () => {
      expect(actor.addTextSegment('nonexistent', 'text')).toBeNull();
    });

    it('updateTextContent is a no-op for non-existent turn', () => {
      // Should not throw
      actor.updateTextContent('nonexistent', 'text');
    });
  });

  // ========================================
  // Tool Batch Delegation
  // ========================================

  describe('Tool Batches', () => {
    beforeEach(() => {
      createActor();
    });

    it('startToolBatch creates batch data', () => {
      actor.addTurn('t1', 'assistant');
      const batchId = actor.startToolBatch('t1', [
        { name: 'screenshot', detail: '' },
        { name: 'get_palette', detail: 'palette_id: 2' }
      ]);

      expect(batchId).not.toBeNull();
      const turn = actor.getTurn('t1')!;
      expect(turn.toolBatches.length).toBe(1);
      expect(turn.toolBatches[0].calls.length).toBe(2);
      expect(turn.toolBatches[0].calls[0].name).toBe('screenshot');
      expect(turn.toolBatches[0].calls[0].status).toBe('running');
    });

    it('startToolBatch delegates to bound actor', () => {
      actor.addTurn('t1', 'assistant');
      const bound = actor.getBoundActor('t1') as any;

      actor.startToolBatch('t1', [{ name: 'screenshot', detail: '' }]);

      expect(bound.startToolBatch).toHaveBeenCalledWith([{ name: 'screenshot', detail: '' }]);
    });

    it('startToolBatch tracks contentOrder', () => {
      actor.addTurn('t1', 'assistant');
      actor.startToolBatch('t1', [{ name: 'screenshot', detail: '' }]);

      const turn = actor.getTurn('t1')!;
      expect(turn.contentOrder).toEqual([{ type: 'tools', index: 0 }]);
    });

    it('updateToolInCurrentBatch updates tool status', () => {
      actor.addTurn('t1', 'assistant');
      actor.startToolBatch('t1', [{ name: 'screenshot', detail: '' }]);
      actor.updateToolInCurrentBatch('t1', 0, 'done');

      const turn = actor.getTurn('t1')!;
      expect(turn.toolBatches[0].calls[0].status).toBe('done');
    });

    it('updateToolInCurrentBatch delegates to bound actor', () => {
      actor.addTurn('t1', 'assistant');
      const bound = actor.getBoundActor('t1') as any;
      actor.startToolBatch('t1', [{ name: 'screenshot', detail: '' }]);

      actor.updateToolInCurrentBatch('t1', 0, 'done');

      expect(bound.updateTool).toHaveBeenCalledWith(0, 'done');
    });

    it('addToolToCurrentBatch adds tool to last batch', () => {
      actor.addTurn('t1', 'assistant');
      actor.startToolBatch('t1', [{ name: 'screenshot', detail: '' }]);
      const index = actor.addToolToCurrentBatch('t1', 'get_palette', 'palette_id: 2');

      expect(index).toBe(1);
      const turn = actor.getTurn('t1')!;
      expect(turn.toolBatches[0].calls.length).toBe(2);
      expect(turn.toolBatches[0].calls[1].name).toBe('get_palette');
    });

    it('addToolToCurrentBatch delegates to bound actor', () => {
      actor.addTurn('t1', 'assistant');
      const bound = actor.getBoundActor('t1') as any;
      actor.startToolBatch('t1', [{ name: 'screenshot', detail: '' }]);

      actor.addToolToCurrentBatch('t1', 'get_palette', 'id: 2');

      expect(bound.addToolToBatch).toHaveBeenCalledWith('get_palette', 'id: 2');
    });

    it('completeCurrentToolBatch marks batch as complete', () => {
      actor.addTurn('t1', 'assistant');
      actor.startToolBatch('t1', [{ name: 'screenshot', detail: '' }]);
      actor.completeCurrentToolBatch('t1');

      const turn = actor.getTurn('t1')!;
      expect(turn.toolBatches[0].complete).toBe(true);
    });

    it('completeCurrentToolBatch delegates to bound actor', () => {
      actor.addTurn('t1', 'assistant');
      const bound = actor.getBoundActor('t1') as any;
      actor.startToolBatch('t1', [{ name: 'screenshot', detail: '' }]);

      actor.completeCurrentToolBatch('t1');

      expect(bound.completeToolBatch).toHaveBeenCalled();
    });

    it('startToolBatch returns null for non-existent turn', () => {
      expect(actor.startToolBatch('nonexistent', [])).toBeNull();
    });

    it('addToolToCurrentBatch returns -1 for non-existent turn', () => {
      expect(actor.addToolToCurrentBatch('nonexistent', 'tool', 'detail')).toBe(-1);
    });

    it('addToolToCurrentBatch returns -1 when no active batch', () => {
      actor.addTurn('t1', 'assistant');
      expect(actor.addToolToCurrentBatch('t1', 'tool', 'detail')).toBe(-1);
    });
  });

  // ========================================
  // jeROMy-Specific Content
  // ========================================

  describe('Tool Results', () => {
    beforeEach(() => {
      createActor();
      actor.addTurn('t1', 'assistant');
    });

    it('addToolResult creates tool result data', () => {
      actor.addToolResult('t1', 'get_palette', '{"colors":[0,1,2,3]}', false);

      const turn = actor.getTurn('t1')!;
      expect(turn.toolResults.length).toBe(1);
      expect(turn.toolResults[0].name).toBe('get_palette');
      expect(turn.toolResults[0].result).toBe('{"colors":[0,1,2,3]}');
      expect(turn.toolResults[0].isError).toBe(false);
    });

    it('addToolResult delegates to bound actor', () => {
      const bound = actor.getBoundActor('t1') as any;
      actor.addToolResult('t1', 'get_palette', 'result', false);

      expect(bound.addToolResult).toHaveBeenCalledWith('get_palette', 'result', false);
    });

    it('addToolResult tracks contentOrder', () => {
      actor.addToolResult('t1', 'get_palette', 'result', false);

      expect(actor.getTurn('t1')!.contentOrder).toEqual([
        { type: 'tool_result', index: 0 }
      ]);
    });

    it('addToolResult handles error results', () => {
      actor.addToolResult('t1', 'read_memory', 'bridge disconnected', true);

      expect(actor.getTurn('t1')!.toolResults[0].isError).toBe(true);
    });

    it('generates unique result IDs', () => {
      actor.addToolResult('t1', 'tool1', 'r1', false);
      actor.addToolResult('t1', 'tool2', 'r2', false);

      const turn = actor.getTurn('t1')!;
      expect(turn.toolResults[0].id).not.toBe(turn.toolResults[1].id);
    });
  });

  describe('Screenshots', () => {
    beforeEach(() => {
      createActor();
      actor.addTurn('t1', 'assistant');
    });

    it('addScreenshot creates screenshot data', () => {
      actor.addScreenshot('t1', 'AAAA==');

      const turn = actor.getTurn('t1')!;
      expect(turn.screenshots.length).toBe(1);
      expect(turn.screenshots[0].base64).toBe('AAAA==');
    });

    it('addScreenshot delegates to bound actor', () => {
      const bound = actor.getBoundActor('t1') as any;
      actor.addScreenshot('t1', 'AAAA==');

      expect(bound.addScreenshot).toHaveBeenCalledWith('AAAA==');
    });

    it('addScreenshot tracks contentOrder', () => {
      actor.addScreenshot('t1', 'AAAA==');

      expect(actor.getTurn('t1')!.contentOrder).toEqual([
        { type: 'screenshot', index: 0 }
      ]);
    });
  });

  describe('Errors', () => {
    beforeEach(() => {
      createActor();
      actor.addTurn('t1', 'assistant');
    });

    it('addError creates error data', () => {
      actor.addError('t1', 'Something went wrong');

      const turn = actor.getTurn('t1')!;
      expect(turn.errors.length).toBe(1);
      expect(turn.errors[0].message).toBe('Something went wrong');
    });

    it('addError delegates to bound actor', () => {
      const bound = actor.getBoundActor('t1') as any;
      actor.addError('t1', 'Error');

      expect(bound.addError).toHaveBeenCalledWith('Error');
    });

    it('addError tracks contentOrder', () => {
      actor.addError('t1', 'Error');

      expect(actor.getTurn('t1')!.contentOrder).toEqual([
        { type: 'error', index: 0 }
      ]);
    });
  });

  describe('Usage Stats', () => {
    beforeEach(() => {
      createActor();
      actor.addTurn('t1', 'assistant');
    });

    it('addUsageStats creates usage data', () => {
      actor.addUsageStats('t1', 500, 200);

      const turn = actor.getTurn('t1')!;
      expect(turn.usageStats.length).toBe(1);
      expect(turn.usageStats[0].inputTokens).toBe(500);
      expect(turn.usageStats[0].outputTokens).toBe(200);
    });

    it('addUsageStats delegates to bound actor', () => {
      const bound = actor.getBoundActor('t1') as any;
      actor.addUsageStats('t1', 500, 200);

      expect(bound.addUsageStats).toHaveBeenCalledWith(500, 200);
    });

    it('addUsageStats tracks contentOrder', () => {
      actor.addUsageStats('t1', 500, 200);

      expect(actor.getTurn('t1')!.contentOrder).toEqual([
        { type: 'usage', index: 0 }
      ]);
    });
  });

  describe('Non-existent turn operations', () => {
    beforeEach(() => {
      createActor();
    });

    it('all operations are no-ops for non-existent turns', () => {
      // None of these should throw
      actor.addToolResult('nonexistent', 'tool', 'result', false);
      actor.addScreenshot('nonexistent', 'AAAA');
      actor.addError('nonexistent', 'error');
      actor.addUsageStats('nonexistent', 0, 0);
      actor.updateTextContent('nonexistent', 'text');
      actor.updateToolInCurrentBatch('nonexistent', 0, 'done');
      actor.completeCurrentToolBatch('nonexistent');
      actor.resumeWithNewSegment('nonexistent');
    });
  });

  // ========================================
  // Content Order Tracking
  // ========================================

  describe('Content Order', () => {
    beforeEach(() => {
      createActor();
      actor.addTurn('t1', 'assistant');
    });

    it('tracks full interleaved content order', () => {
      actor.addTextSegment('t1', 'Hello');
      actor.startToolBatch('t1', [{ name: 'screenshot', detail: '' }]);
      actor.addToolResult('t1', 'screenshot', '{"png_base64":"..."}', false);
      actor.addScreenshot('t1', 'AAAA==');
      actor.addTextSegment('t1', 'Done', true);
      actor.addError('t1', 'minor warning');
      actor.addUsageStats('t1', 100, 50);

      const turn = actor.getTurn('t1')!;
      expect(turn.contentOrder).toEqual([
        { type: 'text', index: 0 },
        { type: 'tools', index: 0 },
        { type: 'tool_result', index: 0 },
        { type: 'screenshot', index: 0 },
        { type: 'text', index: 1 },
        { type: 'error', index: 0 },
        { type: 'usage', index: 0 }
      ]);
    });

    it('indexes increment per content type', () => {
      actor.addToolResult('t1', 'tool1', 'r1', false);
      actor.addToolResult('t1', 'tool2', 'r2', false);
      actor.addScreenshot('t1', 'img1');
      actor.addScreenshot('t1', 'img2');

      const turn = actor.getTurn('t1')!;
      expect(turn.contentOrder).toEqual([
        { type: 'tool_result', index: 0 },
        { type: 'tool_result', index: 1 },
        { type: 'screenshot', index: 0 },
        { type: 'screenshot', index: 1 }
      ]);
    });
  });

  // ========================================
  // Clear
  // ========================================

  describe('Clear', () => {
    beforeEach(() => {
      createActor();
    });

    it('removes all turns', () => {
      actor.addTurn('t1', 'user');
      actor.addTurn('t2', 'assistant');

      actor.clear();

      expect(actor.getPoolStats().totalTurns).toBe(0);
      expect(actor.getTurn('t1')).toBeUndefined();
      expect(actor.getTurn('t2')).toBeUndefined();
    });

    it('releases all bound actors', () => {
      actor.addTurn('t1', 'user');
      actor.addTurn('t2', 'assistant');
      expect(actor.getPoolStats().actorsInUse).toBe(2);

      actor.clear();

      expect(actor.getPoolStats().actorsInUse).toBe(0);
    });

    it('resets streaming state', () => {
      actor.addTurn('a1', 'assistant');
      actor.startStreamingTurn('a1');

      actor.clear();

      expect(actor.getStreamingTurn()).toBeUndefined();
    });

    it('disconnects resize observers', () => {
      const countBefore = resizeObserverInstances.length;
      actor.addTurn('t1', 'user');
      expect(resizeObserverInstances.length).toBeGreaterThan(countBefore);

      const observer = resizeObserverInstances[resizeObserverInstances.length - 1];
      actor.clear();

      expect(observer.disconnect).toHaveBeenCalled();
    });
  });

  // ========================================
  // Edge Cases
  // ========================================

  describe('Edge Cases', () => {
    beforeEach(() => {
      createActor();
    });

    it('handles multiple sequential text segments', () => {
      actor.addTurn('t1', 'assistant');
      actor.addTextSegment('t1', 'Part 1');
      actor.addTextSegment('t1', 'Part 2');
      actor.addTextSegment('t1', 'Part 3');

      expect(actor.getTurn('t1')!.textSegments.length).toBe(3);
    });

    it('handles multiple tool batches', () => {
      actor.addTurn('t1', 'assistant');
      actor.startToolBatch('t1', [{ name: 'tool1', detail: '' }]);
      actor.completeCurrentToolBatch('t1');
      actor.startToolBatch('t1', [{ name: 'tool2', detail: '' }]);
      actor.completeCurrentToolBatch('t1');

      expect(actor.getTurn('t1')!.toolBatches.length).toBe(2);
    });

    it('handles rapid turn additions', () => {
      for (let i = 0; i < 50; i++) {
        actor.addTurn(`turn-${i}`, i % 2 === 0 ? 'user' : 'assistant');
      }

      expect(actor.getPoolStats().totalTurns).toBe(50);
    });

    it('updateTextContent on turn with no segments is a no-op', () => {
      actor.addTurn('t1', 'assistant');
      // Should not throw
      actor.updateTextContent('t1', 'orphaned text');
    });

    it('tool batch operations are no-ops when no batch exists', () => {
      actor.addTurn('t1', 'assistant');
      // Should not throw
      actor.updateToolInCurrentBatch('t1', 0, 'done');
      actor.completeCurrentToolBatch('t1');
    });
  });

  // ========================================
  // Integration: Full Conversation Flow
  // ========================================

  describe('Integration', () => {
    it('simulates a complete NES ROM hacking conversation', () => {
      createActor();

      // User turn
      actor.addTurn('user-1', 'user');
      actor.addTextSegment('user-1', 'Make the rock orange');

      // Assistant turn
      actor.addTurn('assistant-1', 'assistant');
      actor.startStreamingTurn('assistant-1');

      // Text → tool → result → tool → screenshot → text → done
      actor.addTextSegment('assistant-1', 'Let me check the palette...');
      actor.updateTextContent('assistant-1', 'Let me check the palette and modify it.');
      actor.finalizeCurrentSegment('assistant-1');

      actor.startToolBatch('assistant-1', [
        { name: 'get_palette', detail: 'palette_id: 2' }
      ]);
      actor.updateToolInCurrentBatch('assistant-1', 0, 'done');
      actor.addToolResult('assistant-1', 'get_palette', '{"colors":[0,1,2,3]}', false);
      actor.completeCurrentToolBatch('assistant-1');

      actor.resumeWithNewSegment('assistant-1');
      actor.updateTextContent('assistant-1', 'Writing new color...');

      actor.startToolBatch('assistant-1', [
        { name: 'write_palette', detail: 'palette: 2, idx: 1, color: 0x27' },
        { name: 'screenshot', detail: '' }
      ]);
      actor.updateToolInCurrentBatch('assistant-1', 0, 'done');
      actor.addToolResult('assistant-1', 'write_palette', '{"old":0,"new":39}', false);
      actor.updateToolInCurrentBatch('assistant-1', 1, 'done');
      actor.addScreenshot('assistant-1', 'SCREENSHOT_BASE64');
      actor.completeCurrentToolBatch('assistant-1');

      actor.resumeWithNewSegment('assistant-1');
      actor.updateTextContent('assistant-1', 'Done! The rock is now orange.');

      actor.endStreamingTurn();
      actor.addUsageStats('assistant-1', 1500, 350);

      // Verify final state
      const turn = actor.getTurn('assistant-1')!;
      expect(turn.textSegments.length).toBe(3);
      expect(turn.toolBatches.length).toBe(2);
      expect(turn.toolResults.length).toBe(2);
      expect(turn.screenshots.length).toBe(1);
      expect(turn.usageStats.length).toBe(1);
      expect(turn.isStreaming).toBe(false);
      expect(turn.contentOrder.length).toBe(9);
    });

    it('handles multiple turns in a session', () => {
      createActor();

      // Turn 1: user
      actor.addTurn('u1', 'user');
      actor.addTextSegment('u1', 'What palettes does the game use?');

      // Turn 2: assistant
      actor.addTurn('a1', 'assistant');
      actor.startStreamingTurn('a1');
      actor.addTextSegment('a1', 'Let me check...');
      actor.startToolBatch('a1', [{ name: 'get_all_palettes', detail: '' }]);
      actor.updateToolInCurrentBatch('a1', 0, 'done');
      actor.addToolResult('a1', 'get_all_palettes', '{...}', false);
      actor.completeCurrentToolBatch('a1');
      actor.resumeWithNewSegment('a1');
      actor.updateTextContent('a1', 'Here are the palettes...');
      actor.endStreamingTurn();
      actor.addUsageStats('a1', 800, 200);

      // Turn 3: user
      actor.addTurn('u2', 'user');
      actor.addTextSegment('u2', 'Change palette 2 color 1 to orange');

      // Turn 4: assistant
      actor.addTurn('a2', 'assistant');
      actor.startStreamingTurn('a2');
      actor.addTextSegment('a2', 'Done!');
      actor.endStreamingTurn();

      expect(actor.getPoolStats().totalTurns).toBe(4);
    });
  });

  // ========================================
  // Lifecycle
  // ========================================

  describe('Lifecycle', () => {
    it('destroy removes scroll event listener', () => {
      const removeSpy = vi.spyOn(scrollContainer, 'removeEventListener');
      createActor();

      actor.destroy();

      expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
    });

    it('destroy releases and destroys all actors', () => {
      createActor();
      actor.addTurn('t1', 'user');
      actor.addTurn('t2', 'assistant');

      actor.destroy();

      // All actors (bound + pooled) should have destroy called
      const destroyedActors = mockTurnActorInstances.filter(a => a.destroy.mock.calls.length > 0);
      expect(destroyedActors.length).toBeGreaterThan(0);
    });

    it('destroy removes content container from DOM', () => {
      createActor();
      expect(scrollContainer.querySelector('.virtual-list-content')).toBeTruthy();

      actor.destroy();

      expect(scrollContainer.querySelector('.virtual-list-content')).toBeFalsy();
    });

    it('destroy clears turn data', () => {
      createActor();
      actor.addTurn('t1', 'user');

      actor.destroy();

      expect(actor.getTurn('t1')).toBeUndefined();
    });
  });
});
