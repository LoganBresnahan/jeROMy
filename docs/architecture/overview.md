# jeROMy — Architecture Overview

jeROMy is a DeepSeek Harness (dsh) plugin (ADR-0001). dsh owns the chat UI,
the model (`deepseek-flash`, ADR-0002), sessions and persistence (ADR-0003),
settings and skills. jeROMy owns everything that knows about emulators and
ROMs. This document is the map; the decisions are in `docs/adr/`.

```
┌─ dsh (Node, WSL2) ───────────────────────────────────────────────────────┐
│  web UI · agent loop · deepseek-flash · sessions (~/.dsh/sessions)        │
│                                                                           │
│  ┌─ jeROMy plugin  src/dsh/index.ts ───────────────────────────────────┐  │
│  │  MesenService (ctx.mesen)   tools (23 core + promote_mappings)      │  │
│  │  prompt section "jeromy:emulator"   emulator view :9002 (ADR-0004)  │  │
│  └───────────────┬─────────────────────────────────────────────────────┘  │
│                  │ EmulatorAdapter (interface, ADR-0005)                   │
└──────────────────┼────────────────────────────────────────────────────────┘
                   │ TCP :9001, newline JSON (docs/bridge.md)
┌──────────────────▼─────────────────────────┐
│  Mesen2 (Windows)  mesen/bridge.lua         │
│  endFrame: non-blocking poll, overrides     │
│  codeBreak (paused): bounded blocking poll  │
└─────────────────────────────────────────────┘
```

## Layers

| Layer | Where | Knows about |
|---|---|---|
| Lua bridge | `mesen/bridge.lua` | Mesen's Lua API, the wire protocol. The only code on Windows. |
| Bridge | `src/bridge/mesen/` | TCP server, request/response framing, `MesenAdapter` implementing `EmulatorAdapter`. |
| Core | `src/agent/tools.ts`, `prompts.ts`, `nes-palette.ts`, `disassembler.ts`, `src/mappings/` | NES hardware, the 27 tools, the prompt, mapping files. Talks only to `EmulatorAdapter`. No `@deepseek-ai/*` import (ADR-0005). |
| dsh adapter | `src/dsh/` | Cordis plugin: service, tool registration via one mapper, attachments for images, system-prompt section, `agent.inject()` for pixel clicks, the loopback view server. |

## Runtime flow

1. `scripts/up.sh` starts dsh with the `jeromy` profile and a dev patch that
   mounts `src/dsh/index.ts`, launches Mesen2 with the ROM and `bridge.lua`,
   and waits for the Lua client to connect to :9001.
2. On connect, `MesenService` reads ROM info, loads `mappings/sha1-<sha1>.json`,
   and resumes a paused emulator. The prompt section renders ROM name,
   mapping context and pause state live.
3. A user instruction runs dsh's agent loop. Tool calls go through the
   adapter to Lua; image results become dsh attachments (the model sees the
   PNG). `record_mapping` results accumulate as discoveries on the service;
   `promote_mappings` merges confirmed ones into the mapping file.
4. The emulator view page (:9002, opened in dsh's sidebar browser) streams
   screenshots over SSE at up to 10 fps and offers pause/step/resume. A click
   resolves tile/palette/address and injects a `[emulator view]` user
   message into the live agent, so it is in the session log like everything
   else the model sees (ADR-0003).

## Timing constraints

- Mesen's Lua watchdog is 1 s. While paused, `codeBreak` polls the socket
  in bounded rounds; `POLL_TIMEOUT × POLL_ROUNDS` is 600 ms and does not
  grow. While running, `endFrame` never blocks.
- `emu.takeScreenshot` returns empty while paused; the screenshot tool
  errors with a hint instead of sending an empty image.
- Mid-frame scroll splits (SMB's status bar) make `ppu.xScroll` at request
  time wrong for pixel→tile lookups; ADR-0010 fixes this with
  `get_pixel_color` and a per-scanline scroll capture.

## Persistence

dsh's session log is the record of every session (ADR-0003, ADR-0011);
`scripts/dsh-log.mjs` reads it. Mapping files under `mappings/` are the
shareable artifact. Persistent ROM edits (a ledger under `hacks/`, patch
export) are ADR-0009.

## History

The v0.1 standalone stack (HTTP/WebSocket server, Lit-free actor web UI,
SQLCipher event store, Anthropic provider) was deleted at roadmap item 8 on
2026-10-05. `docs/architecture/phase4-plan.md` is kept as the record of the
tile-editing and mapping work that shipped under it; `git log` before
`1e7ecc2` has the rest.
