# jeROMy Roadmap

## Completed

### Phase 1: Bridge + Emulator Connection
- TCP bridge between TypeScript (WSL2) and Mesen2 Lua script
- MesenAdapter with full NES API: screenshots, palettes, tiles, memory, save states
- Web UI with emulator view, chat panel, and sidebar

### Phase 2: Agent + LLM Tool Loop
- Anthropic Claude integration with streaming
- 13 agent tools: screenshot, tile inspection, palette read/write, memory read/write, save/load state, disassembly
- System prompt with NES hardware reference
- Capstone disassembler integration (optional)

### Phase 3: Event-Sourced Database
- SQLCipher encrypted database with WAL mode
- Append-only event store with 15 event types
- Session management: CRUD, zero-copy forking via M:N join table
- Snapshot manager for context compression
- Lossless history rebuild from DB events
- Server integration: auto-session creation, event recording, 8 new WS actions
- 1155 tests across 46 files

## In Progress

### Phase 3.5: Session UI + Bug Fixes
- Browser UI for session list, switching, forking, deletion
- Snapshot creation/listing in the UI
- Pixel selector → agent integration (inject click results into chat context)
- Save state fix (`createSavestate` API discovery)

## Planned

### Phase 4: Tile & CHR Editing

The agent can currently only change colors (palette edits). To change shapes — turning a cloud into a snake, editing sprite art, modifying level geometry — it needs CHR (Character ROM/RAM) editing.

#### NES Graphics Primer
- CHR data stores 8x8 pixel tile bitmaps. Each pixel is 2 bits (values 0-3), indexing into the assigned palette.
- Each tile is 16 bytes: two 8-byte bitplanes interleaved.
- The nametable maps tile IDs to screen positions. The attribute table assigns palettes to 16x16 blocks.
- Many NES games use CHR RAM (writable) rather than CHR ROM (read-only). SMB1 uses CHR ROM, so tile edits require patching ROM data.

#### New Tools
- `read_tile(tile_id)` — Read a tile's 8x8 pixel grid (decoded from CHR data) as a 2D array of palette indices (0-3)
- `write_tile(tile_id, pixels)` — Write an 8x8 pixel grid back to CHR RAM/ROM
- `read_nametable(x, y, width, height)` — Read a rectangular region of the nametable (tile IDs + palette assignments)
- `write_nametable(x, y, tile_ids)` — Place tiles at screen positions

#### Visual Tile Editor (Future UI)
- Zoom into a tile or group of tiles in the browser
- Click individual pixels to edit them (2-bit values mapped to palette colors)
- "Sprite sheet view" — browse all tiles in CHR ROM as a grid
- The user labels regions: "these tiles are the cloud", "this is Mario's head"
- These labels become `mapping_discovered` events in the DB, building a knowledge base the agent can reference

#### LLM-Driven Tile Editing
- The agent could eventually design 8x8 tile art by specifying pixel grids in JSON
- For complex shapes: the agent proposes a design, renders a preview (via the tile editor), and the user approves
- Vision-based feedback loop: agent writes tile, takes screenshot, evaluates result, iterates

### Phase 5: Sprite & Animation Editing
- OAM (Object Attribute Memory) inspection and editing
- Sprite composition: many NES sprites are multi-tile (8x16 or assembled from multiple 8x8 tiles)
- Animation frame identification and editing
- Sprite sheet organization tools

### Phase 6: Timeline UI
- Visual event timeline with scrubbing
- Fork visualization (tree view of session branches)
- Event filtering by type (show only palette edits, only memory writes, etc.)
- Diff view between sessions or between fork points
- "Time travel" — rewind to any event and fork from there

### Phase 7: Game Logic & Code Analysis
- Disassembly-guided memory mapping (using Capstone)
- Identify game routines: movement, collision, scoring
- Suggest memory addresses for game variables (lives, score, position)
- ROM patching: modify game logic (change physics, add behaviors)
- Patch diffing and export (IPS/BPS patch generation)

## Ideas (Unscoped)

### User-Assisted Object Identification
The user could zoom into the emulator view and select rectangular regions of pixels, tiles, or sprite chunks to label:
- "This 2x3 tile region is the question block"
- "These sprites are the Goomba"
- Labels are stored as `mapping_discovered` events and inform future agent decisions
- Reduces the need for the LLM to identify objects from screenshots alone
- Could work as a "training" mode where the user teaches the agent about the game's visual layout

### Multi-Tool Editing Workflows
- Batch operations: "change all pipes from green to red" (requires finding all pipe tiles, checking their palettes, and editing accordingly)
- Template-based edits: "make this tile look like [reference image]"
- Copy/paste between tiles or between games

### ROM Patching & Export
- Generate IPS/BPS patches from accumulated edits
- Export modified ROM
- Track which edits are reversible vs permanent
- "Recipe" system: save a sequence of edits as a replayable script
