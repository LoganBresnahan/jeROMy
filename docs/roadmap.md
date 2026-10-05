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
- [ ] **6. Emulator view page.** Built 2026-10-05 (`src/dsh/emulator-view.ts`):
      loopback page on :9002 with a live view pushed over Server-Sent
      Events from one shared frame pump (10 fps while running, 1 Hz state
      while paused, unchanged frames not resent, off-thread decode; measured
      30 events / 3 s), zoom, pixel picker, pause/step/resume; a click resolves tile + palette
      through the bridge, highlights the tile, and injects a one-line context
      into the live agent (`[emulator view] The user clicked pixel ...`).
      Opened in dsh's right-sidebar Browser tab (enabled in the dev patch).
      Unit-tested at the HTTP level. Logan confirmed it working in the
      sidebar 2026-10-05. Found and fixed the same night: a browser tab's
      open event stream kept the frame pump polling after dsh disposed the
      plugin scope, crashing headless runs at shutdown; the view now shuts
      the pump and its streams down with the scope. `scripts/trio.sh`
      passes all three checks in 47 s. Remaining: the pixel-click injection
      has only been exercised through `/pick` returning `injected: true`;
      a person asking the agent about a clicked tile closes this item.
- [ ] **7. Bundle + profile.** `cordis.patch.yml` that inserts the jeROMy
      plugins and removes the coding-agent tools; setup settings card that
      shows the Lua script path for Mesen. `dsh plugin --profile jeromy add`
      works from a clean machine. ADR-0001.
- [ ] **8. Delete the old stack.** Remove `src/web`, `src/db`, `src/server`,
      `src/index.ts`, `src/agent/agent.ts`, `src/agent/providers`. Rewrite
      README as an install guide. Update `docs/README.md` and the
      architecture docs that describe deleted code.
      Carry-in: deleting `src/db` also clears the 9 `tsc` errors in
      `docs/issues.md`; after this item the ship bar's typecheck has no
      allowed residual, so remove that clause from `/shipshape`.

## Next

- **9. Curated ROM-hacking skills** (ADR-0008): a `skills/` directory in
  the plugin, registered through `ctx.skills`, one procedure per skill,
  model- and user-invocable. First set: `rom-orient`, `palette-swap`,
  `tile-redraw`, `sprite-swap`, `find-variable`, `layout-edit`,
  `promote-and-share`; each with a `trio.sh` check and a shipshape grep
  that every tool it names exists. Write them from real SMB sessions, not
  from memory. Standing rule: a procedure is written up the session it is
  figured out. Drafted so far: `skills/palette-swap/SKILL.md` (from the
  2026-10-05 edit checks; not yet registered with dsh).

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
