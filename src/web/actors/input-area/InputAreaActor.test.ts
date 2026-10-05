// @vitest-environment happy-dom
/**
 * Tests for InputAreaActor
 *
 * Adapted from Moby's InputAreaShadowActor.test.ts for jeROMy.
 * Tests shadow DOM creation, input handling, send/abort/reset,
 * streaming state, screenshot attachment, and lifecycle.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventStateManager } from '../../state/EventStateManager';
import { InputAreaActor } from './InputAreaActor';
import { resetUniqueIdCounter } from '../../utils/uniqueId';

// ============================================
// Helpers
// ============================================

/** Query inside the shadow root */
function query(actor: HTMLElement, selector: string): HTMLElement | null {
  return actor.shadowRoot?.querySelector(selector) ?? null;
}

function queryAll(actor: HTMLElement, selector: string): HTMLElement[] {
  return Array.from(actor.shadowRoot?.querySelectorAll(selector) ?? []);
}

// ============================================
// Mock Gateway
// ============================================

function createMockGateway() {
  return {
    sendChat: vi.fn(),
    abortChat: vi.fn(),
    resetChat: vi.fn(),
    send: vi.fn(),
  } as any;
}

// ============================================
// Tests
// ============================================

describe('InputAreaActor', () => {
  let manager: EventStateManager;
  let element: HTMLElement;
  let gateway: ReturnType<typeof createMockGateway>;
  let actor: InputAreaActor;

  beforeEach(() => {
    resetUniqueIdCounter();
    manager = new EventStateManager();
    element = document.createElement('div');
    document.body.appendChild(element);
    gateway = createMockGateway();
  });

  afterEach(() => {
    actor?.destroy();
    manager.resetStyles();
    element.remove();
  });

  function createActor(): InputAreaActor {
    actor = new InputAreaActor({ manager, element, gateway });
    return actor;
  }

  // ========================================
  // Shadow DOM Creation
  // ========================================

  describe('Shadow DOM', () => {
    it('creates a shadow root', () => {
      createActor();

      expect(element.shadowRoot).toBeTruthy();
    });

    it('renders textarea', () => {
      createActor();

      const textarea = query(element, '#chatTextarea');
      expect(textarea).toBeTruthy();
      expect(textarea?.tagName).toBe('TEXTAREA');
    });

    it('renders send button', () => {
      createActor();

      const btn = query(element, '#sendBtn');
      expect(btn).toBeTruthy();
      expect(btn?.textContent).toContain('Send');
    });

    it('renders abort button', () => {
      createActor();

      const btn = query(element, '#abortBtn');
      expect(btn).toBeTruthy();
      expect(btn?.textContent).toContain('Stop');
    });

    it('renders reset button', () => {
      createActor();

      const btn = query(element, '#resetBtn');
      expect(btn).toBeTruthy();
    });

    it('renders attachment preview (hidden by default)', () => {
      createActor();

      const preview = query(element, '#attachPreview');
      expect(preview).toBeTruthy();
      expect(preview?.classList.contains('visible')).toBe(false);
    });

    it('renders placeholder text', () => {
      createActor();

      const textarea = query(element, '#chatTextarea') as HTMLTextAreaElement;
      expect(textarea.placeholder).toContain('jeROMy');
    });
  });

  // ========================================
  // Input Handling
  // ========================================

  describe('Input Handling', () => {
    it('focus() focuses the textarea', () => {
      createActor();
      const textarea = query(element, '#chatTextarea') as HTMLTextAreaElement;
      const focusSpy = vi.spyOn(textarea, 'focus');

      actor.focus();

      expect(focusSpy).toHaveBeenCalled();
    });
  });

  // ========================================
  // Send Functionality
  // ========================================

  describe('Send', () => {
    it('send button calls gateway.sendChat with textarea value', () => {
      createActor();
      const textarea = query(element, '#chatTextarea') as HTMLTextAreaElement;
      textarea.value = 'Make the rock orange';

      const sendBtn = query(element, '#sendBtn') as HTMLButtonElement;
      sendBtn.click();

      expect(gateway.sendChat).toHaveBeenCalledWith('Make the rock orange', undefined);
    });

    it('send clears the textarea after sending', () => {
      createActor();
      const textarea = query(element, '#chatTextarea') as HTMLTextAreaElement;
      textarea.value = 'Hello';

      const sendBtn = query(element, '#sendBtn') as HTMLButtonElement;
      sendBtn.click();

      expect(textarea.value).toBe('');
    });

    it('does not send empty messages', () => {
      createActor();
      const textarea = query(element, '#chatTextarea') as HTMLTextAreaElement;
      textarea.value = '   ';

      const sendBtn = query(element, '#sendBtn') as HTMLButtonElement;
      sendBtn.click();

      expect(gateway.sendChat).not.toHaveBeenCalled();
    });

    it('Enter key triggers send', () => {
      createActor();
      const textarea = query(element, '#chatTextarea') as HTMLTextAreaElement;
      textarea.value = 'Hello';

      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
      textarea.dispatchEvent(event);

      expect(gateway.sendChat).toHaveBeenCalledWith('Hello', undefined);
    });

    it('Shift+Enter does not trigger send', () => {
      createActor();
      const textarea = query(element, '#chatTextarea') as HTMLTextAreaElement;
      textarea.value = 'Hello';

      const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true });
      textarea.dispatchEvent(event);

      expect(gateway.sendChat).not.toHaveBeenCalled();
    });

    it('sends with images when attachment exists', () => {
      createActor();
      actor.attachScreenshot('AAAA==');
      const textarea = query(element, '#chatTextarea') as HTMLTextAreaElement;
      textarea.value = 'Check this frame';

      const sendBtn = query(element, '#sendBtn') as HTMLButtonElement;
      sendBtn.click();

      expect(gateway.sendChat).toHaveBeenCalledWith(
        'Check this frame',
        [{ data: 'AAAA==', media_type: 'image/png' }]
      );
    });

    it('clears attachment after sending', () => {
      createActor();
      actor.attachScreenshot('AAAA==');
      const textarea = query(element, '#chatTextarea') as HTMLTextAreaElement;
      textarea.value = 'Hello';

      const sendBtn = query(element, '#sendBtn') as HTMLButtonElement;
      sendBtn.click();

      // Attachment should be cleared
      const preview = query(element, '#attachPreview');
      expect(preview?.classList.contains('visible')).toBe(false);
    });
  });

  // ========================================
  // Abort / Reset
  // ========================================

  describe('Abort and Reset', () => {
    it('abort button calls gateway.abortChat', () => {
      createActor();
      const abortBtn = query(element, '#abortBtn') as HTMLButtonElement;

      abortBtn.click();

      expect(gateway.abortChat).toHaveBeenCalled();
    });

    it('reset button calls gateway.resetChat', () => {
      createActor();
      const resetBtn = query(element, '#resetBtn') as HTMLButtonElement;

      resetBtn.click();

      expect(gateway.resetChat).toHaveBeenCalled();
    });
  });

  // ========================================
  // Streaming State (subscription)
  // ========================================

  describe('Streaming State', () => {
    it('disables textarea during streaming', async () => {
      createActor();
      await new Promise(resolve => queueMicrotask(resolve));

      // Simulate gateway.streaming subscription
      const textarea = query(element, '#chatTextarea') as HTMLTextAreaElement;

      // Dispatch state change for gateway.streaming = true
      const event = new CustomEvent('state-changed', {
        detail: {
          source: 'test-gateway',
          state: { 'gateway.streaming': true },
          changedKeys: ['gateway.streaming'],
          publicationChain: [],
          timestamp: Date.now()
        }
      });
      element.dispatchEvent(event);

      expect(textarea.disabled).toBe(true);
    });

    it('does not send during streaming', async () => {
      createActor();
      await new Promise(resolve => queueMicrotask(resolve));

      // Simulate streaming state
      const event = new CustomEvent('state-changed', {
        detail: {
          source: 'test-gateway',
          state: { 'gateway.streaming': true },
          changedKeys: ['gateway.streaming'],
          publicationChain: [],
          timestamp: Date.now()
        }
      });
      element.dispatchEvent(event);

      const textarea = query(element, '#chatTextarea') as HTMLTextAreaElement;
      textarea.value = 'Hello';
      const sendBtn = query(element, '#sendBtn') as HTMLButtonElement;
      sendBtn.click();

      expect(gateway.sendChat).not.toHaveBeenCalled();
    });
  });

  // ========================================
  // Screenshot Attachment
  // ========================================

  describe('Attachment', () => {
    it('attachScreenshot shows preview', () => {
      createActor();
      actor.attachScreenshot('AAAA==');

      const preview = query(element, '#attachPreview');
      expect(preview?.classList.contains('visible')).toBe(true);
    });

    it('attachScreenshot sets thumbnail src', () => {
      createActor();
      actor.attachScreenshot('AAAA==');

      const thumb = query(element, '#attachThumb') as HTMLImageElement;
      expect(thumb.src).toContain('data:image/png;base64,AAAA==');
    });

    it('clearAttachment hides preview', () => {
      createActor();
      actor.attachScreenshot('AAAA==');
      actor.clearAttachment();

      const preview = query(element, '#attachPreview');
      expect(preview?.classList.contains('visible')).toBe(false);
    });

    it('remove button clears attachment', () => {
      createActor();
      actor.attachScreenshot('AAAA==');

      const removeBtn = query(element, '#removeAttach') as HTMLButtonElement;
      removeBtn.click();

      const preview = query(element, '#attachPreview');
      expect(preview?.classList.contains('visible')).toBe(false);
    });

    it('attachImage sets custom media type and label for uploads', () => {
      createActor();
      actor.attachImage('AAAA==', 'image/jpeg', 'upload');

      const label = query(element, '#attachLabel');
      expect(label?.textContent).toContain('Image attached');

      const thumb = query(element, '#attachThumb') as HTMLImageElement;
      expect(thumb.src).toContain('data:image/jpeg;base64,');
    });

    it('attachScreenshot sets frame label', () => {
      createActor();
      actor.attachScreenshot('AAAA==');

      const label = query(element, '#attachLabel');
      expect(label?.textContent).toContain('Frame attached');
    });

    it('clearAttachment resets media type', () => {
      createActor();
      actor.attachImage('AAAA==', 'image/jpeg', 'upload');
      actor.clearAttachment();

      // Re-attach as screenshot — should be PNG
      actor.attachScreenshot('BBBB==');
      const thumb = query(element, '#attachThumb') as HTMLImageElement;
      expect(thumb.src).toContain('data:image/png;base64,');
    });
  });

  // ========================================
  // Connection State
  // ========================================

  describe('Connection State', () => {
    it('updates placeholder when disconnected', async () => {
      createActor();
      await new Promise(resolve => queueMicrotask(resolve));

      const event = new CustomEvent('state-changed', {
        detail: {
          source: 'test-gateway',
          state: { 'gateway.connected': false },
          changedKeys: ['gateway.connected'],
          publicationChain: [],
          timestamp: Date.now()
        }
      });
      element.dispatchEvent(event);

      const textarea = query(element, '#chatTextarea') as HTMLTextAreaElement;
      expect(textarea.placeholder).toContain('Connecting');
    });

    it('restores placeholder when connected', async () => {
      createActor();
      await new Promise(resolve => queueMicrotask(resolve));

      // First disconnect
      element.dispatchEvent(new CustomEvent('state-changed', {
        detail: {
          source: 'test-gateway',
          state: { 'gateway.connected': false },
          changedKeys: ['gateway.connected'],
          publicationChain: [],
          timestamp: Date.now()
        }
      }));

      // Then reconnect
      element.dispatchEvent(new CustomEvent('state-changed', {
        detail: {
          source: 'test-gateway',
          state: { 'gateway.connected': true },
          changedKeys: ['gateway.connected'],
          publicationChain: [],
          timestamp: Date.now()
        }
      }));

      const textarea = query(element, '#chatTextarea') as HTMLTextAreaElement;
      expect(textarea.placeholder).toContain('jeROMy');
    });
  });
});
