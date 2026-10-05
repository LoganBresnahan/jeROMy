# jeROMy roadmap

Frontier = first unchecked item under **Now**. Check items off as they ship;
pin deferred sub-tasks to items as carry-ins. Findings from real use live in
`docs/issues.md` and are pinned here only when they block a slice or change
build order. Plan: `docs/plans/dsh-migration.md`. Decisions: `docs/adr/`.

## Now

- [ ] **0. Model check.** Run the current stack against DeepSeek's
      Anthropic-compatible endpoint (`ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic`,
      `DEEPSEEK_API_KEY` is already in the environment). Judge four things on
      a real ROM: screenshot understanding, reading ASCII tile dumps, a
      palette edit end to end, tool-call reliability over a multi-step turn.
      Record cost per turn. If V4.1-Flash fails here, stop and rethink
      ADR-0002 before anything below.
- [ ] **1. Scaffold the plugin.** Install dsh (pin the version), create
      profile `jeromy`, mount a hello plugin from this repo via `--patch`,
      confirm it loads in the web UI. Decide the package name
      (`dsh-jeromy`). ADR-0001.
- [ ] **2. Extract `src/core/`.** Move bridge, adapter, protocol, tool specs,
      prompt text, mapping loader, disassembler and palette table under
      `src/core/` with zero dsh imports. Tests move with them. ADR-0005.
- [ ] **3. Mesen service + screenshot tool.** `ctx.mesen` service wrapping
      connection+adapter; port `screenshot` to `defineTool` returning an
      image through `ctx.attachments`. This proves the image path on
      `deepseek-flash` through dsh. Carry-in: if images inside tool results
      fail on the OpenAI-compatible route, fall back to `agent.inject()` of a
      user-turn image and record the finding in ADR-0002.
- [ ] **4. Port the remaining tools** in groups: palette, memory, CHR tile,
      nametable/sprite, emulator control, mapping, disassembly. Tool↔test
      parity holds after each group (`/shipshape`).
- [ ] **5. Prompt section + mappings + session events.** NES hardware
      reference, emulator status and the loaded ROM's mapping as a system
      prompt section. Palette/tile/memory writes and `record_mapping` as
      `SessionEventMap` entries. Promote-to-file for mappings. ADR-0003.
- [ ] **6. Emulator view page.** Loopback page served by the plugin: live
      screenshot, zoom, pixel picker, pause/step/resume. Opened in dsh's
      sidebar browser. Clicks POST to the plugin, which injects the pixel
      result into the agent. ADR-0004.
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

## Shipped (pre-rethink, 2026-02 to 2026-03)

Phases 1 through 4 of the original plan: TCP bridge + Mesen Lua client; agent
tool loop on Claude with 13 then 24 tools; SQLCipher event store with
zero-copy forking; session UI; game mapping files keyed by ROM SHA1; CHR tile
read/write; nametable read/write; `record_mapping`; pause/step/resume under
the Lua watchdog. Detail in `docs/architecture/phase4-plan.md` and the
architecture docs. Phase 4.5 (extended thinking) was in progress and is
superseded: thinking is a dsh config setting.
