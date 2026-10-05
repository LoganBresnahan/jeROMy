# jeROMy roadmap

Frontier = first unchecked item under **Now**. Check items off as they ship;
pin deferred sub-tasks to items as carry-ins. Findings from real use live in
`docs/issues.md` and are pinned here only when they block a slice or change
build order. Plan: `docs/plans/dsh-migration.md`. Decisions: `docs/adr/`.

## Now

- [x] **0. Model check.** Done 2026-10-05 against `deepseek-flash` through
      the Anthropic-compatible endpoint, SMB (World) in Mesen 2.1.1, driven
      headlessly with `scripts/chat.mjs`. Look: accurate description of the
      1-1 start screen (4.7k in / 0.5k out tokens, about $0.002 at peak).
      Read: `get_tile_at_pixel`/`get_palette` values reported verbatim and
      matching a direct bridge probe. Edit: `write_palette` visible in the
      next screenshot (title-logo box orange to blue); the agent noticed my
      prompt had mislabeled that slot as "the ground" and said so rather
      than claiming success. That turn ran 139 s and 31k in / 22k out tokens
      because the v0.1 agent streams DeepSeek's thinking blocks as raw text
      and re-plans around them; dsh handles thinking natively, so this is
      not a model problem. V4.1-Flash passes; ADR-0002 stands.
      Automation that fell out: `scripts/mesen-up.sh` (launch Mesen with ROM
      + Lua from WSL, single-instance handoff works), `scripts/dev-deepseek.sh`,
      `scripts/chat.mjs`. Findings in `docs/issues.md`.
- [x] **1. Scaffold the plugin.** Done 2026-10-05. Profile `jeromy`
      created from the web template; `scripts/dsh-dev.sh` writes a `--patch`
      overlay (plugin mounted from `src/dsh/index.ts`, `deepseek-flash` as
      default model, bash/pwsh/fs/fs-search tools disabled) and boots the
      harness checkout under tsx. `scripts/link-dsh.sh` symlinks the harness
      workspace packages into `node_modules/@deepseek-ai` so the plugin and
      the host share one copy of cordis and dsh-tools. Package name
      `dsh-jeromy` is still only a plan; publishing is item 7.
- [x] **2. Core boundary.** Done 2026-10-05 in substance: `src/dsh/` is the
      only directory importing `@deepseek-ai/*` (the `/shipshape` grep enforces
      it) and it reaches core only through `src/bridge`, `src/agent/tools.ts`,
      `src/agent/prompts.ts`, `src/mappings`. The physical move into
      `src/core/` is deferred to item 8, when the dead directories go and the
      remaining ones can be renamed in one commit.
- [x] **3. Mesen service + screenshot tool.** Done 2026-10-05. `ctx.mesen`
      (`src/dsh/mesen-service.ts`) owns the TCP server, resumes a paused
      emulator on connect, caches ROM info, mapping and pause state for the
      prompt. First headless turn through dsh: screenshot saved through
      `ctx.attachments`, delivered to `deepseek-flash` as an image block,
      described correctly. The image-in-tool-result question from ADR-0002 is
      answered: it works on the native DeepSeek route.
- [x] **4. Port the remaining tools.** Done 2026-10-05 for 23 of 24: one
      mapper (`src/dsh/tools/core-tools.ts`) turns every core spec into a raw
      JSON-schema dsh ToolDefinition, persists image results as attachments,
      waits up to 10 s for the bridge, and reports outcomes to the service.
      Verified headless: `get_tile_at_pixel` + `get_palette` values identical
      to a direct bridge probe; the edit check (write_palette, screenshot,
      clear) ran 21 steps in which the model paused, toggled the entry with
      single-frame steps to isolate the effect, and refused to attribute
      free-running gameplay differences to the edit. Whole turn about 40k
      input tokens, nearly all cache hits. Carry-in: `extract_sprite` needs user-uploaded
      images, which in dsh arrive as attachments on the user message; port it
      when the emulator view (item 6) or an upload flow exists. Capstone
      failed under the harness loader (Node required the CommonJS build as
      ESM because the repo is `type: module`); fixed the same day with
      `capstone/package.json` scoping that directory to CommonJS.
- [x] **5. Prompt section + mappings + promote.** Done 2026-10-05, with a
      scope change: the section is core `buildSystemPrompt` with cached ROM
      info, mapping and pause state; mappings load from the plugin's
      `mappings/` by SHA1 on connect; `promote_mappings` (dsh-layer tool)
      merges this process's confirmed `record_mapping` results into
      `mappings/sha1-*.json` through core `mergeMappings`/`saveMapping`.
      Separate `SessionEventMap` entries were dropped: dsh already logs every
      tool call and result durably, which is what the v0.1 domain events
      existed to approximate (ADR-0003 amended 2026-10-05).
      Carry-in: the discovery ledger is per process; move it to a
      `ctx.storageDomain` keyed by ROM SHA1 so an unpromoted discovery
      survives a restart.
- [x] **6. Emulator view page.** Done 2026-10-05. Loopback page on :9002,
      SSE frame pump (10 fps running, 1 Hz paused, unchanged frames not
      resent), zoom, pixel picker, pause/step/resume, in dsh's right-sidebar
      Browser. Logan's click check: the agent received the injected context
      line, froze the frame, cross-checked the readout against the rendered
      pixels, identified a pipe rim, recorded two mappings, and flagged that
      the tool's tile readout was wrong. Two carry-ins came out of that run,
      both in `docs/issues.md`: `get_tile_at_pixel` ignores mid-frame scroll
      splits (SMB status bar), and in the web app the tool set is governed by
      the agent preset, not by the base-row disables in our patch.

- [ ] **7. Bundle + profile.** `cordis.patch.yml` that inserts the jeROMy
      plugins and removes the coding-agent tools; setup settings card that
      shows the Lua script path for Mesen. `dsh plugin --profile jeromy add`
      works from a clean machine. ADR-0001. Carry-in: the bundle patch
      disables the session-log upload (`session-log-deepseek`
      `enabled: false`) as the dev patch does (ADR-0011, Logan 2026-10-05).
- [x] **8. Delete the old stack.** Done 2026-10-05. Removed `src/web`,
      `src/db`, `src/index.ts`, `src/agent/agent.ts`, `src/agent/provider*`,
      `scripts/chat.mjs`, `scripts/dev-deepseek.sh`, the v0.1 architecture
      docs and the `@anthropic-ai/sdk`, `@signalapp/sqlcipher`, `pngjs`,
      `ws`, `happy-dom`, `esbuild` dependencies. Core tool types moved to
      `src/agent/types.ts`. README is an install guide; overview and testing
      guide rewritten; `/shipshape` has no typecheck residual. Suite green
      twice, tsc clean, full trio green on the trimmed tree.
- [x] **14. Session replay.** Done 2026-10-05 (ADR-0011). `scripts/dsh-log.mjs`
      reads dsh's persisted session log (reasoning, tool calls, results,
      images, usage; `list`/`show`/`tail --follow`/`stats`/`events`), with
      tests; `/replay` says how to judge a session and when an autonomous
      loop stops. `trio.sh` prints a replay line per check and now runs
      from `~/.cache/jeromy/headless-cwd` so no repo's `AGENTS.md` or
      `CLAUDE.md` is injected into the agent. Out of order on purpose: it
      is the instrument for evaluating everything after it.

## Next

- [x] **12. Click correctness** (ADR-0010). Done 2026-10-05 in four
  commits per `docs/plans/adr-0010-split-scroll-build-plan.md`:
  `get_pixel_color`; the bridge's two-phase requests (`pending`, answered
  from a later `endFrame`, refused while paused unless the handler steps,
  cancelled on disconnect) plus reconnect-while-paused; `capture_scroll_writes`
  with the pre-write loopy state and a TypeScript reconstruction of the
  scroll per scanline (`scroll-reconstruct.ts`, SMB fixtures); and
  `get_tile_at_pixel` precise by default through `tile-lookup.ts`, shared
  with the picker, reporting `scroll_source`, `scroll_scanline`,
  `stepped_frames`, `scroll_ambiguous`. Verified on the title demo scrolled
  to 209 (nametable 1) and paused (session `44791c92`); `trio.sh click`
  checks the raw results. `trace_writes` (item 10) reuses the pending path.
- [x] **13. Prompt hygiene from the model's slips.** Done 2026-10-05: all
  64 master-palette hue names (`NES_COLOR_NAMES`, hand-checked against SMB)
  printed in the prompt as four brightness rows, a "name colors from the
  table, never from memory" rule, and a hex-writing rule (`0x29` or a code
  span). `nearestNesColor` added for ADR-0010's `get_pixel_color`. Verified
  by asking the model to restate: it named `$22`/`$29`/`$1A`/`$36`
  correctly and wrote hex in code spans (session `b83a8ddc`).
- **10. Persistent edits** (ADR-0009), per
  `docs/plans/adr-0009-persistent-edits-build-plan.md`. Done 2026-10-05:
  `search_memory` (chunked under the Lua watchdog), `reset_emulator`,
  `convert_address`; `hacks/sha1-<sha1>/` with `edits.json` filled by every
  prgRom/chrRom write (read-before/read-back, `reason`) and
  `discoveries.json` replacing the in-memory ledger across restarts;
  mapping schema v2 with `rom_origins` through `record_mapping`. Proven
  live: SMB's level palette table found at PRG `0xCCB`, slot 1 patched to
  `$16`, survives `reset_emulator`, restored. Remaining: `trace_writes`
  (two-phase, per-PC writers), IPS/BPS writers with an independent applier,
  `export_patch` / `export_rom` / `undo_edit`, and the `persist-edit` skill
  with its `trio.sh persist` check from the first real SMB recolor.
- [x] **11. A `jeromy` agent preset.** Done 2026-10-05 per Logan's call
  (read-only shell + `read_image`, no write/edit): the dev patch inserts
  `preset-jeromy` (persona, time context, bash without background jobs,
  tool-fs, skill-filesystem + the `skill` tool, ask-user, present,
  compaction) and makes it the registry default; `tool-fs` has no per-tool
  switch, so fresh sessions start in the `read-only` sandbox preset instead
  (writes blocked, person can raise it in the UI). Composed config checked;
  a web session on the preset is the morning's human check. Ships in the
  bundle at item 7.
- [x] **9. Curated ROM-hacking skills** (ADR-0008). Done 2026-10-05 for
  the mechanism and the first two: `skills/<name>/SKILL.md` parsed by
  `src/agent/skills.ts` and registered through `ctx.skills` as bundled,
  model- and user-invocable; dsh's `skill` tool lists and loads them
  (session `f64a1632`). Unit test pins frontmatter parsing and tool↔skill
  parity (every backticked tool a skill names exists). Drafted so far:
  `identify-click`, `palette-swap`. Still to write from real sessions, per
  the standing rule: `rom-orient`, `tile-redraw`, `sprite-swap`,
  `find-variable`, `layout-edit`, `promote-and-share`, `persist-edit`
  (ADR-0009), each with a `trio.sh` check.
- **Sprite & animation editing** (old Phase 5): OAM inspection/editing,
  multi-tile sprite composition, animation frame identification,
  `extract_sprite` from reference images, `find_unused_tiles`.
- **Disassembly intelligence** (old Phase 7): routine identification (NMI,
  input polling, physics), memory variable discovery cross-referenced with
  runtime reads, persistent disassembly results as mapping entries, ROM
  patching, IPS/BPS export. Capstone WASM is already built for 6502,
  65c02, W65816, ARM and Thumb.

## Later / unscoped

- User-assisted object identification: select regions in the emulator view
  and label them ("this 2x3 tile region is the question block").
- Batch edits ("all pipes green to red"), template edits from reference
  images, copy/paste between tiles and games.
- Edit recipes: a replayable script of edits.
- Second adapter (mGBA or an SNES emulator) to prove the platform layering.
- Smooth emulator view: a one-way binary frame channel from Lua (ADR-0007,
  proposed). Try the 20 fps setting first; adopt only when 10 fps is a
  measured complaint or tool latency rises while the view is open.

## Shipped (pre-rethink, 2026-02 to 2026-03)

Phases 1 through 4 of the original plan: TCP bridge + Mesen Lua client; agent
tool loop on Claude with 13 then 24 tools; SQLCipher event store with
zero-copy forking; session UI; game mapping files keyed by ROM SHA1; CHR tile
read/write; nametable read/write; `record_mapping`; pause/step/resume under
the Lua watchdog. Detail in `docs/architecture/phase4-plan.md` and the
architecture docs. Phase 4.5 (extended thinking) was in progress and is
superseded: thinking is a dsh config setting.
