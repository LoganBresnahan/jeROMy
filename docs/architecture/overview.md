# jeROMy — Architecture Overview

**jeROMy** is an AI-powered ROM hacking agent that connects to a debugging emulator (Mesen2), understands retro game internals, and executes ROM modifications from natural language instructions.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Web UI (Browser)                         │
│  ┌──────────────┐ ┌──────────────┐ ┌─────────────────────────┐ │
│  │ Emulator View│ │  Chat Panel  │ │  Edit History / Forks   │ │
│  │ (screenshot  │ │  (natural    │ │  (branch tree, timeline │ │
│  │  + click)    │ │   language)  │ │   before/after)         │ │
│  └──────┬───────┘ └──────┬───────┘ └───────────┬─────────────┘ │
│         └────────────────┼─────────────────────┘               │
│                          │ WebSocket                            │
└──────────────────────────┼──────────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────────┐
│                    Bridge Server (Node.js / TypeScript)          │
│                          │                                      │
│  ┌───────────────────────▼────────────────────────────────────┐ │
│  │                  HTTP + WebSocket Server                    │ │
│  │  Serves web UI, proxies agent ↔ browser in real time       │ │
│  └───────────┬────────────────────────────┬───────────────────┘ │
│              │                            │                     │
│  ┌───────────▼───────────┐  ┌─────────────▼─────────────────┐  │
│  │     Agent Core        │  │     State Manager (DB)         │  │
│  │  ┌─────────────────┐  │  │  ┌─────────────────────────┐  │  │
│  │  │  Claude Client   │  │  │  │  EventStore (append-only)│  │  │
│  │  │  (Anthropic API) │  │  │  │  SessionManager (CRUD)  │  │  │
│  │  │  Vision + Text   │  │  │  │  Zero-copy forking      │  │  │
│  │  └─────────────────┘  │  │  │  Snapshots (compression) │  │  │
│  │  ┌─────────────────┐  │  │  └─────────────────────────┘  │  │
│  │  │  Planning Loop   │  │  │  ┌─────────────────────────┐  │  │
│  │  │  (tool selection │  │  │  │  SQLCipher (encrypted)   │  │  │
│  │  │   + execution)   │  │  │  └─────────────────────────┘  │  │
│  │  └─────────────────┘  │  └───────────────────────────────┘  │
│  └───────────┬───────────┘                                     │
│              │ Emulator Tool Calls                              │
│  ┌───────────▼───────────┐                                     │
│  │   Mesen Connection    │                                     │
│  │   (TCP Client)        │                                     │
│  │   JSON-over-TCP       │                                     │
│  └───────────┬───────────┘                                     │
└──────────────┼──────────────────────────────────────────────────┘
               │ TCP Socket (localhost)
┌──────────────┼──────────────────────────────────────────────────┐
│              │          Mesen2 (Windows)                        │
│  ┌───────────▼───────────┐                                     │
│  │   bridge.lua          │                                     │
│  │   TCP Server (LuaSocket)                                    │
│  │   Non-blocking polling │                                    │
│  │   (endFrame callback) │                                     │
│  │                       │                                     │
│  │   Handlers:           │                                     │
│  │   • screenshot()      │                                     │
│  │   • get_tile_at_pixel │                                     │
│  │   • get_palette()     │                                     │
│  │   • write_palette()   │                                     │
│  │   • read/write memory │                                     │
│  │   • breakpoints       │                                     │
│  │   • save/load state   │                                     │
│  │   • CPU state         │                                     │
│  └───────────────────────┘                                     │
│              ▲                                                  │
│         NES ROM loaded                                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Platform Abstraction

jeROMy is designed to be **platform-agnostic from day one**. While the initial implementation targets NES via Mesen2, the architecture separates three distinct layers:

### Layer 1: Emulator Abstraction

An interface that says "give me a screenshot" and "read/write memory at this address." Different adapters implement it for different emulators/systems. The agent core never talks directly to Mesen — it talks to the abstraction.

```typescript
interface EmulatorAdapter {
  screenshot(): Promise<Buffer>;                    // PNG
  readMemory(addr: number, len: number): Promise<Buffer>;
  writeMemory(addr: number, data: Buffer): Promise<void>;
  dumpMemory(region: string): Promise<MemoryDump>;  // Full RAM region
  getState(): Promise<EmulatorState>;                // CPU, PPU, registers
  loadState(slot: number): Promise<void>;
  saveState(slot: number): Promise<void>;
  // ... etc
}
```

Mesen2 is the first adapter. Others (mGBA, etc.) can be added without touching the agent core.

### Layer 2: ROM Mapping & Metadata

Hierarchical JSON configs that describe how a ROM is structured:

- **System-level**: Memory layout, address ranges, graphics format for NES vs SNES vs GBA
- **Game-specific**: Where palette data lives, sprite definitions, level layouts, audio — tagged by asset type
- **Layered inheritance**: System base → game overrides → user discoveries on top

```
configs/
├── systems/
│   ├── nes.json          # NES hardware: 64-color palette, 8x8 tiles, etc.
│   ├── snes.json
│   └── gba.json
└── games/
    ├── nes/
    │   └── super-mario-bros.json   # Fully mapped by community
    └── gba/
        └── zoids-legacy.json       # Built through discovery
```

**Mapping existence check flow**:
```
Load ROM → check for existing mapping
  → if exists: use known addresses (fast path)
  → if mapping fails or doesn't exist: trigger exploratory phase (slow path)
```

### Layer 3: Transformation Logic

The agent's edit operations are mostly system-agnostic — "replace pixel data at these addresses" works whether it's NES or GBA. The discovery of those addresses varies per system, but the actual patching logic stays the same.

---

## Component Breakdown

### 1. Mesen2 + Lua Script (`mesen/bridge.lua`)

The Lua script runs inside Mesen2 and turns the emulator into a controllable tool server.

- **TCP server** using built-in LuaSocket (`require("socket.core")`)
- **Non-blocking polling** via `settimeout(0)` in `endFrame` callback
- **JSON protocol** — newline-delimited JSON request/response
- **Tool handlers** for all emulator operations (see [Bridge Protocol](bridge-protocol.md))

The Lua script is the only component that runs on Windows. Everything else runs in WSL2.

### 2. Bridge Server (`src/`)

The Node.js/TypeScript backend is the brain of the system.

#### 2.1 HTTP + WebSocket Server

- Serves the web UI as static files
- WebSocket connection to the browser for real-time updates (screenshots, streaming agent output, state changes)
- REST endpoints for non-realtime operations (session management, export)

#### 2.2 Mesen Connection (`src/bridge/`)

- TCP client that connects to the Lua script's server
- Typed wrappers around the JSON protocol
- Request/response matching via message IDs
- Connection management (reconnect, health check)

#### 2.3 Agent Core (`src/agent/`)

The AI planning loop that takes a natural language instruction and decomposes it into emulator tool calls.

- **Claude Client** — Anthropic SDK, sends screenshots as images for vision analysis
- **Planning Loop** — Iterative tool-use cycle:
  1. User gives instruction ("make the rock orange")
  2. Agent reasons about what tools to call
  3. Calls emulator tools via Mesen connection
  4. Observes results (screenshots, memory state)
  5. Decides next action or reports completion
- **System prompt** includes NES hardware reference, tool descriptions, and current session context

##### Three Analysis Modes

The agent combines multiple analysis approaches for maximum effectiveness:

1. **ROM Disassembly (Upfront/Static)** — Before interactive exploration, feed the ROM binary (or strategic chunks) to the LLM. It identifies likely data sections: sprite patterns, palette structures, audio blocks, code regions. This creates a preliminary map of hypotheses to test later.

2. **Memory Dumps (Runtime/Dynamic)** — While the game is running, dump RAM regions alongside screenshots. Compare memory state before and after a change to identify which bytes control what. Often more reliable than reverse-engineering assembly.

3. **Screenshot Vision (Runtime/Dynamic)** — Claude vision analyzes visual changes after memory edits. The feedback loop: edit memory → screenshot → did anything change? → what changed? → refine hypothesis.

##### Autonomous Discovery Loop

The core innovation of jeROMy. When no ROM mapping exists for a game:

```
LLM hypothesizes → edits memory → screenshots before/after
    → compares → confirms or iterates → logs successful mapping
        → repeats until ROM structure is understood
```

The agent acts as both explorer and validator. Human stays in the loop for final confirmation ("yes, that looks right"). Successful discoveries are logged as events in the DB, and can be exported to static JSON configs for the community.

##### Content Categories

Different game content requires different analysis approaches:

| Content Type | Analysis Method | Difficulty |
|-------------|----------------|------------|
| Visual (sprites, palettes, tiles) | Screenshot vision + memory comparison | Low — start here |
| Text (dialogue, menus) | Screenshot OCR + memory scanning | Medium |
| Audio (music, SFX) | ROM address mapping (can't "hear" via screenshots) | Medium |
| Game Logic (physics, AI, paths) | Disassembly + memory state inspection | High — future phase |

##### Play Scripts (Automated Gameplay)

For deterministic games, recorded input sequences (button presses + timing) can replay through game sections automatically. This speeds up the discovery process by exploring areas without requiring human gameplay. Works best for platformers and linear games; less reliable for games with randomness.

#### 2.4 State Manager / DB (`src/db/`)

Event-sourced state management adapted from Moby's battle-tested patterns.

- **EventStore** — Append-only event log (session-agnostic events, M:N join table)
- **SessionManager** — Session CRUD, zero-copy forking, metadata
- **SnapshotManager** — Context compression for long editing sessions
- **SQLCipher** — Encrypted SQLite for all persistent state

<!-- Event sourcing docs TBD — schema and forking details will be added when the DB layer is implemented. -->

### 3. Web UI (`src/web/`)

Local web application served by the bridge server.

#### Components:

- **Emulator View** — Displays the current frame from Mesen. Supports click-to-select (user clicks a pixel, coordinates are sent to the agent for tile identification).
- **Chat Panel** — Natural language input. Shows the agent's reasoning, tool calls, and results in real time via streaming.
- **Edit History** — Timeline of all ROM modifications. Each edit is an event in the DB. Shows before/after screenshots.
- **Fork Tree** — Visual branch explorer. Click to switch between edit branches. Fork from any point to try alternatives.
- **Palette Viewer** — Shows all active palettes. Click to edit colors directly (bypasses the AI for quick manual tweaks).

---

## Data Flow

### User Request Flow

```
User types: "make the rock in level 3 orange"
    │
    ▼
WebSocket → Bridge Server
    │
    ▼
Agent Core receives instruction
    │
    ├─ Creates new edit session (or continues existing)
    ├─ Records user_instruction event
    │
    ▼
Agent Planning Loop (Claude API):
    │
    ├─ Step 1: "I need to see level 3"
    │   └─ Tool: load_state(slot=3) → screenshot()
    │   └─ Claude sees the screenshot, identifies rock location
    │
    ├─ Step 2: "Let me identify the rock's tiles"
    │   └─ Tool: get_tile_at_pixel(x, y)
    │   └─ Returns tile_id, palette_id
    │
    ├─ Step 3: "Check the current palette"
    │   └─ Tool: get_palette(palette_id)
    │   └─ Returns 4 NES color indices
    │
    ├─ Step 4: "Change the gray to orange"
    │   └─ Tool: write_palette(palette_id, 1, 0x27)
    │   └─ Records palette_edit event
    │
    ├─ Step 5: "Verify the change"
    │   └─ Tool: screenshot()
    │   └─ Claude confirms rock is now orange
    │
    └─ Done. Records edit_completed event.
    │
    ▼
WebSocket streams each step to browser in real time
    │
    ▼
UI updates: chat shows reasoning, emulator view refreshes, timeline adds entry
```

### Event Recording Flow

Every tool call and its result is recorded as an event in the DB:

```
Session: "rock-orange-edit"
├─ seq 1: user_instruction ("make the rock in level 3 orange")
├─ seq 2: tool_call (load_state, slot=3)
├─ seq 3: tool_result (state loaded)
├─ seq 4: tool_call (screenshot)
├─ seq 5: screenshot_captured (png_base64=...)
├─ seq 6: tool_call (get_tile_at_pixel, x=128, y=120)
├─ seq 7: tool_result (tile_id=42, palette_id=2)
├─ seq 8: tool_call (get_palette, palette_id=2)
├─ seq 9: tool_result (colors=[0x0F, 0x00, 0x10, 0x30])
├─ seq 10: palette_edit (palette_id=2, index=1, old=0x00, new=0x27)
├─ seq 11: tool_call (write_palette, palette_id=2, index=1, nes_color=0x27)
├─ seq 12: tool_result (success)
├─ seq 13: tool_call (screenshot)
├─ seq 14: screenshot_captured (png_base64=..., verification)
└─ seq 15: edit_completed (summary="Changed rock palette color from gray to orange")
```

#### ROM Hacking Event Types

Events are tagged with `asset_type` metadata for querying and mapping export:

| Event Type | Description | Asset Type |
|-----------|------------|------------|
| `user_instruction` | Natural language request from user | — |
| `screenshot_captured` | Frame capture with PNG data | — |
| `memory_dump` | Full RAM region snapshot | — |
| `memory_read` | Read bytes at specific address | varies |
| `memory_write` | Write bytes at specific address | varies |
| `disassembly_analyzed` | LLM analyzed ROM assembly code | `logic` |
| `palette_edit` | Palette color changed (before/after) | `palette` |
| `sprite_edit` | Sprite tile data modified | `sprite` |
| `mapping_discovered` | Address → asset mapping confirmed | varies |
| `mapping_hypothesis` | Unconfirmed guess about address purpose | varies |
| `edit_completed` | Agent finished a modification task | — |
| `edit_verified` | User confirmed change looks correct | — |
| `fork_created` | Session branched from parent | — |

Discovery snapshots compress these events at milestones ("finished mapping palette data") so the LLM doesn't need the full history in context — just the latest snapshot + recent events.

### Forking Flow

User wants to try a different color:

```
Fork Session "rock-orange-edit" at seq 9 → Creates "rock-blue-edit"

"rock-blue-edit":
├─ seq 1-9: [shared events from parent — zero copy]
├─ seq 10: fork_created (from "rock-orange-edit" at seq 9)
├─ seq 11: palette_edit (palette_id=2, index=1, old=0x00, new=0x12)  ← blue instead
├─ seq 12: tool_call (write_palette, palette_id=2, index=1, nes_color=0x12)
└─ ...
```

---

## Technology Choices

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Language | TypeScript | User preference, consistent with Moby, strong typing |
| Runtime | Node.js | Native TCP sockets, good async story, npm ecosystem |
| Database | SQLCipher (@signalapp/sqlcipher) | Encrypted SQLite, proven in Moby, zero-copy forking |
| LLM | Claude (Anthropic SDK) | Best vision model for screenshot analysis, strong reasoning |
| Emulator | Mesen2 | Built-in LuaSocket, comprehensive API, multi-console |
| Bridge Protocol | JSON-over-TCP (newline delimited) | Simple, debuggable, LuaSocket compatible |
| Web Server | Native Node.js http + ws | Minimal deps, WebSocket for real-time |
| Frontend | TBD (React/Svelte/Vanilla) | To be decided in prototype phase |
| Build | Vite (frontend) + tsc (backend) | Fast builds, standard tooling |
| License | AGPL-3.0 | Open source, copyleft |

---

## Project Structure

```
jer/
├── docs/
│   └── architecture/
│       ├── overview.md              # This file
│       ├── bridge-protocol.md       # Lua ↔ Node TCP protocol spec
│       └── (event-sourcing.md)       # DB schema, events, forking (planned)
├── configs/                         # ROM mapping configs (community-contributed)
│   ├── systems/                     # Hardware-level definitions
│   │   ├── nes.json                 # NES: 64-color palette, 8x8 tiles, memory map
│   │   ├── snes.json
│   │   └── gba.json
│   └── games/                       # Game-specific mappings
│       ├── nes/
│       │   └── super-mario-bros.json
│       └── gba/
│           └── (user-contributed)
├── mesen/
│   └── bridge.lua                   # Lua script for Mesen2
├── src/
│   ├── server/                      # HTTP + WebSocket server
│   │   ├── index.ts
│   │   └── websocket.ts
│   ├── bridge/                      # Emulator abstraction layer
│   │   ├── adapter.ts               # EmulatorAdapter interface
│   │   ├── mesen/                   # Mesen2-specific adapter
│   │   │   ├── connection.ts        # TCP client
│   │   │   ├── protocol.ts          # Message types
│   │   │   └── adapter.ts           # Implements EmulatorAdapter
│   │   └── tools.ts                 # Typed tool wrappers
│   ├── agent/                       # AI agent loop
│   │   ├── agent.ts                 # Planning loop
│   │   ├── claude.ts                # Anthropic SDK wrapper
│   │   ├── discovery.ts             # Autonomous discovery loop
│   │   ├── analysis.ts              # ROM disassembly + memory dump analysis
│   │   ├── prompts.ts               # System prompts (hardware ref, tools)
│   │   └── tools.ts                 # Tool definitions for Claude
│   ├── mapping/                     # ROM mapping system
│   │   ├── loader.ts                # Load/merge system + game configs
│   │   ├── exporter.ts              # Export discoveries to JSON config
│   │   └── types.ts                 # Mapping schema types
│   ├── db/                          # Event-sourced state (from Moby patterns)
│   │   ├── database.ts              # SQLCipher wrapper
│   │   ├── eventStore.ts            # Append-only event log
│   │   ├── sessionManager.ts        # Session CRUD + forking
│   │   ├── snapshotManager.ts       # Context compression
│   │   ├── migrations.ts            # Schema definition
│   │   └── types.ts                 # Event type definitions
│   ├── web/                         # Web UI source
│   │   ├── index.html
│   │   ├── app.ts                   # Entry point
│   │   ├── components/              # UI components
│   │   └── styles/
│   └── index.ts                     # Main entry point
├── REMINDER.md                      # Development principles (like Moby)
├── package.json
├── tsconfig.json
└── .gitignore
```

---

## Phased Development

### Phase 1: The Bridge
Get Mesen2 Lua talking to Node.js over TCP. Four tools: `screenshot`, `get_tile_at_pixel`, `get_palette`, `write_palette`. Simple test page that displays screenshots and sends commands.

### Phase 2: Wire Up the Agent
Connect Claude via Anthropic SDK. Agent can take a screenshot, analyze it with vision, and execute palette changes. Chat panel in web UI. Live memory edits only (no ROM patching).

### Phase 3: State Management
Add the event-sourced DB. Record all tool calls and edits. Implement forking and rollback. Edit history timeline in the UI.

### Phase 4: ROM Patching
Add breakpoints, disassembly reading, ROM byte patching. The agent traces runtime values back to ROM addresses and makes persistent changes.

### Phase 5: Advanced
Vision-based sprite identification (no clicking required), compression-aware patching, game logic modifications via assembly reasoning.
