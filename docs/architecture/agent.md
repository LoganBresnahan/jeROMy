# Agent Core

The agent orchestrates the LLM tool loop — it takes a user instruction, streams Claude's response, executes tool calls against the live emulator, and iterates until the task is complete.

```
src/agent/
├── agent.ts          # Tool loop core (Agent class)
├── provider.ts       # LLM-agnostic interface (LLMProvider)
├── providers/
│   └── anthropic.ts  # Claude implementation (AnthropicProvider)
├── tools.ts          # Tool definitions + executor (agentTools, executeTool)
├── prompts.ts        # System prompt builder (NES hardware ref + runtime context)
└── disassembler.ts   # Capstone WASM wrapper (optional)
```

---

## Provider Abstraction

The agent never talks to the Anthropic SDK directly. Instead, it uses the `LLMProvider` interface defined in `provider.ts`:

```
┌──────────────┐        ┌──────────────────┐
│  Agent       │───────→│  LLMProvider     │  (interface)
│  (agent.ts)  │        │  .chat()         │
│              │        │  .stream()       │
└──────────────┘        └────────┬─────────┘
                                 │
                     ┌───────────┴───────────┐
                     │  AnthropicProvider     │  (implementation)
                     │  (providers/anthropic) │
                     │  @anthropic-ai/sdk     │
                     └───────────────────────┘
```

### Key Types

| Type | Purpose |
|------|---------|
| `ContentBlock` | Union: `TextBlock \| ImageBlock \| ToolUseBlock \| ToolResultBlock` |
| `LLMMessage` | `{ role, content }` — conversation turn |
| `LLMTool` | Tool definition with JSON Schema `input_schema` |
| `LLMResponse` | `{ content, stop_reason, usage }` — complete response |
| `LLMStreamEvent` | Incremental events: `text_delta`, `tool_use_start`, `tool_input_delta`, `tool_use_end`, `message_done` |
| `LLMChatOptions` | `{ system?, tools?, max_tokens?, temperature?, signal? }` |

### AnthropicProvider

The Anthropic implementation (`providers/anthropic.ts`) handles:

- **Message mapping**: Converts `LLMMessage[]` ↔ Anthropic API format (base64 images, tool results)
- **Streaming**: Wraps `client.messages.stream()`, maps SDK events to `LLMStreamEvent`
- **Abort support**: Wires `AbortSignal` to `stream.abort()`
- **Logging**: Logs request/response timing, first-token latency, token counts

Default model: `claude-sonnet-4-20250514`. Configurable via `AnthropicProviderOptions.model`.

---

## Tool Loop

The `Agent` class (`agent.ts`) implements the core reasoning loop:

```
User instruction
    │
    ▼
┌─────────────────────────────────────────┐
│  for iteration in 1..maxIterations:     │
│                                         │
│  1. Stream LLM response                 │
│     ├─ yield text_delta events          │
│     └─ collect content blocks           │
│                                         │
│  2. If stop_reason != "tool_use":       │
│     └─ yield "done" event, return       │
│                                         │
│  3. Execute tool calls sequentially     │
│     ├─ yield tool_call event            │
│     ├─ call executeTool(name, input)    │
│     ├─ yield tool_result event          │
│     └─ yield screenshot event (if image)│
│                                         │
│  4. Append tool results to history      │
│     └─ loop back to step 1             │
└─────────────────────────────────────────┘
```

### Lifecycle

1. **Construction**: `new Agent(provider, adapter, options, disassembler)` — stores dependencies, no side effects
2. **Run**: `agent.run(instruction, { images? })` — returns `AsyncIterable<AgentEvent>`, caller consumes with `for await`
3. **Abort**: `agent.abort()` — cancels via `AbortController.abort()`, loop checks `signal.aborted` at each step
4. **Reset**: `agent.resetHistory()` — clears conversation history for a fresh session

### Agent Events

Events yielded to the caller during `run()`:

| Event | Fields | When |
|-------|--------|------|
| `text_delta` | `text` | Each text token streamed from LLM |
| `tool_call` | `name, input` | Before executing a tool |
| `tool_result` | `name, result, is_error` | After tool execution |
| `screenshot` | `png_base64` | When screenshot tool returns an image |
| `done` | `text, usage` | Agent finished (no more tool calls) |
| `error` | `message` | Abort, max iterations, or exception |

### Conversation History

The agent maintains `history: LLMMessage[]` across `run()` calls within a session:

```
history = [
  { role: "user", content: "make the rock orange" },
  { role: "assistant", content: [TextBlock, ToolUseBlock] },
  { role: "user", content: [ToolResultBlock] },        // tool results go as "user" role
  { role: "assistant", content: [TextBlock] },          // final response
  { role: "user", content: "now make it blue" },        // next run() call
  ...
]
```

Tool results are sent as `user` messages per the Anthropic API convention.

---

## System Prompt

`buildSystemPrompt()` in `prompts.ts` constructs the system prompt with:

1. **Base prompt**: Agent identity, capabilities, NES hardware reference (palettes, tiles, memory map, common colors), working style guidelines
2. **Runtime context** (dynamic, fetched from emulator at run start):
   - ROM info (name, format, SHA1) — if connected
   - Current palettes (all 8 with hex color values) — if connected

The agent fetches runtime context via `adapter.getRomInfo()` and `adapter.getAllPalettes()` in parallel, with graceful fallback if the emulator is disconnected.

---

## Tools

`agentTools` in `tools.ts` defines 13 tools as JSON Schema objects for the LLM:

| Tool | Required Params | Adapter Method |
|------|----------------|----------------|
| `screenshot` | — | `adapter.screenshot()` |
| `get_tile_at_pixel` | `x, y` | `adapter.getTileAtPixel()` |
| `get_palette` | `palette_id` | `adapter.getPalette()` |
| `write_palette` | `palette_id, color_index, nes_color` | `adapter.writePalette()` |
| `get_all_palettes` | — | `adapter.getAllPalettes()` |
| `clear_palette_overrides` | — | `adapter.clearPaletteOverrides()` |
| `read_memory` | `address` | `adapter.readMemory()` |
| `write_memory` | `address, bytes` | `adapter.writeMemory()` |
| `get_cpu_state` | — | `adapter.getCpuState()` |
| `get_rom_info` | — | `adapter.getRomInfo()` |
| `save_state` | — | `adapter.saveState()` |
| `load_state` | — | `adapter.loadState()` |
| `disassemble` | `address` | reads memory + Capstone WASM |

### Tool Execution

`executeTool()` maps tool names to adapter calls. Two result types:

- **Text**: JSON-stringified result (most tools)
- **Mixed**: Content blocks with image data (screenshot — enables Claude vision)

Defaults applied by the executor:
- `read_memory`: `length=1`, `mem_type="cpuDebug"`
- `write_memory`: `mem_type="cpu"`
- `save_state` / `load_state`: `slot=0`
- `disassemble`: `length=32`, `arch="6502"`

If the `disassembler` is not provided (Capstone WASM not built), the `disassemble` tool returns a "not available" message instead of failing.

---

## Data Flow: Server → Browser

The server (`index.ts`) bridges agent events to the browser via WebSocket:

```
Agent.run()                    WS Server                   Browser
  │                              │                           │
  ├─ text_delta ───────────────→ agent_text ───────────────→ GatewayActor
  ├─ tool_call ────────────────→ agent_tool_call ──────────→ GatewayActor
  ├─ tool_result ──────────────→ agent_tool_result ────────→ GatewayActor
  ├─ screenshot ───────────────→ agent_screenshot ─────────→ GatewayActor + Sidebar
  ├─ done ─────────────────────→ agent_done ───────────────→ GatewayActor
  └─ error ────────────────────→ agent_error ──────────────→ GatewayActor
```

The GatewayActor coordinates interleaving of text, tools, and screenshots into the chat UI. See [Streaming Coordination](frontend/streaming-coordination.md) for details.
