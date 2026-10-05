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

- **12. Click correctness** (ADR-0010), first after item 8: `get_pixel_color`
  from `emu.getPixel` mapped to a master-palette index; `get_tile_at_pixel`
  using the scroll in effect at the clicked scanline via a one-frame write
  callback on $2000/$2005/$2006; the bridge's first two-phase request
  (`pending` then answer on a later frame), documented in `docs/bridge.md`
  and reused by `trace_writes` in item 10. Until it lands, the picker's
  context line says the tile readout assumes no mid-frame scroll change.
- [x] **13. Prompt hygiene from the model's slips.** Done 2026-10-05: all
  64 master-palette hue names (`NES_COLOR_NAMES`, hand-checked against SMB)
  printed in the prompt as four brightness rows, a "name colors from the
  table, never from memory" rule, and a hex-writing rule (`0x29` or a code
  span). `nearestNesColor` added for ADR-0010's `get_pixel_color`. Verified
  by asking the model to restate: it named `$22`/`$29`/`$1A`/`$36`
  correctly and wrote hex in code spans (session `b83a8ddc`).
- **10. Persistent edits** (ADR-0009), in the order the procedure needs:
  (a) `search_memory` + `trace_writes` (Lua memory callbacks,
  `convertAddress`), useful on their own; (b) `hacks/sha1-<sha1>/` with
  `edits.json` auto-filled by ROM-targeted writes and `discoveries.json`
  taking over the in-memory ledger; (c) `export_patch` (IPS, BPS, verify by
  dump-and-diff), `export_rom`, `undo_edit`, `reset_emulator`; (d) mapping
  schema v2 with `rom_origins`; (e) the `persist-edit` skill from the first
  real SMB recolor that survives a reset, with its `trio.sh` check.
- **11. A `jeromy` agent preset** for the web app: dsh's web bundle
  disables the base coding tools and lets each agent preset mount its own,
  so "remove the coding toolbelt" (ADR-0001) is a preset, not a patch row.
  Decided 2026-10-05 (Logan): keep a read-only shell and `read_image`, drop
  write, edit and the fs tools. Logan's click session showed Bash +
  `read_image` doing useful work (cropping and annotating screenshots,
  sampling pixel colors). Ships with the bundle (item 7).
- **9. Curated ROM-hacking skills** (ADR-0008): a `skills/` directory in
  the plugin, registered through `ctx.skills`, one procedure per skill,
  model- and user-invocable. First set: `rom-orient`, `palette-swap`,
  `tile-redraw`, `sprite-swap`, `find-variable`, `layout-edit`,
  `promote-and-share`; each with a `trio.sh` check and a shipshape grep
  that every tool it names exists. Write them from real SMB sessions, not
  from memory. Standing rule: a procedure is written up the session it is
  figured out. Drafted so far: `skills/palette-swap/SKILL.md` (from the
  2026-10-05 edit checks) and `skills/identify-click/SKILL.md` (from
  Logan's click session the same night; waits on item 12 for its
  pixel-color step). Not yet registered with dsh. Every skill states the
  confidence rule for `record_mapping`: 1 only for something seen on
  screen; the click session marked two entries confirmed and both were, but
  it is the place over-confidence will show first.

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
