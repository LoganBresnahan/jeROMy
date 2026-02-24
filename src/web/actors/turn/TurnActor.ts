/**
 * TurnActor
 *
 * One actor per conversation turn (user or assistant).
 * Extends InterleavedShadowActor to create multiple shadow containers
 * for different content types within the turn:
 *
 * - Text segments (can be split by tool/screenshot insertions)
 * - Tool call batches
 * - Tool results (formatted JSON, NES palette swatches)
 * - Screenshots (inline PNG images)
 * - Error messages
 * - Usage stats
 *
 * Simplified from Moby's MessageTurnActor for the jeROMy ROM hacking agent.
 * Drops thinking, shell, pending files, command approval, and drawing.
 *
 * Design Goals:
 * - Poolable by VirtualListActor for virtual rendering
 * - Full shadow DOM isolation for each content type
 * - Efficient style sharing via adoptedStyleSheets
 * - Clean reset/bind lifecycle for pool reuse
 *
 * @see InterleavedShadowActor for container management
 */

import { InterleavedShadowActor } from '../../state/InterleavedShadowActor';
import { EventStateManager } from '../../state/EventStateManager';
import { turnStyles } from './styles';
import { extractCodeBlocks, hasIncompleteFence } from '../../utils/codeBlocks';
import { highlightCode } from '../../utils/syntaxHighlight';
import { escapeHtml } from '../../utils/escapeHtml';
import type {
  TurnRole,
  TurnBindData,
  TextSegment,
  ToolBatch,
  ToolCall,
  ToolStatus,
  ToolResultData,
  ScreenshotData,
  ErrorData,
  UsageData,
  ContentOrderEntry
} from './types';

// ============================================
// Configuration
// ============================================

export interface TurnActorConfig {
  manager: EventStateManager;
  element: HTMLElement;
}

// ============================================
// Actor Implementation
// ============================================

export class TurnActor extends InterleavedShadowActor {
  // ============================================
  // Turn Identity
  // ============================================

  private _turnId: string | null = null;
  private _role: TurnRole = 'assistant';

  // ============================================
  // Text Segment State
  // ============================================

  private _textSegments: Map<string, TextSegment> = new Map();
  private _currentTextContainerId: string | null = null;
  private _textSegmentCounter = 0;
  private _currentSegmentContent = '';
  private _lastFormattedHtml = '';
  private _segmentsPaused = false;

  // ============================================
  // Tool Calls State
  // ============================================

  private _toolBatches: Map<string, ToolBatch> = new Map();
  private _currentToolBatchId: string | null = null;
  private _toolCounter = 0;

  // ============================================
  // jeROMy-Specific Content State
  // ============================================

  private _toolResultCounter = 0;
  private _screenshotCounter = 0;
  private _errorCounter = 0;
  private _usageCounter = 0;

  // ============================================
  // Streaming State
  // ============================================

  private _isStreaming = false;
  private _hasInterleaved = false;

  // ============================================
  // Header State
  // ============================================

  /** Whether the role header ("jeROMy" / "You") has been rendered */
  private _headerRendered = false;

  // ============================================
  // Constructor
  // ============================================

  constructor(config: TurnActorConfig) {
    super({
      manager: config.manager,
      element: config.element,
      actorName: 'turn',
      containerStyles: turnStyles,
      publications: {
        'turn.id': () => this._turnId,
        'turn.role': () => this._role,
        'turn.streaming': () => this._isStreaming,
        'turn.hasInterleaved': () => this._hasInterleaved,
        'turn.textSegmentCount': () => this._textSegments.size,
        'turn.toolBatchCount': () => this._toolBatches.size
      },
      subscriptions: {}  // TurnActor is controlled directly, not via pub/sub
    });
  }

  // ============================================
  // Pool Lifecycle
  // ============================================

  /**
   * Reset all state for pool reuse.
   * Call this before releasing back to pool.
   */
  reset(): void {
    // Clear all containers
    this.clearContainers();

    // Reset turn identity
    this._turnId = null;
    this._role = 'assistant';

    // Reset text segments
    this._textSegments.clear();
    this._currentTextContainerId = null;
    this._textSegmentCounter = 0;
    this._currentSegmentContent = '';
    this._lastFormattedHtml = '';
    this._segmentsPaused = false;

    // Reset tools
    this._toolBatches.clear();
    this._currentToolBatchId = null;
    this._toolCounter = 0;

    // Reset jeROMy-specific counters
    this._toolResultCounter = 0;
    this._screenshotCounter = 0;
    this._errorCounter = 0;
    this._usageCounter = 0;

    // Reset streaming state
    this._isStreaming = false;
    this._hasInterleaved = false;
    this._headerRendered = false;

    // Remove data attributes
    this.element.removeAttribute('data-turn-id');
    this.element.removeAttribute('data-role');
  }

  /**
   * Bind this actor to a new turn.
   * Call this after acquiring from pool.
   */
  bind(data: TurnBindData): void {
    this.reset();

    this._turnId = data.turnId;
    this._role = data.role;

    this.element.setAttribute('data-turn-id', data.turnId);
    this.element.setAttribute('data-role', data.role);

    this.publish({
      'turn.id': data.turnId,
      'turn.role': data.role
    });

    // Restore content from contentOrder if provided (for rebinding from history)
    if (data.contentOrder) {
      for (const entry of data.contentOrder) {
        // Content restoration is driven by the caller replaying content
        // The contentOrder is stored for reference but actual restoration
        // happens through the normal API calls (createTextSegment, etc.)
      }
    }
  }

  // ============================================
  // Turn Identity Accessors
  // ============================================

  get turnId(): string | null {
    return this._turnId;
  }

  get role(): TurnRole {
    return this._role;
  }

  get isUser(): boolean {
    return this._role === 'user';
  }

  get isAssistant(): boolean {
    return this._role === 'assistant';
  }

  // ============================================
  // Role Header
  // ============================================

  /**
   * Ensure the role header divider ("You" / "jeROMy") is rendered.
   * Called before tool/screenshot containers so the header always appears first.
   * If a text segment is created first, it renders the header itself.
   * Idempotent: checks _headerRendered.
   */
  private ensureRoleHeader(): void {
    if (this._headerRendered) return;

    const roleLabel = this._role === 'user' ? 'YOU' : 'jeROMy';

    const container = this.createContainer('header', {
      hostClasses: ['header-container', this._role === 'user' ? 'user' : 'assistant'],
      skipAnimation: true
    });

    container.content.innerHTML = `
      <div class="message ${this._role}">
        <div class="message-divider">
          <span class="message-divider-label">${roleLabel}</span>
        </div>
      </div>
    `;

    this._headerRendered = true;
  }

  // ============================================
  // Streaming State
  // ============================================

  startStreaming(): void {
    this._isStreaming = true;
    this._hasInterleaved = false;
    this.publish({ 'turn.streaming': true });

    // Render role header immediately so the turn has visible height from the start.
    // Without this, assistant turns stay empty until the first API chunk arrives.
    // ensureRoleHeader() is idempotent (checks _headerRendered), so subsequent calls are no-ops.
    this.ensureRoleHeader();
  }

  endStreaming(): void {
    this._isStreaming = false;

    // Mark current text segment as complete
    if (this._currentTextContainerId) {
      const container = this.getContainer(this._currentTextContainerId);
      if (container) {
        container.host.classList.remove('streaming');
      }
    }

    // Mark tool batches as complete
    if (this._currentToolBatchId) {
      const batch = this._toolBatches.get(this._currentToolBatchId);
      if (batch && !batch.complete) {
        batch.complete = true;
        this.renderToolBatch(this._currentToolBatchId);
      }
    }

    this.publish({ 'turn.streaming': false });
  }

  isStreaming(): boolean {
    return this._isStreaming;
  }

  hasInterleaved(): boolean {
    return this._hasInterleaved;
  }

  // ============================================
  // Text Segment Methods
  // ============================================

  /**
   * Create a new text segment for this turn.
   * For user messages, renders immediately.
   * For assistant messages, creates streaming structure.
   */
  createTextSegment(content: string = '', options?: { isContinuation?: boolean }): string {
    this._textSegmentCounter++;
    const segmentId = `${this._turnId}-text-${this._textSegmentCounter}`;
    const isContinuation = options?.isContinuation ?? false;

    const hostClasses = [this._role === 'user' ? 'user' : 'assistant'];
    if (isContinuation) hostClasses.push('continuation');
    if (this._isStreaming) hostClasses.push('streaming');

    const container = this.createContainer('message', {
      hostClasses: ['text-container', ...hostClasses],
      dataAttributes: {
        'segment-id': segmentId,
        'turn-id': this._turnId ?? ''
      }
    });

    const segment: TextSegment = {
      id: segmentId,
      content,
      containerId: container.id,
      isContinuation,
      complete: !this._isStreaming
    };

    this._textSegments.set(segmentId, segment);
    this._currentTextContainerId = container.id;
    this._currentSegmentContent = content;
    this._lastFormattedHtml = '';
    this._segmentsPaused = false;

    this.renderTextSegment(segment, container);
    this.setupTextSegmentHandlers(container.id);

    this.publish({ 'turn.textSegmentCount': this._textSegments.size });

    return segmentId;
  }

  /**
   * Update the current text segment with new content.
   * Creates segment lazily if it doesn't exist.
   */
  updateTextContent(content: string): void {
    // Lazy creation - create segment when content first arrives
    if (!this._currentTextContainerId) {
      this.createTextSegment(content);
      return;
    }

    const container = this.getContainer(this._currentTextContainerId);
    if (!container) return;

    const contentEl = container.content.querySelector('.content');
    if (contentEl) {
      const formatted = this.formatContent(content);
      // Skip DOM update if output unchanged (preserves CSS animations on placeholder)
      if (formatted !== this._lastFormattedHtml) {
        contentEl.innerHTML = formatted;
        this._lastFormattedHtml = formatted;
      }
    }

    this._currentSegmentContent = content;

    // Update segment data
    this._textSegments.forEach(segment => {
      if (segment.containerId === this._currentTextContainerId) {
        segment.content = content;
      }
    });
  }

  /**
   * Get the content accumulated in the current segment.
   */
  getCurrentSegmentContent(): string {
    return this._currentSegmentContent;
  }

  /**
   * Finalize the current segment before tool/screenshot content.
   * Returns true if a segment was finalized.
   */
  finalizeCurrentSegment(): boolean {
    if (!this._currentTextContainerId) {
      return false;
    }

    const container = this.getContainer(this._currentTextContainerId);
    if (container) {
      container.host.classList.remove('streaming');

      // Re-render without the streaming placeholder: strip any trailing
      // incomplete code block so the finalized segment doesn't show a stuck
      // "Generating..." placeholder.  The gateway carries the incomplete
      // tail forward to the next segment.
      if (this._isStreaming && this._currentSegmentContent) {
        const contentEl = container.content.querySelector('.content');
        if (contentEl) {
          // Use fence-length-aware detection (CommonMark spec)
          const fenceState = hasIncompleteFence(this._currentSegmentContent);
          const cleaned = fenceState.incomplete
            ? this._currentSegmentContent.substring(0, fenceState.lastOpenIndex)
            : this._currentSegmentContent;
          const wasStreaming = this._isStreaming;
          this._isStreaming = false;
          contentEl.innerHTML = this.formatContent(cleaned);
          this._isStreaming = wasStreaming;
          this._lastFormattedHtml = '';
        }
      }
    }

    this._currentTextContainerId = null;
    this._segmentsPaused = true;
    this._hasInterleaved = true;

    this.publish({ 'turn.hasInterleaved': true });

    return true;
  }

  /**
   * Check if we need a new segment after interleaving.
   */
  needsNewSegment(): boolean {
    return this._segmentsPaused && this._isStreaming;
  }

  /**
   * Resume with a new continuation segment after tool/screenshot content.
   */
  resumeWithNewSegment(): void {
    if (!this._segmentsPaused) return;

    this.createTextSegment('', { isContinuation: true });
  }

  // ============================================
  // Tool Calls Methods
  // ============================================

  /**
   * Start a new tool batch.
   */
  startToolBatch(tools: Array<{ name: string; detail: string }>): string {
    this.ensureRoleHeader();
    const container = this.createContainer('message', {
      hostClasses: ['tools-container'],
      dataAttributes: { 'turn-id': this._turnId ?? '' }
    });

    const calls: ToolCall[] = tools.map(tool => ({
      name: tool.name,
      detail: tool.detail,
      status: 'running' as ToolStatus
    }));

    const batch: ToolBatch = {
      id: container.id,
      calls,
      containerId: container.id,
      expanded: false,
      complete: false
    };

    this._toolBatches.set(batch.id, batch);
    this._currentToolBatchId = batch.id;

    this.renderToolBatch(batch.id);
    this.setupToolBatchHandlers(container.id);

    this.publish({ 'turn.toolBatchCount': this._toolBatches.size });

    return batch.id;
  }

  /**
   * Update a tool's status within the current batch.
   * Uses the current batch (last started) automatically.
   */
  updateTool(index: number, status: ToolStatus): void {
    const batchId = this._currentToolBatchId;
    if (!batchId) return;

    const batch = this._toolBatches.get(batchId);
    if (!batch) return;

    const call = batch.calls[index];
    if (call) {
      call.status = status;
      this.renderToolBatch(batchId);
    }
  }

  /**
   * Add another tool to the current batch (for incremental batching).
   * Returns the index of the newly added tool.
   */
  addToolToBatch(name: string, detail: string): number {
    const batchId = this._currentToolBatchId;
    if (!batchId) return -1;

    const batch = this._toolBatches.get(batchId);
    if (!batch) return -1;

    const index = batch.calls.length;
    batch.calls.push({
      name,
      detail,
      status: 'running' as ToolStatus,
    });

    this.renderToolBatch(batchId);
    return index;
  }

  /**
   * Complete the current tool batch.
   * Uses the current batch (last started) automatically.
   */
  completeToolBatch(): void {
    const batchId = this._currentToolBatchId;
    if (!batchId) return;

    const batch = this._toolBatches.get(batchId);
    if (!batch) return;

    batch.complete = true;
    this.renderToolBatch(batchId);
  }

  /**
   * Render a tool batch with tree-style layout.
   */
  renderToolBatch(batchId: string): void {
    const batch = this._toolBatches.get(batchId);
    if (!batch) return;

    const container = this.getContainer(batch.containerId);
    if (!container) return;

    const toggle = batch.expanded ? '\u2212' : '+';
    const doneCount = batch.calls.filter(c => c.status === 'done').length;
    const errorCount = batch.calls.filter(c => c.status === 'error').length;

    let title: string;
    if (batch.complete) {
      title = `Used ${batch.calls.length} tool${batch.calls.length > 1 ? 's' : ''}`;
      if (errorCount > 0) title += ` (${errorCount} failed)`;
    } else {
      title = `Using ${batch.calls.length} tool${batch.calls.length > 1 ? 's' : ''}...`;
      if (doneCount > 0) title += ` (${doneCount}/${batch.calls.length} done)`;
    }

    // Preview: first 3 tool names
    const preview = batch.calls.slice(0, 3).map(c => c.name).join(', ');
    const previewText = batch.calls.length > 3 ? preview + '...' : preview;

    container.host.classList.toggle('expanded', batch.expanded);
    container.host.classList.toggle('complete', batch.complete);
    container.host.classList.toggle('has-errors', errorCount > 0);

    let itemsHtml = '';
    batch.calls.forEach((call, i) => {
      const tree = i === batch.calls.length - 1 ? '\u2514\u2500' : '\u251C\u2500';
      const statusIcon = this.getStatusIcon(call.status);
      itemsHtml += `
        <div class="tool-item" data-status="${call.status}">
          <span class="tool-tree">${tree}</span>
          <span class="tool-status">${statusIcon}</span>
          <span class="tool-name">${escapeHtml(call.name)}</span>
          <span class="tool-detail">${escapeHtml(call.detail)}</span>
        </div>
      `;
    });

    container.content.innerHTML = `
      <div class="tools-header">
        <span class="tools-toggle">${toggle}</span>
        <span class="tools-icon">\uD83D\uDD27</span>
        <span class="tools-title">${title}</span>
        <span class="tools-preview">${escapeHtml(previewText)}</span>
      </div>
      <div class="tools-body">${itemsHtml}</div>
    `;
  }

  // ============================================
  // jeROMy-Specific Content Methods
  // ============================================

  /**
   * Add an inline screenshot (PNG image from NES emulator).
   */
  addScreenshot(base64: string): string {
    this.ensureRoleHeader();
    this._screenshotCounter++;
    const screenshotId = `${this._turnId}-screenshot-${this._screenshotCounter}`;

    const container = this.createContainer('message', {
      hostClasses: ['screenshot-container'],
      dataAttributes: {
        'screenshot-id': screenshotId,
        'turn-id': this._turnId ?? ''
      }
    });

    container.content.innerHTML = `
      <div class="screenshot-wrapper">
        <img
          src="data:image/png;base64,${base64}"
          alt="NES screenshot"
        />
      </div>
    `;

    return screenshotId;
  }

  /**
   * Add a tool result container with formatted output.
   * For palette data, renders inline color swatches.
   */
  addToolResult(name: string, result: string, isError: boolean): string {
    this.ensureRoleHeader();
    this._toolResultCounter++;
    const resultId = `${this._turnId}-result-${this._toolResultCounter}`;

    const container = this.createContainer('message', {
      hostClasses: ['tool-result-container', ...(isError ? ['is-error'] : [])],
      dataAttributes: {
        'result-id': resultId,
        'turn-id': this._turnId ?? ''
      }
    });

    const icon = isError ? '\u2717' : '\u2713';
    const bodyClass = isError ? 'tool-result-body error-result scrollable' : 'tool-result-body scrollable';

    // Attempt to parse and format JSON
    let formattedResult = escapeHtml(result);
    let swatchesHtml = '';

    try {
      const parsed = JSON.parse(result);
      formattedResult = escapeHtml(JSON.stringify(parsed, null, 2));

      // Detect palette data: look for hex color arrays
      swatchesHtml = this.renderPaletteSwatches(parsed);
    } catch {
      // Not JSON, render as plain text
    }

    container.content.innerHTML = `
      <div class="tool-result-header">
        <span>${icon}</span>
        <span class="tool-result-name">${escapeHtml(name)}</span>
      </div>
      <div class="${bodyClass}">${formattedResult}</div>
      ${swatchesHtml}
    `;

    return resultId;
  }

  /**
   * Add an error message container.
   */
  addError(message: string): string {
    this.ensureRoleHeader();
    this._errorCounter++;
    const errorId = `${this._turnId}-error-${this._errorCounter}`;

    const container = this.createContainer('message', {
      hostClasses: ['error-container'],
      dataAttributes: {
        'error-id': errorId,
        'turn-id': this._turnId ?? ''
      }
    });

    container.content.innerHTML = `
      <div class="error-header">
        <span class="error-icon">\u2717</span>
        <span class="error-title">Error</span>
      </div>
      <div class="error-body scrollable">${escapeHtml(message)}</div>
    `;

    return errorId;
  }

  /**
   * Add a usage stats container showing token counts.
   */
  addUsageStats(input: number, output: number): string {
    this._usageCounter++;
    const usageId = `${this._turnId}-usage-${this._usageCounter}`;

    const container = this.createContainer('message', {
      hostClasses: ['usage-container'],
      dataAttributes: {
        'usage-id': usageId,
        'turn-id': this._turnId ?? ''
      },
      skipAnimation: true
    });

    const total = input + output;
    container.content.innerHTML = `
      <div class="usage-bar">
        <span class="usage-label">Tokens</span>
        <span class="usage-stat">in: <span class="usage-value">${input.toLocaleString()}</span></span>
        <span class="usage-stat">out: <span class="usage-value">${output.toLocaleString()}</span></span>
        <span class="usage-stat">total: <span class="usage-value">${total.toLocaleString()}</span></span>
      </div>
    `;

    return usageId;
  }

  // ============================================
  // Private Render Methods
  // ============================================

  private renderTextSegment(segment: TextSegment, container: { id: string; host: HTMLElement; shadow: ShadowRoot; content: HTMLElement; createdAt: number }): void {
    const isUser = this._role === 'user';
    const roleLabel = isUser ? 'YOU' : 'JER';
    // Show divider unless it's a continuation or the header was already rendered
    // (e.g., by ensureRoleHeader() before a tool batch)
    const showDivider = !segment.isContinuation && !this._headerRendered;

    let html = `<div class="message ${this._role}${segment.isContinuation ? ' continuation' : ''}">`;

    // Divider (not for continuations, not if header already rendered)
    if (showDivider) {
      html += `<div class="message-divider">`;
      html += `<span class="message-divider-label">${roleLabel}</span>`;
      html += `</div>`;
      this._headerRendered = true;
    }

    // Content
    html += `<div class="content">${this.formatContent(segment.content)}</div>`;
    html += `</div>`;

    container.content.innerHTML = html;
  }

  // ============================================
  // Content Formatting
  // ============================================

  /**
   * Format text content with code blocks, inline code, bold, italic, and line breaks.
   * During streaming, replace incomplete fences with animated placeholder.
   *
   * Ported from Moby's MessageTurnActor.formatContent.
   */
  formatContent(content: string): string {
    if (!content) return '';

    // Fenced code blocks (complete only) -- fence-length-aware (CommonMark spec)
    const blocks = extractCodeBlocks(content);
    let result = content;

    // Replace from last to first to preserve string indices
    for (let bi = blocks.length - 1; bi >= 0; bi--) {
      const block = blocks[bi];
      const language = block.language || 'text';
      const code = block.content;
      const highlightedCode = highlightCode(code.trimEnd(), language);

      const firstLine = code.trim().split('\n')[0] || '';
      const preview = firstLine.length > 60 ? firstLine.substring(0, 60) + '...' : firstLine;
      const escapedPreview = escapeHtml(preview);

      const html = `<div class="code-block expanded" data-lang="${language}"><div class="code-header"><span class="code-toggle">\u25B6</span><span class="code-lang">${language}</span><span class="code-preview">${escapedPreview}</span><div class="code-actions"><button class="copy-btn">Copy</button></div></div><div class="code-body"><pre><code class="language-${language}">${highlightedCode}</code></pre></div></div>`;
      result = result.substring(0, block.startIndex) + html + result.substring(block.endIndex);
    }

    // During streaming, hide incomplete code blocks and show animated placeholder
    if (this._isStreaming) {
      result = result.replace(/```\w*(?:\n[\s\S]*)?$/, this._codeGeneratingHtml);
    }

    // Inline code
    result = result.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>');

    // Bold
    result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Italic
    result = result.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Line breaks
    result = result.replace(/\n/g, '<br>');

    return result;
  }

  /** Pre-built HTML for the code-generating placeholder */
  private readonly _codeGeneratingHtml = (() => {
    const phrases = ['Generating...', 'Patching...', 'Hacking...'];
    const phraseHtml = phrases.map((phrase, i) => {
      const chars = phrase.split('').map((ch, ci) =>
        `<span class="gc" style="--d:${ci}">${ch}</span>`
      ).join('');
      return `<span class="gen-phrase gp-${i + 1}">${chars}</span>`;
    }).join('');
    return `<div class="code-generating"><div class="code-gen-phrases">${phraseHtml}</div></div>`;
  })();

  // ============================================
  // Palette Swatch Rendering
  // ============================================

  /**
   * Detect NES palette data in parsed JSON and render color swatches.
   * Looks for arrays of hex color strings (e.g., ["#0F", "#16", "#27", "#30"]).
   */
  private renderPaletteSwatches(data: unknown): string {
    if (!data || typeof data !== 'object') return '';

    // Look for palette-like arrays: arrays of strings that look like hex colors
    const colors: string[] = [];

    const extract = (obj: unknown): void => {
      if (Array.isArray(obj)) {
        for (const item of obj) {
          if (typeof item === 'string' && /^#?[0-9a-fA-F]{2,6}$/.test(item)) {
            colors.push(item.startsWith('#') ? item : `#${item}`);
          } else if (typeof item === 'object') {
            extract(item);
          }
        }
      } else if (obj && typeof obj === 'object') {
        for (const val of Object.values(obj as Record<string, unknown>)) {
          if (Array.isArray(val)) {
            extract(val);
          }
        }
      }
    };

    extract(data);

    if (colors.length === 0) return '';

    // Map NES palette indices to approximate RGB values if they look like NES palette IDs
    const swatches = colors.map(color => {
      const safeColor = escapeHtml(color);
      return `<span class="palette-swatch" style="background:${safeColor}" title="${safeColor}"></span>`;
    }).join('');

    return `<div class="palette-swatches">${swatches}</div>`;
  }

  // ============================================
  // Event Handlers Setup
  // ============================================

  private setupTextSegmentHandlers(containerId: string): void {
    // Code block toggle
    this.delegateInContainer(containerId, 'click', '.code-header', (e, header) => {
      const target = e.target as HTMLElement;
      if (target.closest('.code-actions')) return;

      const codeBlock = header.closest('.code-block') as HTMLElement;
      if (codeBlock) {
        codeBlock.classList.toggle('expanded');
      }
    });

    // Copy button
    this.delegateInContainer(containerId, 'click', '.copy-btn', (e, btn) => {
      e.stopPropagation();
      const codeBlock = btn.closest('.code-block');
      const code = codeBlock?.querySelector('code')?.textContent;
      if (code) {
        navigator.clipboard.writeText(code);
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = 'Copy';
          btn.classList.remove('copied');
        }, 1500);
      }
    });
  }

  private setupToolBatchHandlers(containerId: string): void {
    this.delegateInContainer(containerId, 'click', '.tools-header', () => {
      const batch = this._toolBatches.get(containerId);
      if (batch) {
        batch.expanded = !batch.expanded;
        this.renderToolBatch(containerId);
      }
    });
  }

  // ============================================
  // Utility Methods
  // ============================================

  private getStatusIcon(status: ToolStatus): string {
    switch (status) {
      case 'pending': return '\u25CB';  // empty circle
      case 'running': return '\u231B';  // hourglass
      case 'done': return '\u2713';     // checkmark
      case 'error': return '\u2717';    // cross
      default: return '\u25CB';
    }
  }

  // ============================================
  // Lifecycle
  // ============================================

  destroy(): void {
    this.reset();
    super.destroy();
  }
}
