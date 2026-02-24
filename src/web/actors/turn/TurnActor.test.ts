// @vitest-environment happy-dom
/**
 * Tests for TurnActor
 *
 * Adapted from Moby's MessageTurnActor.test.ts for jeROMy.
 * Drops thinking, shell, pending files, command approval, drawing tests.
 * Adds tool results, screenshots, errors, usage stats, palette swatches.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventStateManager } from '../../state/EventStateManager';
import { TurnActor } from './TurnActor';
import { resetUniqueIdCounter } from '../../utils/uniqueId';

// ============================================
// Helpers
// ============================================

/** Query inside shadow roots of an element's children */
function queryShadow(root: HTMLElement, selector: string): HTMLElement | null {
  for (const child of Array.from(root.children)) {
    const shadow = (child as HTMLElement).shadowRoot;
    if (shadow) {
      const found = shadow.querySelector<HTMLElement>(selector);
      if (found) return found;
    }
  }
  return null;
}

/** Get all matching elements across all shadow roots */
function queryShadowAll(root: HTMLElement, selector: string): HTMLElement[] {
  const results: HTMLElement[] = [];
  for (const child of Array.from(root.children)) {
    const shadow = (child as HTMLElement).shadowRoot;
    if (shadow) {
      results.push(...Array.from(shadow.querySelectorAll<HTMLElement>(selector)));
    }
  }
  return results;
}

/** Get text content from within shadow roots */
function getShadowText(root: HTMLElement, selector: string): string {
  const el = queryShadow(root, selector);
  return el?.textContent?.trim() ?? '';
}

/** Get the Nth shadow host child */
function getContainer(root: HTMLElement, index: number): HTMLElement | null {
  return root.children[index] as HTMLElement ?? null;
}

/** Get shadow content div from a container */
function getContainerContent(container: HTMLElement): HTMLElement | null {
  return container.shadowRoot?.querySelector('.container') ?? null;
}

// ============================================
// Tests
// ============================================

describe('TurnActor', () => {
  let manager: EventStateManager;
  let element: HTMLElement;
  let actor: TurnActor;

  beforeEach(() => {
    resetUniqueIdCounter();
    manager = new EventStateManager();
    element = document.createElement('div');
    document.body.appendChild(element);
  });

  afterEach(() => {
    actor?.destroy();
    manager.resetStyles();
    element.remove();
  });

  function createActor(): TurnActor {
    actor = new TurnActor({ manager, element });
    return actor;
  }

  function bindActor(role: 'user' | 'assistant' = 'assistant', turnId = 'test-turn'): void {
    actor.bind({ turnId, role });
  }

  // ========================================
  // Pool Lifecycle
  // ========================================

  describe('Pool Lifecycle', () => {
    it('initializes with null turnId', () => {
      createActor();
      expect(actor.turnId).toBeNull();
    });

    it('initializes with default assistant role', () => {
      createActor();
      expect(actor.role).toBe('assistant');
    });

    it('bind sets turn identity', () => {
      createActor();
      bindActor('user', 'user-turn-1');

      expect(actor.turnId).toBe('user-turn-1');
      expect(actor.role).toBe('user');
      expect(actor.isUser).toBe(true);
      expect(actor.isAssistant).toBe(false);
    });

    it('bind sets data attributes on element', () => {
      createActor();
      bindActor('assistant', 'a-turn-1');

      expect(element.getAttribute('data-turn-id')).toBe('a-turn-1');
      expect(element.getAttribute('data-role')).toBe('assistant');
    });

    it('reset clears all state', () => {
      createActor();
      bindActor('user', 'user-1');
      actor.startStreaming();
      actor.createTextSegment('Hello');

      actor.reset();

      expect(actor.turnId).toBeNull();
      expect(actor.role).toBe('assistant');
      expect(actor.isStreaming()).toBe(false);
      expect(actor.hasInterleaved()).toBe(false);
      expect(element.getAttribute('data-turn-id')).toBeNull();
      expect(element.children.length).toBe(0);
    });

    it('bind after reset allows reuse', () => {
      createActor();
      bindActor('user', 'first-turn');
      actor.createTextSegment('First content');

      actor.reset();
      bindActor('assistant', 'second-turn');

      expect(actor.turnId).toBe('second-turn');
      expect(actor.role).toBe('assistant');
    });
  });

  // ========================================
  // Streaming State
  // ========================================

  describe('Streaming', () => {
    beforeEach(() => {
      createActor();
      bindActor('assistant');
    });

    it('startStreaming sets streaming state', () => {
      actor.startStreaming();

      expect(actor.isStreaming()).toBe(true);
    });

    it('startStreaming renders role header immediately', () => {
      actor.startStreaming();

      // Header container should be created
      expect(element.children.length).toBeGreaterThanOrEqual(1);
      expect(getShadowText(element, '.message-divider-label')).toBe('jeROMy');
    });

    it('startStreaming for user renders YOU header', () => {
      actor.reset();
      bindActor('user');
      actor.startStreaming();

      expect(getShadowText(element, '.message-divider-label')).toBe('YOU');
    });

    it('startStreaming is idempotent for header', () => {
      actor.startStreaming();
      const childCount = element.children.length;

      actor.startStreaming();

      // Should not create a second header
      expect(element.children.length).toBe(childCount);
    });

    it('endStreaming clears streaming state', () => {
      actor.startStreaming();
      actor.endStreaming();

      expect(actor.isStreaming()).toBe(false);
    });

    it('endStreaming removes streaming class from text container', () => {
      actor.startStreaming();
      actor.createTextSegment('Hello');

      // Find text container host
      const containers = Array.from(element.children) as HTMLElement[];
      const textHost = containers.find(c => c.classList.contains('text-container'));

      actor.endStreaming();

      expect(textHost?.classList.contains('streaming')).toBe(false);
    });
  });

  // ========================================
  // Text Segments
  // ========================================

  describe('Text Segments', () => {
    beforeEach(() => {
      createActor();
      bindActor('assistant');
    });

    it('createTextSegment returns a segment ID', () => {
      const segId = actor.createTextSegment('Hello');

      expect(segId).toBeTruthy();
      expect(segId).toContain('test-turn-text-');
    });

    it('createTextSegment creates shadow container', () => {
      actor.createTextSegment('Hello');

      // Should have at least one container (possibly header + text)
      const containers = Array.from(element.children) as HTMLElement[];
      const textContainer = containers.find(c => c.classList.contains('text-container'));
      expect(textContainer).toBeTruthy();
      expect(textContainer!.shadowRoot).toBeTruthy();
    });

    it('createTextSegment renders content', () => {
      actor.createTextSegment('Hello world');

      expect(getShadowText(element, '.content')).toContain('Hello world');
    });

    it('createTextSegment renders user role divider for first segment', () => {
      actor.reset();
      bindActor('user');
      actor.createTextSegment('Hi there');

      expect(getShadowText(element, '.message-divider-label')).toContain('YOU');
    });

    it('createTextSegment renders assistant role divider for first segment', () => {
      actor.createTextSegment('Hi there');

      // Either the header was rendered by startStreaming, or by createTextSegment
      expect(getShadowText(element, '.message-divider-label')).toContain('JER');
    });

    it('continuation segment does not render role divider', () => {
      actor.createTextSegment('First');
      actor.createTextSegment('Second', { isContinuation: true });

      // Count divider labels — should only have 1 (from first segment)
      const dividers = queryShadowAll(element, '.message-divider-label');
      expect(dividers.length).toBe(1);
    });

    it('continuation segment has continuation class', () => {
      actor.createTextSegment('First');
      actor.createTextSegment('Second', { isContinuation: true });

      const containers = Array.from(element.children) as HTMLElement[];
      const continuation = containers.find(c => c.classList.contains('continuation'));
      expect(continuation).toBeTruthy();
    });

    it('updateTextContent updates content in current segment', () => {
      actor.createTextSegment('Initial');
      actor.updateTextContent('Updated text');

      expect(getShadowText(element, '.content')).toContain('Updated text');
    });

    it('updateTextContent creates segment lazily if none exists', () => {
      actor.updateTextContent('Lazy creation');

      expect(getShadowText(element, '.content')).toContain('Lazy creation');
    });

    it('getCurrentSegmentContent returns accumulated text', () => {
      actor.createTextSegment('Hello');
      actor.updateTextContent('Hello world');

      expect(actor.getCurrentSegmentContent()).toBe('Hello world');
    });
  });

  // ========================================
  // Interleaving (finalize / resume)
  // ========================================

  describe('Interleaving', () => {
    beforeEach(() => {
      createActor();
      bindActor('assistant');
      actor.startStreaming();
    });

    it('finalizeCurrentSegment returns true when segment exists', () => {
      actor.createTextSegment('Hello');

      expect(actor.finalizeCurrentSegment()).toBe(true);
    });

    it('finalizeCurrentSegment returns false when no segment', () => {
      expect(actor.finalizeCurrentSegment()).toBe(false);
    });

    it('finalizeCurrentSegment sets hasInterleaved', () => {
      actor.createTextSegment('Hello');
      actor.finalizeCurrentSegment();

      expect(actor.hasInterleaved()).toBe(true);
    });

    it('needsNewSegment returns true after finalize during streaming', () => {
      actor.createTextSegment('Hello');
      actor.finalizeCurrentSegment();

      expect(actor.needsNewSegment()).toBe(true);
    });

    it('needsNewSegment returns false when not paused', () => {
      actor.createTextSegment('Hello');

      expect(actor.needsNewSegment()).toBe(false);
    });

    it('resumeWithNewSegment creates continuation segment', () => {
      actor.createTextSegment('Before tool');
      actor.finalizeCurrentSegment();
      actor.resumeWithNewSegment();

      // Should have a new continuation container
      const containers = Array.from(element.children) as HTMLElement[];
      const continuationContainers = containers.filter(c =>
        c.classList.contains('continuation')
      );
      expect(continuationContainers.length).toBe(1);
    });

    it('resumeWithNewSegment is no-op when not paused', () => {
      actor.createTextSegment('Not paused');
      const childCount = element.children.length;

      actor.resumeWithNewSegment();

      expect(element.children.length).toBe(childCount);
    });

    it('full interleaving flow: text → tool → text', () => {
      // Text 1
      actor.createTextSegment('Checking palette...');
      actor.finalizeCurrentSegment();

      // Tool batch
      actor.startToolBatch([{ name: 'get_palette', detail: 'id: 2' }]);
      actor.completeToolBatch();

      // Text 2 (continuation)
      actor.resumeWithNewSegment();
      actor.updateTextContent('The palette has 4 colors.');

      // Verify structure: header + text1 + tools + text2
      const containers = Array.from(element.children) as HTMLElement[];
      expect(containers.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ========================================
  // Tool Batches
  // ========================================

  describe('Tool Batches', () => {
    beforeEach(() => {
      createActor();
      bindActor('assistant');
    });

    it('startToolBatch creates tool container', () => {
      actor.startToolBatch([{ name: 'screenshot', detail: '' }]);

      const containers = Array.from(element.children) as HTMLElement[];
      const toolsContainer = containers.find(c => c.classList.contains('tools-container'));
      expect(toolsContainer).toBeTruthy();
    });

    it('startToolBatch renders tool names', () => {
      actor.startToolBatch([
        { name: 'get_palette', detail: 'palette_id: 2' },
        { name: 'screenshot', detail: '' }
      ]);

      const toolNames = queryShadowAll(element, '.tool-name');
      expect(toolNames.length).toBe(2);
      expect(toolNames[0].textContent).toBe('get_palette');
      expect(toolNames[1].textContent).toBe('screenshot');
    });

    it('startToolBatch renders tool details', () => {
      actor.startToolBatch([
        { name: 'get_palette', detail: 'palette_id: 2' }
      ]);

      expect(getShadowText(element, '.tool-detail')).toBe('palette_id: 2');
    });

    it('updateTool changes tool status', () => {
      actor.startToolBatch([{ name: 'screenshot', detail: '' }]);
      actor.updateTool(0, 'done');

      const toolItem = queryShadow(element, '.tool-item');
      expect(toolItem?.getAttribute('data-status')).toBe('done');
    });

    it('addToolToBatch adds new tool to existing batch', () => {
      actor.startToolBatch([{ name: 'get_palette', detail: '' }]);
      const index = actor.addToolToBatch('screenshot', '');

      expect(index).toBe(1);
      const toolNames = queryShadowAll(element, '.tool-name');
      expect(toolNames.length).toBe(2);
    });

    it('completeToolBatch marks batch as complete', () => {
      actor.startToolBatch([{ name: 'screenshot', detail: '' }]);
      actor.updateTool(0, 'done');
      actor.completeToolBatch();

      const toolsContainer = Array.from(element.children).find(
        c => (c as HTMLElement).classList.contains('tools-container')
      ) as HTMLElement;
      expect(toolsContainer?.classList.contains('complete')).toBe(true);
    });

    it('renders status icons for each state', () => {
      actor.startToolBatch([
        { name: 'tool1', detail: '' },
        { name: 'tool2', detail: '' },
        { name: 'tool3', detail: '' }
      ]);

      actor.updateTool(0, 'done');
      actor.updateTool(1, 'error');
      // tool3 remains 'running'

      const items = queryShadowAll(element, '.tool-item');
      expect(items[0].getAttribute('data-status')).toBe('done');
      expect(items[1].getAttribute('data-status')).toBe('error');
      expect(items[2].getAttribute('data-status')).toBe('running');
    });

    it('renders title with tool count', () => {
      actor.startToolBatch([
        { name: 'tool1', detail: '' },
        { name: 'tool2', detail: '' }
      ]);

      expect(getShadowText(element, '.tools-title')).toContain('2 tool');
    });

    it('addToolToBatch returns -1 when no active batch', () => {
      expect(actor.addToolToBatch('tool', 'detail')).toBe(-1);
    });
  });

  // ========================================
  // Tool Results
  // ========================================

  describe('Tool Results', () => {
    beforeEach(() => {
      createActor();
      bindActor('assistant');
    });

    it('addToolResult creates result container', () => {
      actor.addToolResult('get_palette', '{"colors":[0,1,2,3]}', false);

      const containers = Array.from(element.children) as HTMLElement[];
      const resultContainer = containers.find(c =>
        c.classList.contains('tool-result-container')
      );
      expect(resultContainer).toBeTruthy();
    });

    it('addToolResult renders tool name', () => {
      actor.addToolResult('get_palette', '{"colors":[0]}', false);

      expect(getShadowText(element, '.tool-result-name')).toBe('get_palette');
    });

    it('addToolResult formats JSON result', () => {
      actor.addToolResult('get_palette', '{"colors":[0,1]}', false);

      const body = queryShadow(element, '.tool-result-body');
      expect(body?.textContent).toContain('colors');
    });

    it('addToolResult renders error style for error results', () => {
      actor.addToolResult('read_memory', 'bridge disconnected', true);

      const containers = Array.from(element.children) as HTMLElement[];
      const errorResult = containers.find(c => c.classList.contains('is-error'));
      expect(errorResult).toBeTruthy();
    });

    it('addToolResult renders checkmark for success', () => {
      actor.addToolResult('screenshot', '{}', false);

      // Check for the success icon (✓)
      const header = queryShadow(element, '.tool-result-header');
      expect(header?.textContent).toContain('\u2713');
    });

    it('addToolResult renders cross for error', () => {
      actor.addToolResult('screenshot', 'error', true);

      const header = queryShadow(element, '.tool-result-header');
      expect(header?.textContent).toContain('\u2717');
    });

    it('addToolResult renders palette swatches for color data', () => {
      const paletteJson = JSON.stringify({
        colors: ['#0F', '#16', '#27', '#30']
      });
      actor.addToolResult('get_palette', paletteJson, false);

      const swatches = queryShadowAll(element, '.palette-swatch');
      expect(swatches.length).toBe(4);
    });

    it('addToolResult does not render swatches for non-palette data', () => {
      actor.addToolResult('get_cpu_state', '{"pc":32768,"a":0}', false);

      const swatches = queryShadowAll(element, '.palette-swatch');
      expect(swatches.length).toBe(0);
    });
  });

  // ========================================
  // Screenshots
  // ========================================

  describe('Screenshots', () => {
    beforeEach(() => {
      createActor();
      bindActor('assistant');
    });

    it('addScreenshot creates screenshot container', () => {
      actor.addScreenshot('AAAA==');

      const containers = Array.from(element.children) as HTMLElement[];
      const screenshotContainer = containers.find(c =>
        c.classList.contains('screenshot-container')
      );
      expect(screenshotContainer).toBeTruthy();
    });

    it('addScreenshot renders img with base64 src', () => {
      actor.addScreenshot('iVBOR==');

      const img = queryShadow(element, 'img') as HTMLImageElement;
      expect(img).toBeTruthy();
      expect(img.src).toContain('data:image/png;base64,iVBOR==');
    });

    it('addScreenshot renders alt text', () => {
      actor.addScreenshot('AAAA==');

      const img = queryShadow(element, 'img') as HTMLImageElement;
      expect(img.alt).toBe('NES screenshot');
    });

    it('addScreenshot returns unique screenshot ID', () => {
      const id1 = actor.addScreenshot('AAAA');
      const id2 = actor.addScreenshot('BBBB');

      expect(id1).not.toBe(id2);
    });
  });

  // ========================================
  // Errors
  // ========================================

  describe('Errors', () => {
    beforeEach(() => {
      createActor();
      bindActor('assistant');
    });

    it('addError creates error container', () => {
      actor.addError('Something went wrong');

      const containers = Array.from(element.children) as HTMLElement[];
      const errorContainer = containers.find(c =>
        c.classList.contains('error-container')
      );
      expect(errorContainer).toBeTruthy();
    });

    it('addError renders error message', () => {
      actor.addError('Bridge disconnected');

      const body = queryShadow(element, '.error-body');
      expect(body?.textContent).toContain('Bridge disconnected');
    });

    it('addError renders error title', () => {
      actor.addError('Test error');

      expect(getShadowText(element, '.error-title')).toBe('Error');
    });

    it('addError renders cross icon', () => {
      actor.addError('Test error');

      expect(getShadowText(element, '.error-icon')).toBe('\u2717');
    });

    it('addError returns unique error ID', () => {
      const id1 = actor.addError('Error 1');
      const id2 = actor.addError('Error 2');

      expect(id1).not.toBe(id2);
    });
  });

  // ========================================
  // Usage Stats
  // ========================================

  describe('Usage Stats', () => {
    beforeEach(() => {
      createActor();
      bindActor('assistant');
    });

    it('addUsageStats creates usage container', () => {
      actor.addUsageStats(500, 200);

      const containers = Array.from(element.children) as HTMLElement[];
      const usageContainer = containers.find(c =>
        c.classList.contains('usage-container')
      );
      expect(usageContainer).toBeTruthy();
    });

    it('addUsageStats renders token counts', () => {
      actor.addUsageStats(1500, 350);

      const usageValues = queryShadowAll(element, '.usage-value');
      const values = usageValues.map(el => el.textContent);
      expect(values).toContain('1,500');
      expect(values).toContain('350');
      expect(values).toContain('1,850'); // total
    });

    it('addUsageStats renders label', () => {
      actor.addUsageStats(100, 50);

      expect(getShadowText(element, '.usage-label')).toBe('Tokens');
    });

    it('addUsageStats returns unique usage ID', () => {
      const id1 = actor.addUsageStats(100, 50);
      const id2 = actor.addUsageStats(200, 100);

      expect(id1).not.toBe(id2);
    });

    it('addUsageStats skips animation', () => {
      actor.addUsageStats(100, 50);

      const containers = Array.from(element.children) as HTMLElement[];
      const usageContainer = containers.find(c =>
        c.classList.contains('usage-container')
      );
      // skipAnimation: true means no anim-bubble-in class
      expect(usageContainer?.classList.contains('anim-bubble-in')).toBe(false);
    });
  });

  // ========================================
  // Content Formatting
  // ========================================

  describe('Content Formatting', () => {
    beforeEach(() => {
      createActor();
      bindActor('assistant');
    });

    it('renders inline code', () => {
      actor.createTextSegment('Use `screenshot()` to capture');

      const content = queryShadow(element, '.content');
      expect(content?.innerHTML).toContain('<code class="inline-code">');
      expect(content?.innerHTML).toContain('screenshot()');
    });

    it('renders bold text', () => {
      actor.createTextSegment('This is **important**');

      const content = queryShadow(element, '.content');
      expect(content?.innerHTML).toContain('<strong>important</strong>');
    });

    it('renders italic text', () => {
      actor.createTextSegment('This is *emphasized*');

      const content = queryShadow(element, '.content');
      expect(content?.innerHTML).toContain('<em>emphasized</em>');
    });

    it('renders line breaks', () => {
      actor.createTextSegment('Line 1\nLine 2');

      const content = queryShadow(element, '.content');
      expect(content?.innerHTML).toContain('<br>');
    });

    it('renders complete code blocks', () => {
      actor.createTextSegment('Here:\n```javascript\nconst x = 1;\n```\nDone');

      const codeBlock = queryShadow(element, '.code-block');
      expect(codeBlock).toBeTruthy();
    });

    it('renders code block language label', () => {
      actor.createTextSegment('Code:\n```typescript\nlet x = 1;\n```');

      expect(getShadowText(element, '.code-lang')).toBe('typescript');
    });

    it('renders streaming placeholder for incomplete code fence', () => {
      actor.startStreaming();
      actor.createTextSegment('');
      actor.updateTextContent('Here is code:\n```javascript\nconst x = 1;');

      const placeholder = queryShadow(element, '.code-generating');
      expect(placeholder).toBeTruthy();
    });

    it('does not render placeholder for complete code fence', () => {
      actor.createTextSegment('Code:\n```javascript\nconst x = 1;\n```');

      const placeholder = queryShadow(element, '.code-generating');
      expect(placeholder).toBeFalsy();
    });
  });

  // ========================================
  // Publications
  // ========================================

  describe('Publications', () => {
    beforeEach(() => {
      createActor();
    });

    it('publishes turn.id on bind', async () => {
      await new Promise(resolve => queueMicrotask(resolve));
      bindActor('assistant', 'test-turn-1');

      // The publication getter should return the turn ID
      expect(actor.turnId).toBe('test-turn-1');
    });

    it('publishes turn.role on bind', async () => {
      await new Promise(resolve => queueMicrotask(resolve));
      bindActor('user', 'user-turn');

      expect(actor.role).toBe('user');
    });

    it('publishes turn.streaming on startStreaming', () => {
      bindActor('assistant');
      actor.startStreaming();

      expect(actor.isStreaming()).toBe(true);
    });
  });

  // ========================================
  // Full Turn Flow
  // ========================================

  describe('Full Turn Flow', () => {
    it('renders a complete assistant turn with interleaving', () => {
      createActor();
      bindActor('assistant', 'full-turn');
      actor.startStreaming();

      // Text segment 1
      actor.createTextSegment('Let me check the palette...');
      actor.updateTextContent('Let me check the palette and modify it.');
      actor.finalizeCurrentSegment();

      // Tool batch
      actor.startToolBatch([
        { name: 'get_palette', detail: 'palette_id: 2' },
        { name: 'write_palette', detail: 'palette: 2, idx: 1' }
      ]);
      actor.updateTool(0, 'done');
      actor.updateTool(1, 'done');
      actor.completeToolBatch();

      // Tool result
      actor.addToolResult('get_palette', '{"colors":["#0F","#16","#27","#30"]}', false);
      actor.addToolResult('write_palette', '{"old":"#16","new":"#27"}', false);

      // Screenshot
      actor.addScreenshot('SCREENSHOT_BASE64');

      // Text segment 2 (continuation)
      actor.resumeWithNewSegment();
      actor.updateTextContent('Done! The rock is now orange.');

      // End streaming
      actor.endStreaming();

      // Usage
      actor.addUsageStats(1500, 350);

      // Verify structure
      const containers = Array.from(element.children) as HTMLElement[];
      expect(containers.length).toBeGreaterThanOrEqual(6); // header + text1 + tools + results + screenshot + text2 + usage

      // Verify swatches rendered from palette tool result
      const swatches = queryShadowAll(element, '.palette-swatch');
      expect(swatches.length).toBeGreaterThan(0);
    });

    it('renders a simple user turn', () => {
      createActor();
      bindActor('user', 'user-1');

      actor.createTextSegment('Make the rock orange');

      expect(getShadowText(element, '.content')).toContain('Make the rock orange');
    });
  });

  // ========================================
  // Lifecycle
  // ========================================

  describe('Lifecycle', () => {
    it('destroy clears all containers', () => {
      createActor();
      bindActor('assistant');
      actor.startStreaming();
      actor.createTextSegment('Hello');
      actor.startToolBatch([{ name: 'tool', detail: '' }]);

      actor.destroy();

      expect(element.children.length).toBe(0);
    });
  });
});
