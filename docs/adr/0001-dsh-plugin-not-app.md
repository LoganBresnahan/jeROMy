# ADR-0001: jeROMy ships as a DeepSeek Harness plugin, not an app

**Status:** Accepted
**Date:** 2026-10-05

## Context

jeROMy v0.1 is a standalone app: a Node server (`src/index.ts`, 824 lines),
a WebSocket chat UI built from shadow-DOM actors (`src/web`, about 15k
lines copied from an early DeepSeek Moby), an Anthropic provider adapter, and
an event-sourced session store. Of the roughly 21k lines in `src/`, about 3k
are jeROMy-specific: the Mesen bridge, 24 tools, prompt content, mapping
loader. The rest exists so those 3k have somewhere to run.

Maintaining the shell is what stalled the project. Moby's UI moved on and
ours did not; provider APIs drifted; the UI was fun once and is now a cost.
The maintainer is one person.

DeepSeek Harness (dsh, github.com/deepseek-ai/deepseek-harness, MIT,
developer preview as of v0.2.1-alpha.1 on 2026-10-03) is a Cordis plugin
tree where the agent loop, tools, sessions, providers, web client and MCP are
each plugins. A plugin is a module exporting `name`, `inject` and
`apply(ctx)`; tools register with `defineTool`; registrations unwind on
unload. Bundles ship a `cordis.patch.yml` that can insert plugins and remove
defaults. Plugins install into named profiles.

## Decision

1. jeROMy is a **dsh plugin package** (`dsh-jeromy`), installed with
   `dsh plugin --profile jeromy add dsh-jeromy`. Not an app that embeds or
   forks dsh.
2. It ships as a **bundle**: its patch inserts the jeROMy plugins and removes
   the coding-agent defaults (shell, filesystem, workspace tools) so a
   ROM-hacking model is not offered thirty irrelevant tools.
3. The Lua bridge and the mapping JSON files travel inside the package. A
   settings card shows the Lua script path for loading into Mesen.
4. dsh's version is pinned in the lockfile and upgraded deliberately. No
   fork unless a patch must be carried, and then as a temporary measure.
5. The repository, README and GitHub topic (`dsh-plugin`) present jeROMy as a
   plugin.

**Note 2026-10-05 on decision 2.** In the web bundle, tool availability
is per agent preset (presets mount their own tool rows in a realm; the base
rows are already disabled), so removing the coding toolbelt is a jeROMy
agent preset shipped with the bundle, not a patch disabling base ids. The
patch form still works for the headless profile. Roadmap item 11.

## Consequences

- `src/web`, `src/db`, `src/server`, `src/index.ts`, `src/agent/agent.ts`
  and the provider adapters are deleted once the plugin reaches parity
  (roadmap item 8). Phase 6 (timeline UI) is dropped; dsh has sessions and
  forking.
- The product's look, session model and settings are dsh's. jeROMy controls
  its tools, its prompt section, its session events and one sidebar page.
- dsh is alpha. Breaking changes land on us. Mitigated by pinning and by
  ADR-0005's thin adapter layer.
- The one UI piece dsh does not give us, the emulator view with a pixel
  picker, is handled by ADR-0004.
- The model vendor ships the harness, so `deepseek-flash` tool calling is
  tuned against this exact tool format. That is an upside no third-party
  framework offers.

## Alternatives

- **Keep the own UI, swap the model.** Cheapest today, same stall in six
  months. Rejected.
- **MCP server only, usable from any host.** Most portable, but loses system
  prompt sections, `agent.inject()` for pixel-picker clicks and custom
  session events, and image-in-tool-result handling varies by host. Kept as
  the fallback shape over ADR-0005's core layer, not the primary.
- **pi-mono (`pi-agent-core` + `pi-web-ui`).** Lighter and calmer than dsh,
  but a much smaller UI and no plugin ecosystem; we would own the shell
  again. Rejected.
- **Fork dsh for stability.** Rebasing a fast-moving alpha monorepo costs more
  than pinning and buys the same stability. Rejected.

## Revisit triggers

- dsh breaks the tool, attachment or prompt-section seams twice in a quarter.
- dsh's license or governance changes.
- A need for a UI surface that neither a sidebar page nor the documented
  client extension points can provide.
