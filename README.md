# jeROMy

AI ROM-hacking agent for retro games. You describe a change in plain
language; the agent inspects the running game in Mesen2 (screenshots, tiles,
palettes, nametables, memory), edits it live, verifies by looking, and
records what it learned about the ROM as a shareable mapping.

jeROMy is a plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
(dsh). dsh provides the chat UI, the model access (`deepseek-flash`, with
native vision), sessions and settings; jeROMy provides the emulator bridge,
the ROM-hacking tools, the NES prompt section, the mapping files and an
emulator view page for dsh's sidebar browser. Product intent lives in
[docs/DIRECTION.md](docs/DIRECTION.md); decisions in [docs/adr/](docs/adr/README.md);
build order in [docs/roadmap.md](docs/roadmap.md).

```
dsh (web UI, model, sessions)  ──plugin──▶  jeROMy (src/dsh/)
                                               │ EmulatorAdapter
                                               ▼
                               TCP :9001 ◀──── mesen/bridge.lua in Mesen2 (Windows)
                               :9002 emulator view (sidebar Browser)
```

## What you need

- Windows with [Mesen2](https://www.mesen.ca/) 2.1+ and a NES ROM you own.
  jeROMy never ships or fetches ROMs.
- WSL2 (Ubuntu) with Node 22+ and pnpm, and a checkout of DeepSeek Harness
  (`dsh-v0.2.1-alpha.1` or later) next to this repo.
- A DeepSeek API key in `DEEPSEEK_API_KEY`.

Mesen2 settings, once per machine: Tools → Script Window → allow network
access, allow I/O, script timeout 1 s, auto-start on load.

## Install (from source, until the bundle ships)

```bash
git clone git@github.com:LoganBresnahan/jeROMy.git ~/jeROMy
git clone https://github.com/deepseek-ai/deepseek-harness ~/deepseek-harness && (cd ~/deepseek-harness && pnpm install)
cd ~/jeROMy && npm install
cd ~/deepseek-harness && pnpm dsh jeromy --from-default-profile web   # creates ~/.dsh/profiles/jeromy once
```

`scripts/dsh-dev.sh` writes a patch overlay that mounts `src/dsh/index.ts`
into the `jeromy` profile, selects `deepseek-flash`, enables the sidebar
browser, turns off dsh's session-log upload, and removes the coding
toolbelt. A packaged bundle (`dsh plugin --profile jeromy add`) is roadmap
item 7.

## Run

```bash
scripts/up.sh            # dsh (profile jeromy), Mesen2 with the ROM + bridge.lua, waits for the bridge
scripts/up.sh --down     # stop dsh (Mesen stays open)
```

`up.sh` prints the dsh URL. Open it, start a session, open the right-sidebar
**Browser** at `http://127.0.0.1:9002/` for the live emulator view: click a
pixel and the agent receives the tile, palette and address under it.

Try: "Take a screenshot and describe what you see", "What tile did I just
click?", "Make the pipes red", "Find the lives counter in RAM".

Headless checks and session review:

```bash
scripts/trio.sh                       # look / read / edit through dsh, streams under .chat-out/
scripts/dsh-log.mjs show latest       # what the agent saw, reasoned and called (ADR-0011)
```

## Layout

```
mesen/bridge.lua        Lua client inside Mesen2: JSON over TCP, palette overrides, memory, PPU
src/bridge/mesen/       connection, protocol, EmulatorAdapter (host-agnostic)
src/agent/tools.ts      the 24 ROM-hacking tools against the adapter; prompts.ts; nes-palette.ts
src/mappings/           mapping loader + schema; mappings/sha1-*.json are the shipped artifact
src/dsh/                the dsh plugin: Mesen service, tool registration, prompt section, emulator view
skills/                 curated ROM-hacking procedures shipped with the plugin (ADR-0008)
scripts/                up.sh, trio.sh, dsh-dev.sh, mesen-up.sh, dsh-log.mjs, budget.sh
docs/                   DIRECTION, roadmap, issues inbox, ADRs, plans, bridge protocol
```

Rules for working in the repo are in [CLAUDE.md](CLAUDE.md).

## Tools

Screenshot and pixel/tile lookup (`screenshot`, `get_tile_at_pixel`,
`read_tile`, `read_nametable`), palettes (`get_palette`, `get_all_palettes`,
`write_palette` with per-frame override, `clear_palette_overrides`), memory
(`read_memory`, `write_memory`, `search_memory`), `get_pixel_color`, CPU and
ROM info, save/load state, emulator control (`pause_emulator`,
`resume_emulator`, `step_frame`, `reset_emulator`), `disassemble` (Capstone
WASM), and the mapping tools (`record_mapping`, `promote_mappings`). RAM edits are the
default; CHR/PRG ROM is never written silently.

## Development

```bash
npm test             # vitest, all suites
npx tsc --noEmit     # typecheck
cd capstone && ./build.sh   # rebuild the Capstone WASM (needs emsdk; artifacts are gitignored)
```

## License

AGPL-3.0
