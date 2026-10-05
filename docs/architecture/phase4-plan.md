# Phase 4: Tile Editing + Game Mappings + Emulator Control

> **Status: Complete** — All parts implemented and tested.

## What This Phase Delivers

Phase 4 gives the agent the ability to modify game graphics (not just colors), introduces game mapping files, and adds precise emulator timing control. After Phase 4, a user can:

- Ask the agent to change a sprite's shape (e.g. "make the goomba taller")
- Load a community mapping for Super Mario Bros and have the agent immediately know what each tile is
- Record new discoveries during a session, then promote them to the mapping file for others
- Pause the emulator, make batch edits, step forward to verify changes, and resume — from the UI or via the LLM agent

## Architecture Overview

```
mappings/
├── sha1-abcdef12.json           ← SMB1 mapping (community file)
└── sha1-98765432.json           ← Zelda mapping

src/mappings/
├── types.ts                     ← GameMapping, TileMapping, etc.
├── loader.ts                    ← Load by ROM SHA1, inject into prompt
└── index.ts                     ← Barrel

mesen/bridge.lua                 ← +2 handlers: read_chr_tile, write_chr_tile

src/bridge/mesen/
├── protocol.ts                  ← +ReadChrTileResult, WriteChrTileResult
└── adapter.ts                   ← +readChrTile(), writeChrTile()

src/agent/
├── tools.ts                     ← +5 tools (read_tile, write_tile, read_nametable,
│                                    write_nametable, record_mapping)
└── prompts.ts                   ← +CHR editing guide, +mapping context injection,
                                    +palette sharing warnings
```

---

## Part 1: Game Mapping Files

### File Format (`mappings/sha1-{sha1}.json`)

```json
{
  "rom_sha1": "abcdef1234567890...",
  "rom_name": "Super Mario Bros. (World)",
  "version": 1,
  "contributors": ["user123"],
  "description": "Tile and palette mappings for SMB1",

  "tiles": {
    "0x24": { "name": "empty/sky", "category": "background" },
    "0xB4": { "name": "cloud-top-left", "category": "background", "group": "cloud" },
    "0xB5": { "name": "cloud-top-right", "category": "background", "group": "cloud" },
    "0x45": { "name": "question-block", "category": "interactive", "notes": "Alternates with 0x47 for animation" }
  },

  "palettes": {
    "0": { "name": "sky/ground", "notes": "Shared by clouds, bushes, and ground" },
    "3": { "name": "castle/coin", "notes": "Also used for castle blocks" }
  },

  "sprites": {
    "small-mario": {
      "tiles": ["0x32", "0x33", "0x34", "0x35"],
      "palette_id": 4,
      "notes": "Standing frame, facing right"
    }
  },

  "addresses": {
    "player_x": { "address": "0x0086", "mem_type": "cpu", "description": "Mario's X position on screen" },
    "player_y": { "address": "0x00CE", "mem_type": "cpu", "description": "Mario's Y position" },
    "world":    { "address": "0x075F", "mem_type": "cpu", "description": "Current world (0-indexed)" },
    "level":    { "address": "0x0760", "mem_type": "cpu", "description": "Current level (0-indexed)" }
  },

  "notes": [
    "SMB1 uses CHR ROM (read-only in emulation), so tile edits require prgRom/chrRom writes",
    "Palette 0 color 0 ($22 light blue) is the universal background color"
  ]
}
```

### Types (`src/mappings/types.ts`)

```typescript
interface GameMapping {
  rom_sha1: string;
  rom_name: string;
  version: number;
  contributors: string[];
  description: string;
  tiles: Record<string, TileMapping>;
  palettes: Record<string, PaletteMapping>;
  sprites: Record<string, SpriteMapping>;
  addresses: Record<string, AddressMapping>;
  notes: string[];
}

interface TileMapping {
  name: string;
  category: "background" | "interactive" | "decoration" | "enemy" | "player" | "item" | "other";
  group?: string;        // Groups related tiles: "cloud", "pipe", "ground"
  notes?: string;
}

interface PaletteMapping {
  name: string;
  notes?: string;
}

interface SpriteMapping {
  tiles: string[];       // Hex tile IDs that compose this sprite
  palette_id: number;
  notes?: string;
}

interface AddressMapping {
  address: string;       // Hex address
  mem_type: string;
  description: string;
}
```

### Loader (`src/mappings/loader.ts`)

- `loadMapping(sha1: string): GameMapping | null` — reads from `mappings/sha1-{sha1}.json`
- `formatMappingForPrompt(mapping: GameMapping): string` — converts to concise text for the system prompt
- Called in `Agent.buildContextualPrompt()` after `getRomInfo()` returns the SHA1

---

## Part 2: CHR Tile Bridge Commands

### Lua Side (`bridge.lua` — 2 new handlers)

#### `read_chr_tile`

Reads a single 8x8 tile from CHR memory and decodes it to a pixel grid:

```lua
function handlers.read_chr_tile(params)
  local tile_id = params.tile_id
  local source = params.source or "chrRom"  -- "chrRom" or "chrRam"
  local mt = MT[source]

  -- Each tile is 16 bytes: 2 bitplanes of 8 rows
  local base = tile_id * 16
  local pixels = {}  -- 8 rows of 8 pixels (values 0-3)

  for row = 0, 7 do
    local plane0 = emu.read(base + row, mt)
    local plane1 = emu.read(base + row + 8, mt)
    local row_pixels = {}
    for col = 0, 7 do
      local bit = 7 - col
      local lo = (plane0 >> bit) & 1
      local hi = (plane1 >> bit) & 1
      row_pixels[col + 1] = hi * 2 + lo
    end
    pixels[row + 1] = row_pixels
  end

  return { tile_id = tile_id, source = source, pixels = pixels }
end
```

#### `write_chr_tile`

Encodes a pixel grid back to CHR format and writes it:

```lua
function handlers.write_chr_tile(params)
  local tile_id = params.tile_id
  local pixels = params.pixels
  local target = params.target or "chrRam"  -- "chrRam" preferred; "chrRom" for ROM patching
  local mt = MT[target]

  local base = tile_id * 16
  for row = 0, 7 do
    local plane0, plane1 = 0, 0
    for col = 0, 7 do
      local bit = 7 - col
      local px = pixels[row + 1][col + 1]
      if (px & 1) ~= 0 then plane0 = plane0 | (1 << bit) end
      if (px & 2) ~= 0 then plane1 = plane1 | (1 << bit) end
    end
    emu.write(base + row, plane0, mt)
    emu.write(base + row + 8, plane1, mt)
  end

  return { tile_id = tile_id, target = target, rows_written = 8 }
end
```

### TypeScript Side

#### Protocol types (2 new result interfaces in `protocol.ts`)

```typescript
interface ReadChrTileResult {
  tile_id: number;
  source: string;
  pixels: number[][];
}

interface WriteChrTileResult {
  tile_id: number;
  target: string;
  rows_written: number;
}
```

#### Adapter methods (2 new methods in `adapter.ts`)

- `readChrTile(tileId: number, source?: string): Promise<ReadChrTileResult>`
- `writeChrTile(tileId: number, pixels: number[][], target?: string): Promise<WriteChrTileResult>`

#### MemoryType enum

Add `"chrRam"` (it's already in the Lua `MT` table but not in the TS `MemoryType` union).

---

## Part 3: New Agent Tools (5 total)

### `read_tile`

Read a tile's 8x8 pixel grid from CHR data. Returns a decoded grid of palette indices (0-3) plus an ASCII art preview for the LLM to "see" the tile shape.

```
$B4: cloud-top-left (from mapping)
  . . . . 1 1 2 2
  . . 1 1 2 2 2 2
  . 1 2 2 2 2 2 2
  1 2 2 2 2 2 2 2
  ...
```

### `write_tile`

Write an 8x8 pixel grid to CHR memory. The agent specifies pixel values 0-3. Warns the user if writing to CHR ROM (which patches the ROM in memory).

### `read_nametable`

Read a rectangular region of the nametable (tile IDs + palette assignments). Returns a 2D grid showing which tiles are placed where on screen. If a mapping is loaded, includes tile names.

Uses existing `read_memory` against PPU debug memory — no new Lua handler needed.

### `write_nametable`

Write tile IDs to specific nametable positions. Uses existing `write_memory` against PPU memory. This is how you rearrange which tiles appear where on screen.

### `record_mapping`

An explicit tool for the agent to record what it discovers about the ROM. This is how knowledge gets built during a session:

```json
{
  "name": "record_mapping",
  "input_schema": {
    "properties": {
      "mapping_type": { "enum": ["tile", "palette", "sprite", "address"] },
      "id": { "description": "Tile ID (hex), palette ID, sprite name, or address (hex)" },
      "name": { "description": "Human-readable name" },
      "category": { "description": "Category (background, interactive, enemy, etc.)" },
      "group": { "description": "Related group (cloud, pipe, ground)" },
      "notes": { "description": "Additional context" },
      "confidence": { "description": "How certain (0-1). 1 = confirmed, <1 = hypothesis" }
    }
  }
}
```

When executed, this writes a `mapping_discovered` or `mapping_hypothesis` event to the DB. These are the discoveries that can later be "promoted" to the static game mapping file.

---

## Part 4: System Prompt Updates

Add to `prompts.ts`:

- **CHR Editing Guide** — explain the 2-bit pixel encoding, the difference between CHR ROM vs CHR RAM, and the read-modify-write workflow
- **Palette Sharing Warning** — "Multiple tile types often share the same palette (e.g. SMB1 clouds/bushes/ground all use palette 0). Changing a palette color affects ALL tiles using it."
- **Mapping Context Injection** — when a mapping file is loaded, append a summary: known tiles, palettes, sprites, key addresses. This gives the agent a massive head start.
- **`record_mapping` guidance** — instruct the agent to record discoveries as it works, especially when identifying tile purposes from screenshots

In `buildContextualPrompt()`: after loading ROM info, look up the mapping file. If found, call `formatMappingForPrompt()` and append.

---

## Part 5: Server Integration

### Event Recording Additions (`src/index.ts`)

Add `extractDomainEvents` cases for:

- `record_mapping` -> writes `mapping_discovered` or `mapping_hypothesis` event
- `write_tile` -> writes `sprite_edit` event (tile modification with before/after data)

### "Promote" WS Action (`promote_mappings`)

New WS action that exports session discoveries to a static mapping file:

1. Server reads all `mapping_discovered` events from the active session
2. Loads existing mapping file for the ROM (if any), or creates a new one
3. Merges new discoveries (doesn't overwrite existing entries)
4. Writes to `mappings/sha1-{sha1}.json`

This is the community contribution pipeline: **discover -> record in session -> promote to file -> share**.

---

## Implementation Steps

All steps complete:

| Step | Files | Description | Status |
|------|-------|-------------|--------|
| 1 | `src/mappings/types.ts`, `src/mappings/loader.ts`, `src/mappings/index.ts` | Mapping types + loader | Done |
| 2 | `mesen/bridge.lua` | +`read_chr_tile`, `write_chr_tile` handlers | Done |
| 3 | `src/bridge/mesen/protocol.ts`, `src/bridge/mesen/adapter.ts` | +CHR tile TS types and adapter methods | Done |
| 4 | `src/agent/tools.ts` | +8 new tool definitions + executors | Done |
| 5 | `src/agent/prompts.ts` | CHR guide, palette warnings, mapping injection, emulator control guidance | Done |
| 6 | `src/agent/agent.ts` | Load mapping + emulator status in `buildContextualPrompt()` | Done |
| 7 | `src/index.ts` | Emulator control WS actions, `promote_mappings` action | Done |
| 8 | `mesen/bridge.lua` | Pause/step/resume via blocking TCP receive in `codeBreak` | Done |
| 9 | UI + gateway | Pause/Step/Resume buttons, sidebar pause state, gateway routing | Done |
| 10 | Tests | All new modules + integration (834 tests, 29 files) | Done |

---

## Part 6: Emulator Pause/Step/Resume Control (Added Mid-Phase)

This was added to Phase 4 when we discovered that batch editing workflows (tile write → screenshot verify) required precise emulator timing control.

### The Problem

When the emulator is running, `endFrame` fires 60 times per second and the bridge polls TCP commands there. But when the emulator is **paused**, `endFrame` stops — and there's no way to process commands. The chicken-and-egg: we need to receive a "resume" command, but we can't receive commands while paused.

### The Solution: Blocking TCP Receive in codeBreak

The `codeBreak` callback fires when the emulator breaks. Inside it, we switch the socket to blocking mode with a 200ms timeout and poll up to 3 times (600ms total). This stays under Mesen's 1-second Lua watchdog timer. The blocking `socket.receive()` uses the OS `select()` system call — zero CPU, and Lua instruction counting pauses during C calls.

Each `codeBreak` invocation ends by calling `emu.step()` to schedule the next one, creating an indefinite pause loop where each iteration gets a fresh 1-second watchdog budget.

### Files Modified

| File | Changes |
|------|---------|
| `mesen/bridge.lua` | `codeBreak` callback with blocking receive, state flags, 4 new handlers |
| `src/bridge/mesen/protocol.ts` | 4 new result types |
| `src/bridge/mesen/adapter.ts` | 4 new methods |
| `src/agent/tools.ts` | 3 new LLM tools (pause, resume, step) |
| `src/agent/prompts.ts` | Emulator control guidance + PAUSED/RUNNING status |
| `src/agent/agent.ts` | `getEmulatorStatus()` in context building |
| `src/index.ts` | 4 new WS action cases |
| `src/web/actors/sidebar/EmulatorSidebar.ts` | Pause state tracking, button handlers |
| `src/web/actors/gateway/GatewayActor.ts` | Emulator control response routing |
| `src/web/index.html` | Pause/Step/Resume button row |

---

## What's NOT in Phase 4

- Visual tile editor UI (clicking pixels in browser) — Phase 5 territory
- Sprite composition (multi-tile sprites, OAM editing) — Phase 5
- Disassembly-guided mapping — Phase 7
- IPS/BPS patch export — Phase 7
- Timeline UI — Phase 6
