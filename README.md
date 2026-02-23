# jeROMiah

AI-powered ROM hacking agent for retro game modding via natural language.

jeROMiah connects to a live NES emulator (Mesen2), lets an AI agent analyze the game via screenshots and memory inspection, and execute modifications — palette swaps, memory edits, and more — from natural language instructions in a chat interface.

## Architecture

```
Browser (Chat + Emulator View)
    │ WebSocket
    ▼
TypeScript Server (WSL2, :3000)
    ├─→ Agent Core (LLM tool loop)
    │     ├─→ Claude API (vision + tool use)
    │     └─→ Capstone Disassembler (WASM)
    └─→ TCP Bridge (:9001) ←→ Mesen2 Lua Client (Windows)
```

- **TypeScript server** (WSL2) runs an HTTP/WebSocket server for the browser and a TCP server for the emulator
- **Lua script** (Windows/Mesen2) connects as a TCP client, executes emulator API calls
- **Browser** provides the chat panel and emulator view
- **LLM agent** takes screenshots, analyzes with vision, calls emulator tools, iterates

## Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [Mesen2](https://www.mesen.ca/) emulator (Windows)
- An Anthropic API key ([console.anthropic.com](https://console.anthropic.com/))
- WSL2 (if running the server on Linux alongside Mesen2 on Windows)

### Optional

- [Emscripten SDK](https://emscripten.org/) — only needed to rebuild the Capstone disassembler WASM

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Set your API key

```bash
export ANTHROPIC_API_KEY=sk-ant-api03-...
```

Or create a `.env` file (not committed):

```
ANTHROPIC_API_KEY=sk-ant-api03-...
```

### 3. Build the Capstone disassembler (optional)

This enables the `disassemble` tool for the agent. Skip this step if you don't need disassembly — the server starts fine without it.

```bash
# Install Emscripten (one-time)
git clone https://github.com/emscripten-core/emsdk.git ~/emsdk
cd ~/emsdk && ./emsdk install latest && ./emsdk activate latest
source ~/emsdk/emsdk_env.sh

# Build Capstone WASM
cd capstone && ./build.sh
```

### 4. Start the server

```bash
npm run dev
```

You should see:

```
[jeROMiah] Capstone disassembler loaded     (if WASM was built)
[Bridge] TCP server listening on 0.0.0.0:9001
[jeROMiah] Web UI at http://localhost:3000
[jeROMiah] Waiting for Mesen2 to connect (load bridge.lua)...
```

### 5. Connect Mesen2

1. Open Mesen2 and load a NES ROM
2. Go to **Tools > Script Window**
3. Click **Open** and load `mesen/bridge.lua`

You should see `[Bridge] Mesen Lua client connected` in the server terminal.

### 6. Open the UI

Navigate to [http://localhost:3000](http://localhost:3000).

- **Left panel**: Emulator view — click pixels to inspect tiles
- **Right panel**: Chat — type natural language instructions for the agent

Try:
- "Take a screenshot and describe what you see"
- "What palette is the main character using?"
- "Change the background color to blue"

## Development

```bash
npm run dev          # Start dev server (tsx, auto-restarts)
npm run build        # Compile TypeScript
npm test             # Run tests
npm run test:watch   # Watch mode
```

## Project Structure

```
jeROMiah/
├── mesen/
│   └── bridge.lua                 # Lua client for Mesen2
├── capstone/
│   └── build.sh                   # Capstone WASM build script
├── src/
│   ├── index.ts                   # HTTP + WS + TCP server
│   ├── bridge/mesen/              # TCP connection, protocol, adapter
│   ├── agent/
│   │   ├── provider.ts            # LLM-agnostic interface
│   │   ├── providers/anthropic.ts # Claude implementation
│   │   ├── agent.ts               # Tool loop core
│   │   ├── tools.ts               # Tool definitions + executor
│   │   ├── prompts.ts             # System prompt
│   │   └── disassembler.ts        # Capstone WASM wrapper
│   └── web/
│       ├── index.html             # Browser UI
│       ├── actors/                # UI actor components (gateway, sidebar, turns, etc.)
│       ├── state/                 # EventStateActor/Manager (from Moby)
│       └── utils/                 # Shared utilities (syntax highlight, code blocks, etc.)
├── docs/
│   ├── architecture/overview.md   # Full architecture doc
│   └── bridge.md                  # TCP protocol spec
└── package.json
```

## How It Works

The agent runs a **tool loop**:

1. User sends a natural language instruction via the chat panel
2. The instruction + system prompt (NES hardware reference) is sent to Claude
3. Claude decides which tools to call (screenshot, get_palette, write_memory, etc.)
4. Tools are executed against the live emulator via the TCP bridge
5. Results (including screenshots as images for vision) are sent back to Claude
6. Claude reasons about the results and either calls more tools or responds
7. Each step streams to the browser in real time

The agent supports up to 25 tool-call iterations per instruction, with abort capability.

## Available Tools

| Tool | Description |
|------|-------------|
| `screenshot` | Capture current emulator frame (PNG, analyzed via vision) |
| `get_tile_at_pixel` | Tile and palette info at a screen coordinate |
| `get_palette` | 4 NES color indices for a palette (0-7) |
| `write_palette` | Change a palette color (**frozen** — persists across frames) |
| `get_all_palettes` | All 8 palettes (4 background + 4 sprite) |
| `clear_palette_overrides` | Unfreeze palette colors (some or all) |
| `read_memory` | Read bytes from any memory region |
| `write_memory` | Write bytes to memory (live edit) |
| `get_cpu_state` | CPU registers and PPU position |
| `get_rom_info` | Loaded ROM metadata |
| `save_state` | Save emulator state (for undo) |
| `load_state` | Load emulator state (for rollback) |
| `disassemble` | Disassemble bytes at address (6502/ARM via Capstone) |

### Palette Freezing

NES games rewrite palette RAM every frame during VBlank. A one-shot write would be overwritten in ~16ms. To make palette edits visible, `write_palette` **freezes** the color — the bridge script re-applies it every frame so the game can't clobber it. Use `clear_palette_overrides` to unfreeze and let the game resume control. Other memory edits via `write_memory` are **live** — they take effect immediately but may be overwritten by game code.

## License

AGPL-3.0
