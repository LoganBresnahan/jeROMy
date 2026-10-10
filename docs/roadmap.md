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

- [x] **7. Bundle + profile.** Done 2026-10-05 (ADR-0012): one npm package
      `jeromy-dsh` that is both the plugin and a bundle; the root
      `cordis.patch.yml` is the composition (plugin row by package name,
      model, sidebar browser, session-log upload off, coding tools off,
      `jeromy` preset as default, read-only sandbox default) and
      `scripts/dsh-dev.sh` derives the dev overlay from it. Installed
      copies keep user state in `~/.dsh/jeromy/` (mappings promotion
      target with the package's `mappings/` as seed; `hacks/`). Setup help
      is the Lua script path in the plugin log, `/status` and the view's
      disconnected state (a settings card is deferred; ADR-0012).
      `scripts/install-check.sh` proves it: fresh profile from the web
      template, `dsh plugin --profile jeromy-pkg add <tarball>`, boot,
      `/status` with `lua_script`, `/pick`, one headless look through the
      installed copy, profile removed. Not yet published to npm; install
      from the git URL or a packed tarball.
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
- [x] **15. Clicks that hold still and know about sprites** (ADR-0013).
      Done 2026-10-05 from Logan's first click session after the run
      (`2c572b4f`: a click on a paused game stepped it two frames, the box
      was drawn at nametable coordinates, and a click on Mario's hat named
      the sky tile under him). `bridge.lua` keeps a standing ring of the
      last completed frame's scroll writes, so `capture_scroll_writes`
      answers at once and nothing but `step_frame`, resets, save states and
      the Step button ever advances the emulator; `get_sprites` decodes OAM
      through PPUCTRL and hit-tests the clicked pixel against the pattern
      bytes; the lookup, the picker and the new `list_sprites` tool carry
      `sprite_hit`, `chr_tile` (nametable id through the background pattern
      table) and `screen_box`; the view's box is screen-space, the sprite's
      8x8 cell when one draws the pixel. README gained the boot walkthrough
      and how to get the view into the sidebar.
- [x] **16. Region selection by palette slot** (ADR-0014, the Later list's
      "select regions and label them", started on Logan's call 2026-10-05).
      Four selection modes in the view (pixel, tile, color, object; color
      the default) and a `get_region` tool. `read_region` in `bridge.lua`
      renders a 64x64 window into a PPU-faithful map (layer, palette, slot,
      tile, OAM per pixel) with the per-row scroll from the ring; the fill
      in `src/agent/region.ts` selects by slot, never by rendered color,
      and every answer states the two edit paths: how many pixels in view
      share the slot (palette edit) and whether the palette has a free slot
      (tile edit). The overlay tints the region and persists until the next
      click. Build plan: `docs/plans/adr-0014-region-selection-build-plan.md`.
      Carry-ins: labelling a selection into a mapping group from the view;
      object mode preferring an existing mapping group; the eight-sprites-
      per-line overflow rule.
- [x] **17. Clicks pause the game and queue behind checkboxes** (ADR-0015,
      Logan's call 2026-10-05). `POST /pick` pauses a running game before
      the readout and leaves it paused ("Pause on click" toggle; off =
      pause for the readout, resume after); the context line says which. A
      click no longer reaches the model by itself: `ClickHistory` keeps it
      in memory, checked by default when it is the newest of its mode, and
      the plugin's `agent/pre-step` listener enters the checked records
      ahead of the person's next prompt as logged `jeromy-view` messages.
      The page lists the history per mode (a., b., c.) with checkboxes,
      redraws a click's highlight from its row, dims sent rows, clears on
      demand, and follows `clicks_rev` on the stream. Human check pending:
      Logan's next web session, replayed. Carry-ins: a "send now" route if
      a running turn ever needs a click; history keyed by session if it
      should survive a restart.

- [ ] **18. Map Super Mario Bros. end to end** (release gate 1,
      `docs/DIRECTION.md`). Progress 2026-10-10: the checklist is now
      `eval/spec/smb.json` (89 lines, ADR-0020, spec v21); all 89 promoted
      by graded eval runs (sheet 1 pictures 31/31, judged by Claude from
      images and the CHR; sheets 2-5 10/10, 30/30, 6/6, 12/12, graded by the
      reference). Not ticked: the gate is Logan's to accept against the
      spec. Failure modes and their fixes in `eval/failures.md` (F1-F20). Originally: a coverage checklist in
      `docs/plans/smb-map-coverage.md`, one line per thing a person would
      point at (title, HUD, each world's tile sets, player and enemies,
      items and effects; every palette slot's job; the RAM a hacker reaches
      for; the level data format and where each level lives; NMI, scroll
      split, palette loads, level loader), each ticked with the session that
      proved it and promoted into `mappings/sha1-<smb>.json`. Needs: a
      `note` mapping type for facts that are not a tile, palette or address
      (the model already tried to record the scanline-31 split as an
      address); a `promote_mappings` pass per session; label-from-the-view
      (item 16 carry-in) so clicking produces entries without a model turn.
      Plan: `docs/plans/mapping-campaign.md` (five answer sheets, one
      discovery skill each, the tools they still lack, SMB order). First
      step shipped 2026-10-05: reference import (ADR-0017), `scripts/
      import-reference.mjs` for cc65 `.dbg`, assembler equates and wiki
      tables into the gitignored `hacks/sha1-<sha1>/reference.json`, the
      `lookup_symbol` tool, symbol names beside `trace_writes` writers, and
      `source` on `record_mapping`. Logan clones the ca65 port of
      doppelganger's disassembly beside his ROM and builds it; the plugin
      never fetches it.
- [x] **19. Iterate on a rewritten game** (release gate 2, ADR-0018). Done
      2026-10-05 night: named hacks per game (`sha1-<sha1>/<name>/` with
      ledger, `hack.json`, versioned `<name>-v<N>.bps` never overwritten),
      the hacks root as the person's own git repository (`.gitignore`
      seeded), `game.json` naming the active hack, `list_hacks` /
      `new_hack` / `use_hack` (revert the current ledger's bytes, write the
      next one's, reset), boot-time apply of the active hack with conflicts
      reported, the prompt and the view naming the active hack, and a
      one-time migration of the ADR-0009 single ledger into `default/`.
      Still to do under this item, as carry-ins: persistent paths for
      nametable, CHR-tile and level edits proven on SMB; `hack diff`
      against the original; the installed plugin's `hacksDir` default
      prompting for a repo. Original scope: the hack is
      a thing you boot: `up.sh` (and the installed plugin on connect)
      applies the ledger when the emulator's ROM is clean, with the prompt
      saying so instead of waiting for `reapply_edits`; persistent paths
      for nametable, CHR-tile and level edits proven on SMB the way the
      palette table was (origin found, ledgered, survives reset, exported);
      `hack status`/`diff` against the original; a session that reopens a
      hack from last week and keeps going. Shape proposed in ADR-0018
      (named hacks per game, the hacks root as the person's own git repo,
      one active hack, boot-time apply announced); the bright-line
      rewording in it needs Logan's yes before any of it is built.
- [x] **20. 60 fps view** (Logan's ask 2026-10-05; ADR-0007 closed as not
      needed). Measured before building anything: the JSON/PNG channel at
      `viewFps: 60` delivers 58 events and 38 distinct frames a second at
      109 KB/s with emulation at 60.0 fps; 30 and 20 scale linearly. Default
      raised to 60 (`viewFps` in the plugin config, cap 60); the status line
      shows view fps and emulation fps separately from the bridge's frame
      counter, so a slow view is never mistaken for a slow game.
- [x] **21. Pause without creep** (ADR-0016). Done 2026-10-05: the paused
      keep-alive steps one PPU dot instead of one CPU instruction; measured
      195 dots and two PC bytes per idle minute against a hundred-plus
      instructions before; a zero-count step was tried and does not
      re-break. Watchdog entry in `docs/issues.md` stands.
- [x] **22. The agent plays and maps blind** (ADR-0019; Logan's direction
      2026-10-05: "many games will not have a disassembly like Super Mario
      Bros"). Done 2026-10-06: the proof below ran as written. A blind
      headless session (`scripts/trio.sh --blind variable`) pressed Start,
      walked into the first Goomba twice, narrowed 2048 bytes to 29 to 3
      with two `decreased` diffs, picked `$075A` by its one-per-death step,
      wrote 5 to it and saw the "WORLD 1-1 x N" card follow, recorded it
      with `source: "differential search"`; `scripts/score-mapping.mjs`
      says the reference agrees (`NumberofLives`). On the way: Mesen's
      `setInput` takes the table first (its docs say otherwise), callback
      errors are throttled so a per-frame fault can never flood the Script
      Window again (it crashed its log pane once), and SMB's Start during
      the attract demo returns to the title, so the checks press it twice.
      Carry-ins: conditional segments and runs past 600 frames; recording
      the person's play as a script; a `mesen-service` test for the pause
      regex; hand-checked fixtures for the score classifier; a hack
      selector and `hack diff` still sit on item 19. Original scope:
      step 2 of the mapping campaign, with the controller added:
      `play_input` (a bounded button script run from an `inputPolled`
      callback in `bridge.lua`, two-phase, 600-frame cap, pause restored,
      `watch` addresses sampled per frame), `snapshot_memory` and
      `diff_memory` on the TypeScript side (per-adapter in-memory store,
      `changed|unchanged|increased|decreased|equals`, narrowing with
      `from`, reference names as leads), the `find-variable` skill written
      from the first blind session on SMB, `scripts/score-mapping.mjs`
      comparing promoted `address` entries against the reference, and a
      `trio.sh play` check. Proof: a headless session finds the lives
      counter with `lookup_symbol` held back, writes it, sees the HUD
      change, records it with `source: "differential search"`, and the
      score script confirms `$075A`.

- [x] **23. The eval loop** (ADR-0020; Logan's direction 2026-10-09: define
      "mapped", send DeepSeek, grade against the SMB answer key, let Claude
      judge pictures from images, run very autonomously on the whole
      balance). Documented first: `eval/README.md` (the operating manual),
      `eval/spec/attributes.md` (the draft attribute classes, for Logan to
      ratify). Build order: (a) `eval/spec/smb.json` from the attribute
      list and `docs/plans/smb-map-coverage.md`, which it retires; (b)
      `score-mapping.mjs` extended to origins, level ranges and routines,
      with falsification fixtures and a unit test (ADR-0020 §7) before any
      grade is trusted; (c) the schema changes the spec marks `[schema]`
      (`note`, a pattern-table-aware tile key, `scene`, `level`, `routine`,
      array/format fields), one ADR; (d) a `scripts/eval-run.sh` wrapper
      that writes `config.md`, runs the tasks, saves images and the scorer's
      JSON into `eval/runs/<id>/`; (e) the first graded run on sheet 3
      (coins, timer, score, world/level, player x/y) as the loop's smoke
      test; (f) the holdout game's reference import and spec, before SMB
      tuning continues. Item 18's sheets then proceed through runs, each
      recorded under `eval/runs/`.
      Progress 2026-10-09: (a)-(d) shipped (`eval/spec/smb.json`, the scorer
      graded by spec line and falsified, ADR-0021 schema 3,
      `scripts/eval-run.sh` + `eval-grade.mjs`); (e) ran as
      `eval/runs/20261009-1135-sheet3-hud-position` (4 of 8 lines right, 0
      wrong; HUD task lost to a provider error) and fixed `disassemble`;
      (f) the Zelda reference re-imported with PRG offsets per bank and its
      sheet-3 spec written. Then `20261009-1144-sheet3-hud-rerun` (3 of 4 right; spec v2, the `find-variable` extent step) and the first holdout, `20261009-1209-holdout-sheet3` (position and location carried, 3 of 3; HUD counters did not, 0 of 4). Open: item 18's other sheets through runs.

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
- [x] **10. Persistent edits** (ADR-0009). Done 2026-10-05, five phases
  per `docs/plans/adr-0009-persistent-edits-build-plan.md`: `search_memory`
  (chunked under the Lua watchdog), `reset_emulator` (two-phase, answers
  after the game re-initialised), `convert_address`, `trace_writes`
  (per-PC writers with ROM origins); `hacks/sha1-<sha1>/` with `edits.json`
  filled by every prgRom/chrRom write (read-before/read-back, `reason`) and
  `discoveries.json` surviving restarts; mapping schema v2 `rom_origins`;
  IPS/BPS writers checked by independent appliers; `export_patch`,
  `export_rom`, `undo_edit`; the `persist-edit` skill from the first
  model-driven recolor and `trio.sh persist`. Proof: SMB's level palette
  table at PRG `0xCCB`, slot 1 `$29→$16`, survives reset; the exported
  `.hacked.nes` booted in Mesen with red bushes from a clean start.
  Carry-ins closed 2026-10-05 (morning): `reapply_edits` (explicit, reads
  first, writes only missing entries) with the prompt section stating how
  many ledgered edits the emulator lacks; `save_state`/`load_state` rebuilt
  as two-phase requests inside an exec callback (Mesen2's rule), slots held
  by the running script; `clear_palette_overrides` restores the original
  color by default.
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

- Labelling a selection from the emulator view ("this 2x3 tile region is
  the question block"): the selecting half shipped as item 16 (ADR-0014);
  the label box that records a mapping group is its first carry-in.
- Batch edits ("all pipes green to red"), template edits from reference
  images, copy/paste between tiles and games.
- Edit recipes: a replayable script of edits.
- Second adapter (mGBA or an SNES emulator) to prove the platform layering.

## Shipped (pre-rethink, 2026-02 to 2026-03)

Phases 1 through 4 of the original plan: TCP bridge + Mesen Lua client; agent
tool loop on Claude with 13 then 24 tools; SQLCipher event store with
zero-copy forking; session UI; game mapping files keyed by ROM SHA1; CHR tile
read/write; nametable read/write; `record_mapping`; pause/step/resume under
the Lua watchdog. Detail in `docs/architecture/phase4-plan.md` and the
architecture docs. Phase 4.5 (extended thinking) was in progress and is
superseded: thinking is a dsh config setting.
