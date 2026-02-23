/**
 * CSS styles for InputAreaActor
 */

export const inputAreaStyles = `
  /* Container */
  .input-area {
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--jer-border, #333);
    flex-shrink: 0;
  }

  /* Attachment preview */
  .attach-preview {
    display: none;
    align-items: center;
    gap: 8px;
    padding: 6px 16px;
    border-bottom: 1px solid var(--jer-border, #333);
    background: #161616;
  }
  .attach-preview.visible {
    display: flex;
  }
  .attach-preview img {
    width: 64px;
    image-rendering: pixelated;
    border: 1px solid #444;
    border-radius: 4px;
  }
  .attach-preview .attach-label {
    font-size: 12px;
    color: var(--jer-text-muted, #888);
    flex: 1;
  }
  .attach-preview .remove-btn {
    background: transparent;
    color: var(--jer-text-muted, #888);
    border: 1px solid #444;
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 11px;
    cursor: pointer;
  }
  .attach-preview .remove-btn:hover {
    color: var(--jer-error, #ff6b6b);
    border-color: var(--jer-error, #ff6b6b);
  }

  /* Input row */
  .input-row {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    align-items: flex-end;
  }

  /* Textarea */
  .chat-textarea {
    flex: 1;
    background: var(--jer-surface, #1a1a1a);
    color: var(--jer-text, #e0e0e0);
    border: 1px solid #444;
    border-radius: 6px;
    padding: 10px 12px;
    font-family: var(--jer-font, 'Segoe UI', system-ui, sans-serif);
    font-size: 14px;
    resize: none;
    outline: none;
    min-height: 44px;
    max-height: 120px;
    line-height: 1.4;
  }
  .chat-textarea:focus {
    border-color: var(--jer-accent, #69db7c);
  }
  .chat-textarea::placeholder {
    color: #555;
  }
  .chat-textarea:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Buttons */
  .btn {
    background: #2a2a2a;
    color: var(--jer-text, #e0e0e0);
    border: 1px solid #444;
    border-radius: 4px;
    padding: 10px 16px;
    cursor: pointer;
    font-size: 12px;
    white-space: nowrap;
  }
  .btn:hover { background: #3a3a3a; border-color: #666; }
  .btn:active { background: #444; }

  .btn-send {
    background: #1a5c2e;
    border-color: #2a7a3e;
  }
  .btn-send:hover { background: #2a7a3e; }

  .btn-abort {
    display: none;
    background: #5c1a1a;
    border-color: #7a2a2a;
  }
  .btn-abort:hover { background: #7a2a2a; }
  .btn-abort.visible { display: block; }

  .btn-send.hidden { display: none; }
`;
