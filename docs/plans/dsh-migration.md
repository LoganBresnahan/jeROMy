# Rethink: jeROMy as a DeepSeek Harness plugin

> **Status 2026-10-05:** phases through roadmap item 8 shipped; the delete column of the keep/delete table is done. Open: item 7 (bundle).

Status: accepted 2026-10-05. Decisions recorded as ADR-0001 (plugin, not app), ADR-0002 (model and provider layer), ADR-0003 (persistence), ADR-0004 (emulator view), ADR-0005 (core/adapter layering). Build order in `docs/roadmap.md`. Supersedes `local-model.md` as the cost-reduction plan.

## Verdict

jeROMy becomes a dsh plugin. Not an app that embeds dsh: a package
(`dsh-jeromy`) with a `dsh` manifest field, installed into a profile with
`dsh plugin --profile jeromy add dsh-jeromy`, tagged `dsh-plugin` on
GitHub. It ships as a bundle whose `cordis.patch.yml` inserts the jeROMy
plugins and removes the coding-agent tools (shell, fs, workspace) that
would distract a ROM-hacking model, so users do not hand-trim a profile.
The Lua bridge and `mappings/*.json` travel inside the package; a setup
settings card tells the user where the Lua script is for Mesen.

Inside that package, build two layers so the bet is hedged:

1. `core/`: Mesen connection + adapter, tool specs (name, description,
   JSON schema, execute against the adapter), prompt text, mapping
   loader. No dsh imports. Vitest against a mocked adapter, as today.
2. `dsh/`: thin adapter that maps each core tool to `defineTool`,
   registers the Mesen service, the prompt section, the session events,
   and serves the emulator-view page.

If dsh breaks under us, layer 2 is what gets rewritten (an MCP server
wrapper over `core/` is a few hundred lines and runs in any host).

Alternatives considered:
- Keep own UI: already proven unsustainable for one person. No.
- Ship only an MCP server, use any host: most portable, but loses
  prompt sections, `agent.inject()` for pixel-picker clicks, custom
  session events, and image-in-tool-result handling is host-dependent.
  Keep as the fallback shape, not the primary.
- pi-mono (`pi-agent-core` + `pi-web-ui`): lighter and calmer than dsh,
  but a much smaller UI and no plugin ecosystem; we would be back to
  owning the shell.

Risks specific to dsh: alpha with breaking changes; a coding-agent
default profile (shell, fs, workspace tools) that must be trimmed so a
ROM-hacking model is not distracted by 30 irrelevant tools; thin client
extension docs. Upside specific to dsh: the model vendor ships it, so
`deepseek-flash` tool calling is tuned against this harness's exact
tool format.

## Why

- Claude vision made development too expensive (~$5/prompt).
- DeepSeek now has a native vision model at text pricing (see Model below).
- The custom web UI (`src/web`, ~15k lines of actors) and the event-sourced
  session DB (`src/db`, `src/server`) duplicate what DeepSeek Harness (dsh)
  ships: sessions with fork/resume, streaming chat, settings, plugin
  management, MCP, model switching. We should stop maintaining them.

## Model

DeepSeek API, verified 2026-10-04 (api-docs.deepseek.com):

| Model id | Notes |
|---|---|
| `deepseek-flash` | = DeepSeek-V4.1-Flash (released 2026-09-10). Native vision, tool calls, JSON, thinking, 1M context, 384K max output. |
| `deepseek-v4-pro` | No vision. Routed to V4.1-Flash since 2026-09-14. Effectively retired. |
| `deepseek-v4-flash`, `deepseek-v4-flash-vision-exp` | Legacy aliases, served by V4.1-Flash. |

Pricing per 1M tokens (peak / off-peak, off-peak = 01:00-04:00 and
06:00-10:00 UTC weekdays are *peak*, everything else half price):

| | Peak | Off-peak |
|---|---|---|
| Input, cache miss | $0.30 | $0.15 |
| Input, cache hit | $0.006 | $0.003 |
| Output | $1.20 | $0.60 |

Images: PNG/JPEG/GIF/WebP, base64 data URL or URL, hard cap 1024 tokens per
image. A 256x240 NES screenshot is under the ~544px floor and gets upscaled,
so budget ~1024 tokens = ~$0.0003 per screenshot at peak. Docs say images go
in `user` messages; images inside tool results must be verified (see Risks).

Two ways to reach it:

1. OpenAI-compatible `https://api.deepseek.com` (what dsh's built-in adapter uses).
2. Anthropic-compatible `https://api.deepseek.com/anthropic`: supports image
   blocks, tool use, streaming, thinking. `claude-sonnet*`/`claude-haiku*`
   names map to `deepseek-flash`. This means the **current** jeROMy runs on
   DeepSeek today with only `ANTHROPIC_BASE_URL` + `ANTHROPIC_API_KEY` set.

## DeepSeek Harness (dsh) facts that matter

Source: github.com/deepseek-ai/deepseek-harness (MIT, "developer preview,
compatibility-breaking changes expected", latest v0.2.1-alpha.1 on 2026-10-03),
docs/architecture.md, docs/cookbook/*, docs/subsystems/*, docs/user/guide/providers.md.

- Node 22.19+, pnpm, TypeScript ESM. `npx @deepseek-ai/dsh web` -> http://127.0.0.1:3080.
- Cordis plugin tree. A plugin is a module exporting `name`, optional
  `inject: [...]`, and `apply(ctx, config)`. All registrations are effects
  that unwind on unload. Config via `@deepseek-ai/schemastery` schema.
- Tools: `inject: ['tools']`, `ctx.tools.register(defineTool({ name,
  description, parameters, output: { schema, render }, execute }))` from
  `@deepseek-ai/dsh-tools`. `execute` returns one canonical value, throw =
  isError, honor `exec.signal`. Optional `presentCall/presentResult` for cards.
- Images from tools: `ctx.attachments.saveImage()` makes a durable image;
  tool content goes through `admitPromptContent()` which replaces uploaded
  images with `ImageAttachmentRef`s; model sees an `image` ContentBlock.
  dsh's own `browser-use` / `computer-use` packages return screenshots this
  way, so the path exists. Local backend caps: 20 images / 200 MiB per
  message, long edge normalized to 2048px, 4 MiB encoded.
- System prompt: `system-prompt/assemble` event (whole-assembly transforms)
  and prompt sections via `ctx.systemPrompt`.
- Agent hooks: `agent/created`, `agent/pre-step`, `agent/request`,
  `tools/pre-execute|execute|post-execute|result`, `session/event`,
  `agent/assistant-stream`, `agent/turn-stopping`. `agent.inject()` adds
  model-facing context to the next request (this is how pixel-picker clicks
  reach the model). `agent.followup()` / `agent.steer()` drive input.
- Sessions: append-only log, "model-visible means logged", fork/resume built in.
- Providers: built-in DeepSeek card (API key in Settings -> Models, pick
  `deepseek-flash`, tick **Image**), plus `anthropic`, `openai`, and custom
  endpoints with protocol `openai-completions | openai-responses |
  anthropic-messages` and `input: [text, image]`. Switching model is a
  settings change, no code.
- MCP: `@deepseek-ai/dsh-mcp-client`, one plugin instance per server, tools
  namespaced `mcp__<server>__<tool>`. (Alternative packaging for us, but a
  native plugin gets attachments, prompt sections and agent.inject; MCP
  does not.)
- Web client extension: plugins declare `dsh.client` in package.json and
  build with the `clientBundle` tsdown preset. Documented surfaces are thin:
  settings cards, plugin detail page sections, right-sidebar tab types
  (`ui-sidebar-right`), keyed per-tool result views (`ui-tool`).
  `ui-sidebar-browser` shows "sandboxed HTTP(S) pages, including loopback
  services, in right-Sidebar tabs". That is our escape hatch for the
  emulator view.
- Mounting: dev = `pnpm dsh web --patch ./cordis.yml` with an `insert` row
  pointing at the .ts file; release = package with
  `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`, then
  `dsh plugin --profile <p> add <path>` and `dsh --profile <p> --dump-config`.

## What survives, what goes

| Current | Fate |
|---|---|
| `mesen/bridge.lua`, `src/bridge/mesen/*` (protocol, connection, adapter) | Keep. Becomes a Cordis `Service` (`ctx.mesen`). |
| `src/agent/tools.ts` (24 tools) | Port 1:1 to `defineTool`. Screenshot/extract_sprite return attachments. |
| `src/agent/prompts.ts` (NES reference, CHR guide, emulator status) | Port to a system prompt section. |
| `src/mappings/*`, `mappings/*.json` | Keep loader; prompt section injects the ROM's mapping; `record_mapping` writes to the mapping JSON (or `ctx.storage`). |
| `src/agent/disassembler.ts`, `nes-palette.ts` | Keep as-is. |
| `src/agent/agent.ts`, `providers/anthropic.ts`, `provider.ts` | Delete. dsh owns the loop and providers. |
| `src/db/*` (SQLCipher event store, sessions, forks, snapshots) | Delete. dsh session log covers it. Phase 6 timeline/fork UI is dropped. |
| `src/index.ts`, `src/server/*`, WS actions | Delete. Keep a tiny loopback HTTP server inside the plugin for the emulator view page. |
| `src/web/*` (actors, gateway, input area, sidebar) | Delete. |
| Emulator view + pixel picker + pause/step/resume buttons | Rewrite as one small static page served by the plugin on loopback, opened in a dsh right-sidebar browser tab. Click -> POST to plugin -> `agent.inject()`. Native sidebar tab later if the browser tab is annoying. |
| Phase 4.5 extended thinking | Free: `reasoningEffort` in cordis.patch.yml. |

## Plan

0. **Validate the model first (an afternoon, no migration).** Run current
   jeROMy with `ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic` and a
   DeepSeek key. Check: screenshot understanding, ASCII tile reading,
   palette edits, tool-call reliability, cost per turn. If V4.1-Flash can't
   do the vision work, nothing else matters.
1. **Scaffold.** Install dsh, create profile `jeromy`, mount a hello plugin
   from this repo via `--patch`. Pin the dsh version.
2. **`dsh-jeromy` plugin, tools first.** `MesenService` wrapping
   connection+adapter; port `screenshot` first to prove the attachment path;
   then the rest in groups (palette, memory, CHR, nametable, emulator
   control, mapping, disassembly). Vitest on tools with a mocked adapter,
   as today.
3. **Prompt + mappings.** System prompt section with hardware reference,
   emulator status, loaded mapping. `record_mapping` persists to
   `mappings/sha1-*.json`.
4. **Emulator view page.** Loopback page with auto-refresh screenshot,
   zoom, pixel picker, pause/step/resume. Sidebar-browser tab. Clicks
   inject into the agent.
5. **Delete the old stack.** Remove `src/web`, `src/db`, `src/server`,
   `src/index.ts`, `src/agent/agent.ts`, providers. Repo = plugin + Lua
   bridge + mappings + docs. Update README/roadmap.

## Risks

- dsh is alpha and says breaking changes are expected. Pin, and keep the
  plugin surface small (tools, one prompt section, one service, attachments).
- Images in tool results on DeepSeek: the vision guide only mentions `user`
  messages. dsh's adapter presumably handles this (its own screenshot tools
  depend on it), but step 0/2 must confirm, and if not, fall back to
  injecting the screenshot as a user-turn image via `agent.inject()`.
- Client-side plugin UI is under-documented. Don't plan on a native panel
  until the sidebar-browser page proves insufficient.
- Losing our encrypted DB and fork tree. Acceptable; dsh has sessions and
  forking, and mapping discoveries live in JSON files which were always the
  shareable artifact.

## Provider layer: don't own it

dsh already ships two LLM adapters behind one `ctx.llm` seam: a direct
DeepSeek adapter (`dsh-llm-deepseek`, plain fetch + SSE) and a
multi-provider adapter built on `@earendil-works/pi-ai` (Mario Zechner's
pi-mono library: unified streaming over 15+ providers, auto-generated model
catalog, cost tracking). Keeping provider APIs current is their job once we
are a plugin. Adding Vercel AI SDK underneath would be an abstraction under
an abstraction; the only reason to touch this layer is if we abandon dsh and
keep our own loop, in which case AI SDK or pi-ai directly is the answer.
If a provider dsh lacks is ever needed, `ctx.llm.registerAdapter([...])`
is the documented seam.

Stability: pin `@deepseek-ai/dsh` in the lockfile and upgrade deliberately.
Fork only when we need to carry a patch; rebasing a fork of a fast-moving
alpha monorepo costs more than pinning and buys the same stability.

## Storage: use dsh's, drop SQLCipher

Decision (2026-10-05): no encryption-at-rest requirement for this project.
dsh's JSONL session log, `attachment-local` for screenshots, and
`ctx.storageDomain` for per-ROM scratch state are sufficient. jeROMy
domain events (palette/tile/memory writes, `record_mapping`) go into
`SessionEventMap` so they fork and replay with the session; promoted
mappings stay as `mappings/sha1-*.json`. `src/db` is deleted outright.

(An earlier draft of this section compared jeROMy's SQLCipher layer with
Moby's and sketched a `dsh-session-persistence-sqlcipher` plugin. Moby's
`src/events` remains the reference if encryption ever comes back.)

## UI: replaceable, but extend instead

The web client is itself a bundle (`dsh-web-app`) and can be swapped, but
that recreates the problem we are leaving. Extend via a right-sidebar
browser tab now and a native `ui-sidebar-right` tab type later if needed.
