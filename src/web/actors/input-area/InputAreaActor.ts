/**
 * InputAreaActor
 *
 * Manages the chat input area: textarea, send/abort/reset buttons,
 * and screenshot attachment preview.
 *
 * Uses ShadowActor for style isolation. Subscribes to gateway state
 * to toggle between send/abort buttons during streaming.
 *
 * Publications:
 * - inputArea.hasAttachment: boolean — whether a screenshot is attached
 *
 * Subscriptions:
 * - gateway.streaming: boolean — toggle send/abort buttons
 * - gateway.connected: boolean — enable/disable input
 */

import { ShadowActor, type ShadowActorConfig } from '../../state/ShadowActor.js';
import { EventStateManager } from '../../state/EventStateManager.js';
import type { GatewayActor } from '../gateway/GatewayActor.js';
import { inputAreaStyles } from './styles.js';

// ============================================
// Configuration
// ============================================

export interface InputAreaConfig {
  manager: EventStateManager;
  element: HTMLElement;
  gateway: GatewayActor;
}

// ============================================
// Actor
// ============================================

export class InputAreaActor extends ShadowActor {
  private gateway: GatewayActor;

  /** Attached screenshot as base64 PNG (null if none) */
  private _attachedScreenshot: string | null = null;
  private _isStreaming = false;
  private _isConnected = false;

  // DOM references (set after initial render)
  private _textarea: HTMLTextAreaElement | null = null;
  private _sendBtn: HTMLButtonElement | null = null;
  private _abortBtn: HTMLButtonElement | null = null;
  private _attachPreview: HTMLElement | null = null;
  private _attachThumb: HTMLImageElement | null = null;

  constructor(config: InputAreaConfig) {
    const shadowConfig: ShadowActorConfig = {
      manager: config.manager,
      element: config.element,
      styles: inputAreaStyles,
      publications: {
        'inputArea.hasAttachment': () => this._attachedScreenshot !== null,
      },
      subscriptions: {
        'gateway.streaming': (value: unknown) => {
          this._isStreaming = value as boolean;
          this._updateButtonState();
        },
        'gateway.connected': (value: unknown) => {
          this._isConnected = value as boolean;
          this._updateInputState();
        },
      },
    };

    super(shadowConfig);
    this.gateway = config.gateway;
    this._render();
    this._bindEvents();
  }

  // ============================================
  // Rendering
  // ============================================

  private _render(): void {
    this.render(`
      <div class="input-area">
        <div class="attach-preview" id="attachPreview">
          <img id="attachThumb" src="" alt="attached frame">
          <span class="attach-label">Frame attached — will be sent with your next message</span>
          <button class="remove-btn" id="removeAttach">Remove</button>
        </div>
        <div class="input-row">
          <textarea
            class="chat-textarea"
            id="chatTextarea"
            placeholder="Ask jeROMiah to analyze or modify the game..."
            rows="1"
          ></textarea>
          <button class="btn btn-send" id="sendBtn">Send</button>
          <button class="btn btn-abort" id="abortBtn">Stop</button>
          <button class="btn" id="resetBtn" title="Clear conversation history">Reset</button>
        </div>
      </div>
    `);

    // Cache DOM references
    this._textarea = this.query<HTMLTextAreaElement>('#chatTextarea');
    this._sendBtn = this.query<HTMLButtonElement>('#sendBtn');
    this._abortBtn = this.query<HTMLButtonElement>('#abortBtn');
    this._attachPreview = this.query<HTMLElement>('#attachPreview');
    this._attachThumb = this.query<HTMLImageElement>('#attachThumb');
  }

  // ============================================
  // Event Binding
  // ============================================

  private _bindEvents(): void {
    // Textarea: Enter to send, Shift+Enter for newline, auto-resize
    this._textarea?.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._send();
      }
    });

    this._textarea?.addEventListener('input', () => this._autoResize());

    // Buttons
    this._sendBtn?.addEventListener('click', () => this._send());
    this._abortBtn?.addEventListener('click', () => this._abort());

    const resetBtn = this.query<HTMLButtonElement>('#resetBtn');
    resetBtn?.addEventListener('click', () => this._reset());

    const removeBtn = this.query<HTMLButtonElement>('#removeAttach');
    removeBtn?.addEventListener('click', () => this.clearAttachment());
  }

  // ============================================
  // Actions
  // ============================================

  private _send(): void {
    if (!this._textarea || this._isStreaming) return;

    const text = this._textarea.value.trim();
    if (!text) return;

    // Build images array if attachment exists
    const images = this._attachedScreenshot
      ? [{ data: this._attachedScreenshot, media_type: 'image/png' }]
      : undefined;

    // Send via gateway
    this.gateway.sendChat(text, images);

    // Clear input
    this._textarea.value = '';
    this._autoResize();
    this.clearAttachment();
  }

  private _abort(): void {
    this.gateway.abortChat();
  }

  private _reset(): void {
    this.gateway.resetChat();
  }

  // ============================================
  // Attachment API
  // ============================================

  /**
   * Attach a screenshot (base64 PNG) to the next message.
   * Called from the emulator sidebar's "Attach" button.
   */
  attachScreenshot(base64: string): void {
    this._attachedScreenshot = base64;

    if (this._attachThumb) {
      this._attachThumb.src = `data:image/png;base64,${base64}`;
    }
    if (this._attachPreview) {
      this._attachPreview.classList.add('visible');
    }

    this.publish({ 'inputArea.hasAttachment': true });
  }

  /** Clear the attached screenshot. */
  clearAttachment(): void {
    this._attachedScreenshot = null;

    if (this._attachPreview) {
      this._attachPreview.classList.remove('visible');
    }

    this.publish({ 'inputArea.hasAttachment': false });
  }

  // ============================================
  // UI State Updates
  // ============================================

  private _updateButtonState(): void {
    if (this._sendBtn) {
      this._sendBtn.classList.toggle('hidden', this._isStreaming);
    }
    if (this._abortBtn) {
      this._abortBtn.classList.toggle('visible', this._isStreaming);
    }
    if (this._textarea) {
      this._textarea.disabled = this._isStreaming;
    }
  }

  private _updateInputState(): void {
    // Could dim the input when disconnected, but for now just log state
    if (this._textarea) {
      this._textarea.placeholder = this._isConnected
        ? 'Ask jeROMiah to analyze or modify the game...'
        : 'Connecting to server...';
    }
  }

  private _autoResize(): void {
    if (!this._textarea) return;
    this._textarea.style.height = 'auto';
    this._textarea.style.height = `${Math.min(this._textarea.scrollHeight, 120)}px`;
  }

  // ============================================
  // Focus
  // ============================================

  /** Focus the textarea. */
  focus(): void {
    this._textarea?.focus();
  }
}
