/**
 * TurnActor Styles
 *
 * All styles for the different container types within a turn.
 * Each container type has its own shadow root with these styles adopted.
 * Adapted from Moby's MessageTurnActor styles for the jeROMiah ROM hacking agent.
 *
 * Container Types:
 * - .text-container: Text message segments
 * - .tools-container: Tool call execution
 * - .tool-result-container: Tool execution results
 * - .screenshot-container: Inline screenshots
 * - .error-container: Error messages
 * - .usage-container: Token usage stats
 *
 * Uses --jer-* CSS custom properties for theming.
 */

// ============================================
// Base Styles (shared across all containers)
// ============================================

const baseStyles = `
/* Container base - all containers inherit this */
.container {
  margin: 8px 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
  line-height: 1.4;
  color: var(--jer-text, #e0e0e0);
}

.container.entering {
  animation: fadeIn 0.3s ease-out forwards;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Scrollbar styling */
.scrollable::-webkit-scrollbar {
  width: 8px;
}

.scrollable::-webkit-scrollbar-track {
  background: transparent;
}

.scrollable::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 4px;
}

.scrollable::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
}
`;

// ============================================
// Text Message Styles
// ============================================

const textStyles = `
/* Text container - message content */
.text-container {
  /* No border for text, flows naturally */
}

.text-container.streaming {
  /* Active streaming indicator */
}

.text-container.continuation {
  margin-top: 8px;
}

/* Divider with centered label */
.message-divider {
  display: flex;
  align-items: center;
  margin-bottom: 5px;
}

.message-divider::before,
.message-divider::after {
  content: '';
  flex: 1;
  border-bottom: 1px dashed var(--jer-border, #333);
}

.message-divider-label {
  padding: 0 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--jer-text-muted, #888);
}

/* Hide divider for continuation segments */
.text-container.continuation .message-divider {
  display: none;
}

/* Message content */
.content {
  font-size: 13px;
  line-height: 1.6;
  color: var(--jer-text, #e0e0e0);
  word-wrap: break-word;
  overflow-wrap: break-word;
  padding: 0;
}

/* Code blocks */
.code-block {
  margin: 0 0 12px 0;
  border: 1px solid var(--jer-border, #333);
  border-radius: 6px;
  overflow: hidden;
  background: var(--jer-surface, #1a1a1a);
}

.code-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--jer-bg, #0f0f0f);
  border-bottom: 1px solid var(--jer-border, #333);
  cursor: pointer;
  user-select: none;
  transition: background 0.15s ease;
}

.code-header:hover {
  background: rgba(255, 255, 255, 0.05);
}

.code-toggle {
  font-size: 10px;
  color: var(--jer-text, #e0e0e0);
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.code-block.expanded .code-toggle {
  transform: rotate(90deg);
}

.code-lang {
  font-size: 11px;
  color: var(--jer-text-muted, #888);
  text-transform: uppercase;
  flex-shrink: 0;
}

.code-preview {
  flex: 1;
  font-family: var(--jer-font-mono, 'Cascadia Code', 'Fira Code', monospace);
  font-size: 11px;
  color: var(--jer-text-muted, #888);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.7;
}

.code-block.expanded .code-preview {
  display: none;
}

.code-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  margin-left: auto;
}

.copy-btn {
  padding: 2px 8px;
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: var(--jer-text-muted, #888);
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.copy-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: var(--jer-text, #e0e0e0);
}

.copy-btn.copied {
  background: var(--jer-accent, #69db7c);
  color: var(--jer-bg, #0f0f0f);
}

.code-body {
  position: relative;
  max-height: 50px;
  overflow: hidden;
  transition: max-height 0.3s ease;
}

.code-body::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 30px;
  background: linear-gradient(transparent, var(--jer-surface, #1a1a1a));
  pointer-events: none;
  opacity: 1;
  transition: opacity 0.2s ease;
}

.code-block.expanded .code-body {
  max-height: 500px;
  overflow-y: auto;
}

.code-block.expanded .code-body::after {
  opacity: 0;
}

.code-body pre {
  margin: 0;
  padding: 12px;
  overflow-x: auto;
}

.code-body code {
  font-family: var(--jer-font-mono, 'Cascadia Code', 'Fira Code', monospace);
  font-size: 13px;
  line-height: 1.5;
  white-space: pre;
}

code.inline-code {
  padding: 2px 6px;
  background: var(--jer-surface, #1a1a1a);
  border-radius: 3px;
  font-family: var(--jer-font-mono, 'Cascadia Code', 'Fira Code', monospace);
  font-size: 0.9em;
}

/* Code generating placeholder -- shown while a code block is being streamed */
.code-generating {
  position: relative;
  height: 22px;
  margin: 10px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.code-gen-phrases {
  position: relative;
  flex: 1;
  height: 22px;
}

.gen-phrase {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  opacity: 0;
  font-style: italic;
  font-size: 13px;
  letter-spacing: 0.3px;
}

.gp-1 { animation: cyclePhrase 4.5s ease-in-out infinite; }
.gp-2 { animation: cyclePhrase 4.5s ease-in-out 1.5s infinite; }
.gp-3 { animation: cyclePhrase 4.5s ease-in-out 3s infinite; }

@keyframes cyclePhrase {
  0% { opacity: 0; }
  6.67% { opacity: 1; }
  27.78% { opacity: 1; }
  33.33% { opacity: 0; }
  100% { opacity: 0; }
}

.gc {
  display: inline-block;
  color: var(--jer-text-muted, #888);
  animation: charWave 1.8s ease-in-out infinite;
  animation-delay: calc(var(--d) * 0.07s);
}

@keyframes charWave {
  0%, 100% { transform: translateY(0); opacity: 0.5; }
  50% { transform: translateY(-2px); opacity: 1; }
}
`;

// ============================================
// Tool Calls Styles
// ============================================

const toolsStyles = `
/* Tools container - dotted border on host */
:host(.tools-container) {
  display: block;
  margin: 8px 0;
  border: 1px dotted var(--jer-border, #333);
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
}

:host(.tools-container:hover) .tools-header {
  background: rgba(255, 255, 255, 0.03);
}

.tools-header {
  display: flex;
  align-items: center;
  padding: 6px 10px;
  gap: 8px;
}

.tools-toggle {
  color: var(--jer-text-muted, #888);
  font-family: monospace;
  font-weight: bold;
  width: 12px;
  flex-shrink: 0;
}

.tools-icon {
  flex-shrink: 0;
}

.tools-title {
  color: var(--jer-text, #e0e0e0);
  font-weight: 500;
}

.tools-preview {
  color: var(--jer-text-muted, #888);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  font-size: 12px;
}

.tools-body {
  display: none;
  padding: 8px 10px;
  border-top: 1px dotted var(--jer-border, #333);
}

:host(.tools-container.expanded) .tools-body {
  display: block;
}

.tools-body:empty {
  display: none;
}

.tool-item {
  padding: 4px 0;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.tool-tree {
  color: var(--jer-border, #333);
  font-family: monospace;
  flex-shrink: 0;
}

.tool-status {
  flex-shrink: 0;
  width: 14px;
  text-align: center;
}

.tool-item[data-status="pending"] .tool-status {
  color: var(--jer-text-muted, #888);
}

.tool-item[data-status="running"] .tool-status {
  color: var(--jer-accent-orange, #dba66b);
}

.tool-item[data-status="done"] .tool-status {
  color: var(--jer-accent, #69db7c);
}

.tool-item[data-status="error"] .tool-status {
  color: var(--jer-error, #ff6b6b);
}

.tool-name {
  color: var(--jer-text, #e0e0e0);
  font-weight: 500;
  flex-shrink: 0;
}

.tool-detail {
  color: var(--jer-text-muted, #888);
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
}

:host(.tools-container.complete) {
  opacity: 0.85;
}

:host(.tools-container.complete:hover) {
  opacity: 1;
}

:host(.tools-container.has-errors) .tools-title {
  color: var(--jer-error, #ff6b6b);
}
`;

// ============================================
// Tool Result Styles
// ============================================

const toolResultStyles = `
/* Tool result container */
:host(.tool-result-container) {
  display: block;
  margin: 8px 0;
  border: 1px solid var(--jer-border, #333);
  border-radius: 4px;
  overflow: hidden;
}

:host(.tool-result-container.is-error) {
  border-color: var(--jer-error, #ff6b6b);
}

.tool-result-header {
  display: flex;
  align-items: center;
  padding: 6px 10px;
  gap: 8px;
  background: var(--jer-bg, #0f0f0f);
  border-bottom: 1px solid var(--jer-border, #333);
  font-size: 12px;
  color: var(--jer-text-muted, #888);
}

.tool-result-name {
  font-weight: 500;
  color: var(--jer-accent-blue, #74c0fc);
}

.tool-result-body {
  padding: 8px 12px;
  background: var(--jer-surface, #1a1a1a);
  font-family: var(--jer-font-mono, 'Cascadia Code', 'Fira Code', monospace);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
  color: var(--jer-text, #e0e0e0);
}

.tool-result-body.error-result {
  color: var(--jer-error, #ff6b6b);
}

/* Palette swatches for NES color data */
.palette-swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.palette-swatch {
  width: 24px;
  height: 24px;
  border-radius: 3px;
  border: 1px solid var(--jer-border, #333);
  cursor: help;
}
`;

// ============================================
// Screenshot Styles
// ============================================

const screenshotStyles = `
/* Screenshot container */
:host(.screenshot-container) {
  display: block;
  margin: 8px 0;
}

.screenshot-wrapper {
  display: inline-block;
  position: relative;
}

.screenshot-wrapper img {
  max-width: 100%;
  max-height: 400px;
  border-radius: 4px;
  border: 1px solid var(--jer-border, #333);
  object-fit: contain;
  background: #000;
  image-rendering: pixelated;
}
`;

// ============================================
// Error Styles
// ============================================

const errorStyles = `
/* Error container */
:host(.error-container) {
  display: block;
  margin: 8px 0;
  border: 1px solid var(--jer-error, #ff6b6b);
  border-radius: 4px;
  overflow: hidden;
}

.error-header {
  display: flex;
  align-items: center;
  padding: 6px 10px;
  gap: 8px;
  background: rgba(255, 107, 107, 0.1);
}

.error-icon {
  flex-shrink: 0;
  color: var(--jer-error, #ff6b6b);
}

.error-title {
  font-weight: 500;
  color: var(--jer-error, #ff6b6b);
  font-size: 12px;
}

.error-body {
  padding: 8px 12px;
  background: var(--jer-surface, #1a1a1a);
  font-family: var(--jer-font-mono, 'Cascadia Code', 'Fira Code', monospace);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--jer-error, #ff6b6b);
  max-height: 150px;
  overflow-y: auto;
}
`;

// ============================================
// Usage Stats Styles
// ============================================

const usageStyles = `
/* Usage container */
:host(.usage-container) {
  display: block;
  margin: 8px 0;
}

.usage-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 0;
  font-size: 11px;
  color: var(--jer-text-muted, #888);
}

.usage-label {
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.usage-stat {
  display: flex;
  align-items: center;
  gap: 4px;
}

.usage-value {
  color: var(--jer-text, #e0e0e0);
  font-family: var(--jer-font-mono, 'Cascadia Code', 'Fira Code', monospace);
}
`;

// ============================================
// Syntax Highlighting (imported)
// ============================================

import { syntaxHighlightStyles } from '../../utils/syntaxHighlight';

// ============================================
// Export Combined Styles
// ============================================

export const turnStyles = `
${baseStyles}
${textStyles}
${toolsStyles}
${toolResultStyles}
${screenshotStyles}
${errorStyles}
${usageStyles}
${syntaxHighlightStyles}
`;
