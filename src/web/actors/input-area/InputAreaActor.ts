/**
 * InputAreaActor
 *
 * Manages the chat input area: textarea, send/abort/reset buttons,
 * and image attachment preview (emulator frames or user uploads).
 *
 * Uses ShadowActor for style isolation. Subscribes to gateway state
 * to toggle between send/abort buttons during streaming.
 *
 * Publications:
 * - inputArea.hasAttachment: boolean — whether an image is attached
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

  /** Attached image as base64 (null if none) */
  private _attachedImage: string | null = null;
  private _attachedMediaType: string = 'image/png';
  private _attachSource: 'frame' | 'upload' = 'frame';
  private _isStreaming = false;
  private _isConnected = false;

  // DOM references (set after initial render)
  private _textarea: HTMLTextAreaElement | null = null;
  private _sendBtn: HTMLButtonElement | null = null;
  private _abortBtn: HTMLButtonElement | null = null;
  private _attachPreview: HTMLElement | null = null;
  private _attachThumb: HTMLImageElement | null = null;
  private _attachLabel: HTMLElement | null = null;

  constructor(config: InputAreaConfig) {
    const shadowConfig: ShadowActorConfig = {
      manager: config.manager,
      element: config.element,
      styles: inputAreaStyles,
      publications: {
        'inputArea.hasAttachment': () => this._attachedImage !== null,
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
          <img id="attachThumb" src="" alt="attached image">
          <span class="attach-label" id="attachLabel">Frame attached — will be sent with your next message</span>
          <button class="remove-btn" id="removeAttach">Remove</button>
        </div>
        <div class="input-row">
          <textarea
            class="chat-textarea"
            id="chatTextarea"
            placeholder="Ask jeROMy to analyze or modify the game..."
            rows="1"
          ></textarea>
          <input type="file" accept="image/*" id="fileInput" class="file-input-hidden">
          <button class="btn btn-upload" id="uploadBtn" title="Upload a reference image">Upload</button>
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
    this._attachLabel = this.query<HTMLElement>('#attachLabel');
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

    // Clipboard paste: detect pasted images
    this._textarea?.addEventListener('paste', (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (!blob) return;
          this._readBlobAsAttachment(blob, item.type, 'upload');
          break;
        }
      }
    });

    // Buttons
    this._sendBtn?.addEventListener('click', () => this._send());
    this._abortBtn?.addEventListener('click', () => this._abort());

    const resetBtn = this.query<HTMLButtonElement>('#resetBtn');
    resetBtn?.addEventListener('click', () => this._reset());

    const removeBtn = this.query<HTMLButtonElement>('#removeAttach');
    removeBtn?.addEventListener('click', () => this.clearAttachment());

    // File upload
    const uploadBtn = this.query<HTMLButtonElement>('#uploadBtn');
    const fileInput = this.query<HTMLInputElement>('#fileInput');
    uploadBtn?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', () => {
      const file = fileInput?.files?.[0];
      if (!file || !file.type.startsWith('image/')) return;
      this._readBlobAsAttachment(file, file.type, 'upload');
      fileInput.value = ''; // Reset so same file can be re-selected
    });
  }

  // ============================================
  // Actions
  // ============================================

  private _send(): void {
    if (!this._textarea || this._isStreaming) return;

    const text = this._textarea.value.trim();
    if (!text) return;

    // Build images array if attachment exists
    const images = this._attachedImage
      ? [{ data: this._attachedImage, media_type: this._attachedMediaType }]
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

  /**
   * Read a Blob/File as base64 and attach it.
   * Downsizes large images (>1568px on any side) to save API tokens.
   */
  private _readBlobAsAttachment(blob: Blob, mediaType: string, source: 'frame' | 'upload'): void {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '');

      if (source === 'upload') {
        // Check dimensions and downsize if needed
        const img = new Image();
        img.onload = () => {
          const maxDim = 1568;
          if (img.width > maxDim || img.height > maxDim) {
            // Downscale to fit within maxDim x maxDim
            const scale = Math.min(maxDim / img.width, maxDim / img.height);
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              const resized = canvas.toDataURL('image/png').replace(/^data:[^;]+;base64,/, '');
              this.attachImage(resized, 'image/png', source);
            } else {
              this.attachImage(base64, mediaType, source);
            }
          } else {
            this.attachImage(base64, mediaType, source);
          }
        };
        img.onerror = () => {
          // If we can't decode dimensions, attach as-is
          this.attachImage(base64, mediaType, source);
        };
        img.src = dataUrl;
      } else {
        this.attachImage(base64, mediaType, source);
      }
    };
    reader.readAsDataURL(blob);
  }

  // ============================================
  // Attachment API
  // ============================================

  /**
   * Attach an image (base64) to the next message.
   * Supports both emulator frames and user-uploaded reference images.
   */
  attachImage(base64: string, mediaType: string = 'image/png', source: 'frame' | 'upload' = 'frame'): void {
    this._attachedImage = base64;
    this._attachedMediaType = mediaType;
    this._attachSource = source;

    if (this._attachThumb) {
      this._attachThumb.src = `data:${mediaType};base64,${base64}`;
    }
    if (this._attachLabel) {
      this._attachLabel.textContent = source === 'frame'
        ? 'Frame attached — will be sent with your next message'
        : 'Image attached — will be sent with your next message';
    }
    if (this._attachPreview) {
      this._attachPreview.classList.add('visible');
    }

    this.publish({ 'inputArea.hasAttachment': true });
  }

  /**
   * Attach a screenshot (base64 PNG) to the next message.
   * Convenience wrapper for emulator frame attachments.
   */
  attachScreenshot(base64: string): void {
    this.attachImage(base64, 'image/png', 'frame');
  }

  /** Clear the attached image. */
  clearAttachment(): void {
    this._attachedImage = null;
    this._attachedMediaType = 'image/png';
    this._attachSource = 'frame';

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
        ? 'Ask jeROMy to analyze or modify the game...'
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
