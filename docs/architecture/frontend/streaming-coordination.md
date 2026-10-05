# Streaming Coordination

The `GatewayActor` coordinates how agent events (text, tool calls, tool results, screenshots) are interleaved into the chat UI. This is ported from Moby's `handleStreamToken` pattern.

```
src/web/actors/
├── gateway/
│   └── GatewayActor.ts      # WebSocket + interleaving coordinator
├── virtual-list/
│   └── VirtualListActor.ts   # Turn management + pooling
├── turns/
│   └── TurnActor.ts          # Individual turn rendering
├── input-area/
│   └── InputAreaActor.ts     # Chat input + screenshot attach
└── sidebar/
    └── EmulatorSidebar.ts    # Emulator canvas, palettes, logs (plain class)
```

---

## The Interleaving Problem

An LLM agent response is not a simple text blob — it interleaves text, tool calls, tool results, and screenshots:

```
Agent response:
  1. "Let me check the current palette..."        ← text
  2. [tool_call: get_palette(palette_id=2)]        ← tool
  3. [tool_result: {colors: [0x0F, 0x00, ...]}]   ← tool result
  4. "The palette uses gray tones. I'll change..." ← more text
  5. [tool_call: write_palette(2, 1, 0x27)]        ← tool
  6. [tool_result: {old_color: 0, new_color: 39}]  ← tool result
  7. [tool_call: screenshot()]                      ← tool
  8. [screenshot: base64 PNG]                       ← image
  9. "Done! The rock is now orange."                ← text
```

The gateway must render this as interleaved content segments — not concatenated text. It also must handle **incomplete code fences** when text is split by a tool call.

---

## Turn Lifecycle

```
User sends chat message
    │
    ▼
GatewayActor.sendChat()
    ├─ Add user turn to VirtualList
    ├─ Set streaming = true
    └─ Send WS message
         │
         ▼
Server runs Agent.run()
    │
    ├─ agent_text → GatewayActor._handleAgentText()
    ├─ agent_tool_call → GatewayActor._handleAgentToolCall()
    ├─ agent_tool_result → GatewayActor._handleAgentToolResult()
    ├─ agent_screenshot → GatewayActor._handleAgentScreenshot()
    ├─ agent_done → GatewayActor._handleAgentDone()
    └─ agent_error → GatewayActor._handleAgentError()
         │
         ▼
GatewayActor._endCurrentTurn()
    ├─ Reset all interleaving state
    └─ Set streaming = false
```

---

## Gateway State Machine

The gateway tracks interleaving state across a single assistant turn:

```
Fields:
  _currentTurnId      — active turn ID (null when idle)
  _segmentContent     — accumulated text for current text segment
  _currentBatchId     — active tool batch ID (null when in text mode)
  _currentToolIndex   — index of current tool within batch
  _pendingFenceCarry  — incomplete code fence from finalized segment
  _isStreaming        — whether an agent turn is in progress
```

### State Transitions

```
IDLE
  │
  ├─ agent_text → START TURN → accumulate text
  │                              │
  │                              ├─ agent_text → append to segment
  │                              │
  │                              ├─ agent_tool_call → FINALIZE SEGMENT
  │                              │   ├─ Check for incomplete code fences
  │                              │   ├─ Save fence carry-forward
  │                              │   └─ Start tool batch
  │                              │       │
  │                              │       ├─ agent_tool_call → add to batch
  │                              │       ├─ agent_tool_result → mark done
  │                              │       └─ agent_text → COMPLETE BATCH
  │                              │           ├─ Resume with new segment
  │                              │           ├─ Prepend fence carry-forward
  │                              │           └─ accumulate text (loop)
  │                              │
  │                              ├─ agent_screenshot → FINALIZE + add image
  │                              │
  │                              ├─ agent_done → END TURN
  │                              └─ agent_error → ADD ERROR → END TURN
```

---

## Fence Carry-Forward

When text is split by a tool call mid-code-fence, the gateway preserves the fence:

```
Text segment 1: "Here's the code:\n```javascript\nconst x = 1;"
                                    ^^^^^^^^^^^^
                                    incomplete fence (opened but not closed)

Tool call: get_palette(2)
Tool result: {...}

Text segment 2: "\nconst y = 2;\n```\nThat's the code."
```

Without carry-forward, segment 1 would display with an unclosed code block, and segment 2 would start with raw text inside a fence.

The gateway handles this:

1. Before finalizing segment 1, check `hasIncompleteFence(segmentContent)`
2. If incomplete, save everything from the last opening fence as `_pendingFenceCarry`
3. When resuming text (segment 2), prepend `_pendingFenceCarry` to the new segment

```
hasIncompleteFence("code\n```js\nconst x = 1;")
→ { incomplete: true, lastOpenIndex: 5 }

_pendingFenceCarry = "```js\nconst x = 1;"

Next text segment starts with:
"```js\nconst x = 1;\nconst y = 2;\n```\nThat's the code."
```

The `hasIncompleteFence()` utility counts fence markers and tracks the last opening position. It's in `src/web/utils/codeBlocks.ts`.

---

## Tool Batches

Multiple consecutive tool calls are grouped into a single batch for compact display:

```
┌─ Tool Batch ──────────────────────┐
│  ✓ get_palette (palette_id: 2)    │
│  ✓ write_palette (palette: 2...)  │
│  ⏳ screenshot                     │
└───────────────────────────────────┘
```

Gateway operations on batches:

| Method | When |
|--------|------|
| `virtualList.startToolBatch(turnId, tools)` | First tool call after text |
| `virtualList.addToolToCurrentBatch(turnId, name, detail)` | Subsequent tool call |
| `virtualList.updateToolInCurrentBatch(turnId, index, status)` | Tool result received |
| `virtualList.completeCurrentToolBatch(turnId)` | Next text token or turn end |

---

## VirtualList + Actor Pooling

The `VirtualListActor` manages turns with pooled `TurnActor` instances:

```
VirtualListActor
  │
  ├─ Turn pool (reusable TurnActor instances)
  │   ├─ TurnActor (assigned to turn "user-1-abc")
  │   ├─ TurnActor (assigned to turn "assistant-2-def")
  │   └─ TurnActor (available in pool)
  │
  ├─ Turn data (Map<turnId, TurnData>)
  │   stores: role, segments, toolBatches, screenshots, usage
  │
  └─ Viewport management
      scrolls to bottom during streaming
```

Each `TurnActor` renders a single conversation turn — either user message or assistant response with interleaved content. When a turn scrolls out of view, its actor can be recycled back to the pool for reuse.

---

## Message Routing

The gateway routes inbound WS messages to two destinations:

```
WS Message
    │
    ├─ action.startsWith("agent_")
    │   └─ _handleAgentEvent() → VirtualListActor (chat UI)
    │
    ├─ action === "server_log"
    │   └─ EmulatorSidebar.log()
    │
    ├─ emulator responses (screenshot, get_all_palettes, etc.)
    │   └─ EmulatorSidebar.render*() methods
    │
    └─ emulator control (pause_emulator, resume_emulator, step_frame, get_emulator_status)
        └─ EmulatorSidebar.setEmulatorPaused() + log
```

The `EmulatorSidebar` is **not an actor** — it's a plain class that operates directly on the DOM. It handles the left panel (emulator canvas, palette display, tile info, logs, and emulator control buttons). The gateway calls its methods to push data and it calls `gateway.send()` for outbound commands.

The sidebar tracks emulator pause state via `setEmulatorPaused(paused)`:
- Updates status text: "Connected (Paused)" / "Connected"
- Stops auto-refresh when paused (prevents flooding identical frames)
- Pause/Step/Resume buttons send `pause-emu`, `step-frame`, `resume-emu` WS actions

---

## Outbound API

The gateway exposes methods for the UI to send messages:

| Method | WS Action | Purpose |
|--------|-----------|---------|
| `send(action, params?)` | `{ action, params }` | Raw emulator command |
| `sendChat(message, images?)` | `{ action: "chat", message, images? }` | Chat message to agent |
| `abortChat()` | `{ action: "chat_abort" }` | Cancel running agent |
| `resetChat()` | `{ action: "chat_reset" }` | Clear conversation history |

---

## Publications

The gateway publishes two state keys via the actor system:

| Key | Type | Purpose |
|-----|------|---------|
| `gateway.connected` | `boolean` | WebSocket connection status |
| `gateway.streaming` | `boolean` | Whether agent is currently streaming |

These are consumed by `InputAreaActor` (disables input during streaming, shows connection status) and `VirtualListActor` (auto-scrolls during streaming).
