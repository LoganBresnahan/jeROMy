# jeROMy

AI ROM-hacking agent for retro games: a person describes a change in plain
language, the agent inspects the running game in Mesen2 (screenshots, tiles,
palettes, nametables, memory), edits it live, verifies by looking, and records
what it learned about the ROM as a shareable mapping.

**`docs/DIRECTION.md` is the source of truth for product intent.** Read it
before product-level decisions; keep it updated when scope changes.

## Where we are (2026-10-06)

The dsh plugin is the only stack. `scripts/up.sh` boots the `jeromy`
profile with `src/dsh/index.ts` mounted from source: every core tool but
`extract_sprite` registered through one mapper, `promote_mappings`, the
full NES prompt section with live ROM/mapping/pause state, and the
emulator view on :9002.
Verified headless through dsh on `deepseek-flash` and by Logan's click
session in the sidebar. The v0.1 server, web UI, SQLCipher store and
Anthropic provider were deleted at roadmap item 8 (2026-10-05); dsh's
session log is the record (`/replay`). Items 12 (click correctness,
ADR-0010: two-phase bridge requests, scroll capture, scanline-accurate
`get_tile_at_pixel`), 13 (prompt hygiene), 9 (skills registered through
`ctx.skills`), 11 (`jeromy` agent preset, read-only sandbox default) and
10 (persistent edits, ADR-0009: ledgered ROM writes under `hacks/`,
`search_memory`/`trace_writes`, patch export, `persist-edit` skill) shipped
the same night, and item 7 (one installable package, ADR-0012, proven by
`scripts/install-check.sh`) the next morning. Every item in "Now" and
"Next" is done, carry-ins included (`reapply_edits`, save states inside an
exec callback, restoring `clear_palette_overrides`). Item 15 (ADR-0013)
came out of Logan's first click session afterwards: a standing scroll-write
ring in `bridge.lua` so no lookup or click ever steps the emulator,
`get_sprites`/`list_sprites` with a pattern-byte hit test so a click on
Mario names Mario, `chr_tile` and a screen-space box in the picker. Item 16
(ADR-0014, Logan's call the same afternoon) added region selection by
palette slot: four modes in the view, `read_region` + `src/agent/region.ts`,
the `get_region` tool, and every selection stating its two edit paths; item
17 (ADR-0015) made a click pause the game and queue in a per-mode history
with checkboxes, the checked clicks entering the person's next prompt
through `agent/pre-step`. Then Logan set the release gate (`docs/DIRECTION.md`:
SMB mapped end to end, a hack you can boot and iterate on; roadmap items 18
and 19, not started), asked for 60 fps (item 20: measured, default raised,
ADR-0007 closed) and the keep-alive fix (item 21, ADR-0016). The plan for the
gate is `docs/plans/mapping-campaign.md`; its first step, reference import
(ADR-0017: disassemblies imported into `hacks/`, never vendored or fetched;
`lookup_symbol`), shipped the same evening. The plain-language tour of ROM,
disassembly, mapping, hack and patch is `docs/guide/rom-hacking-with-jeromy.md`;
ADR-0018 (named hacks in the person's own repo, one active hack, boot-time apply) shipped as roadmap item 19 the same night: `HackStore.open` migrates the old single ledger into `default/`, `use_hack` swaps the emulator's bytes, exports are `<hack>-v<N>.bps`. Logan then set the direction that most games have no disassembly, so discovery must work blind (ADR-0019, roadmap item 22): `play_input` (a bounded button script from an `inputPolled` callback, the fourth thing that runs frames), `snapshot_memory`/`diff_memory` on the TypeScript side, the `find-variable` skill, and `scripts/score-mapping.mjs` to grade a blind SMB run against the imported reference. Proven 2026-10-06: a blind session found the lives counter at `$075A` in two diff rounds and the reference agreed; `scripts/trio.sh --blind variable` repeats it. Coverage for the gate is `eval/spec/smb.json` (one line per thing, with its status and the run that proved it). On 2026-10-09 Logan changed the process (ADR-0020, roadmap item 23): jeROMy is now built by an eval loop. `eval/README.md` is the operating manual, `eval/spec/attributes.md` the draft of what "mapped" means; runs are recorded under `eval/runs/`; Claude runs it unattended, commits when verified, spends the balance, judges picture claims from images; a holdout game is never tuned against. Build order: `docs/roadmap.md`;
the overnight log: `docs/plans/overnight-2026-10-05.md`.

## Stack

- **Keep:** `mesen/bridge.lua` (Lua in Mesen2, JSON over TCP, the only part
  on Windows), `src/bridge/mesen/*` (connection, protocol, adapter),
  `src/agent/tools.ts` (the core tools), `src/agent/prompts.ts`, `src/mappings/*`
  and `mappings/*.json`, `src/agent/disassembler.ts` (Capstone WASM),
  `src/agent/nes-palette.ts`. These move under `src/core/` (ADR-0005).
- **Target (shipping):** `src/dsh/` plugin: Mesen service, core tools
  through one mapper, prompt section, skills registration, loopback
  emulator-view page (ADR-0004); the root `cordis.patch.yml` bundle patch;
  one npm package `jeromy-dsh` that is plugin and bundle (ADR-0012).
  TypeScript ESM, Node 22+, pnpm inside dsh, npm here.
- Runs in WSL2; Mesen2 runs on Windows; TCP on localhost between them.

## Non-negotiable rules

- **The Lua watchdog is 1 second.** Blocking receives inside `codeBreak`
  stay under it: `POLL_TIMEOUT × POLL_ROUNDS` in `mesen/bridge.lua` is
  600 ms and does not grow. Anything slower belongs on the TypeScript side.
- **No `@deepseek-ai/*` import outside `src/dsh/`** (ADR-0005). Core talks
  to the `EmulatorAdapter` interface, never to a host and never to Mesen
  directly.
- **No provider adapters in this repo** (ADR-0002). Model access is dsh's.
- **Model-visible means logged** (ADR-0003). Anything that reaches the model
  request (tool results, pixel-picker clicks, mapping context) is a session
  event or an `agent.inject()`; no side channels.
- **Never write CHR ROM or PRG ROM without a recorded instruction from the
  person.** RAM edits are the default; a persistent edit is explicit in the
  tool call and ledgered; the active hack's ledger is the one recorded
  instruction the plugin may replay on its own, and it announces it
  (ADR-0018).
- **Never ship or fetch ROMs.** Users bring their own.
- **The paused keep-alive never steps the CPU** (ADR-0016): `keepalive()` in
  `mesen/bridge.lua` steps one PPU dot; a CPU step lets a paused game creep
  into its NMI.
- **No lookup, pick or read-only tool advances the emulator** (ADR-0013).
  Scroll comes from the standing ring in `bridge.lua`; only `step_frame`,
  `play_input` (ADR-0019: at most 600 frames a call, pause restored),
  `reset_emulator`, save states and the view's Step button run frames, and
  each says so in its result.
- **Discovery works blind** (ADR-0019). A mapping skill never requires a
  reference; `lookup_symbol` names or disputes what a session found, after
  the fact. Calibration sessions on SMB hold it back until the proof step.
- **Mapping files are the artifact.** Keyed by ROM SHA1 in `mappings/`;
  discoveries promote there from session events, never the other way round.
  Per-user state lives in `hacks/sha1-<sha1>/` (edit ledger, unpromoted
  discoveries, exports; gitignored, ADR-0009); every PRG/CHR ROM write is
  ledgered there with its old bytes, so it can be undone and exported.

## Conventions

- Documentation lives in `docs/`. `docs/roadmap.md` tracks build order
  (frontier = first unchecked item); check items off as they ship; deferred
  sub-tasks are carry-ins on an item, never a `TODO` in code. Findings from
  real use go in `docs/issues.md`, never left in chat; entries are deleted
  when fixed, never ticked.
- **Every decision gets an ADR** in `docs/adr/NNNN-slug.md` (Context /
  Decision / Consequences / Alternatives / Revisit triggers). New dependency,
  changed contract or algorithm, pattern adopted or rejected: that is a
  decision. Implementation detail is not. Supersede rather than rewrite.
  Build plans derived from ADRs live in `docs/plans/`.
- **`ADR-NNNN` is the link between `docs/` and everything else.** Write it
  in that exact form in code comments, commit subjects, test names and plan
  docs; `grep -rn "ADR-0005" src/` and `git log --grep 'ADR-0005'` only work
  if it is uniform. A SHA is fine as provenance, never as an index.
- **Comments state what the code can't show, and cite the decision.** A
  comment earns its place only if it carries an **invariant** and its
  `(ADR-NNNN)`, the **trap** (what silently breaks if this changes), a
  **sanctioned exception** to a house rule, or **fixture provenance** (who
  hand-checked this expected output, from which ROM, when). Write invariants
  as prohibitions at the point of temptation, one sentence plus the citation.
  No narration of the next line, no change-log prose, no section banners,
  no bare `TODO`.
- Test pyramid: **vitest** units co-located as `*.test.ts` (tools against a
  mocked adapter, protocol framing, mapping loader, prompt assembly); a
  **live Mesen session** after every substantive change (`/verify`), which
  is this project's deploy. Behavior mapping over coverage percentages: every
  tool has a test naming it. Golden fixtures (tile bytes, palette tables,
  nametable dumps) name the ROM and who hand-checked them.
- Commit only when asked. Finish, verify, report, and leave the diff in the
  tree for review.

## Skills & workflows

- `/up` — bring the loop up from WSL in one move (`scripts/up.sh`): dsh
  profile `jeromy` from source, Mesen2 with ROM + `bridge.lua`, bridge
  connected, URLs printed. `--down` stops dsh. Run before anything that
  touches the emulator.
- `/orient` — session-start bearing: commits + roadmap + docs reconciled
  against memory, drift flagged. Read-only.
- `/shipshape` — pre-commit verification: tests green twice + typecheck,
  docs current, conventions hold (ADR citations, no escaped TODOs, tool↔test
  parity, adapter methods only where TypeScript calls a handler, watchdog
  budget, dsh import boundary).
  Proposes fixes, doesn't apply them.
- `/verify` — runtime check against a live Mesen2: `scripts/up.sh` then
  `scripts/trio.sh` (look, read, edit, click, region, hacks, persist, play headless through dsh) plus the human
  pixel-picker check in the sidebar. A green `/shipshape` does not
  discharge it.
- `/replay` — read what the DeepSeek agent did in a dsh session
  (reasoning, tool calls, results, screenshots, cost) from dsh's own log
  via `scripts/dsh-log.mjs` (ADR-0011). Run after every trio, web session
  or loop iteration; judge the tool trace and the images, not the final
  text.
- **The eval loop** (ADR-0020) — `eval/README.md`: pick lines from
  `eval/spec/<game>.json`, `scripts/eval-run.sh` (config, blind
  `trio.sh --task`, grade), judge (`score-mapping.mjs` for what the reference answers,
  Claude from the saved images for pictures), `report.md` with the
  distribution, one change, verify, commit, push; holdout at milestones.
- `adr-plan` workflow (`.claude/workflows/adr-plan.js`) — decompose an
  accepted ADR into an effort-ranked, dependency-ordered build checklist
  before implementing it. Output goes to `docs/plans/adr-NNNN-<topic>-build-plan.md`.

## Commands

- `npm test` — vitest, all suites once (run twice for the ship bar)
- `npm run test:watch` — watch mode
- `npx tsc --noEmit` — typecheck (test files are excluded from the build)
- `npm run build` — tsc to `dist/`
- `cd capstone && ./build.sh` — rebuild the Capstone WASM (needs emsdk; the
  built artifacts are gitignored and already present locally)
- `scripts/mesen-up.sh [rom]` — launch or re-point Mesen2 on Windows from
  WSL with the ROM and `mesen/bridge.lua` (single-instance handoff; default
  ROM is SMB (World) in `C:\Users\tarsier\Documents`)
- `scripts/up.sh [rom]` / `scripts/up.sh --down` — the one-move bring-up
  (dsh + Mesen + bridge wait); `scripts/trio.sh [look|read|edit|click|region|hacks|persist|play]`
  or `scripts/trio.sh [--blind] --task "<instruction>" [min-calls]` — the headless
  checks, raw-result criteria per check, streams saved under `.chat-out/`;
  `--blind` sets `JEROMY_BLIND=1` for the headless dsh only (ADR-0019
  calibration: no reference leads, `lookup_symbol` held back)
- `scripts/wiki-table-to-tsv.mjs <in.txt> <out.tsv>` — a RAM/ROM map copied
  from a wiki's text rendering (aligned columns, continuation lines,
  `addr -> target` pointer rows) into the TSV `import-reference.mjs` reads;
  prints every dropped line for checking (first used for Zelda, 2026-10-09)
- `scripts/score-mapping.mjs <sha1> [--spec eval/spec/<game>.json] [--stream <run.jsonl>] [--discoveries] [--no-mapping] [--json]`
  — grade claims (addresses, PRG origins, level ranges, routine entries)
  against the imported reference; with `--spec` each claim is assigned to a
  spec line and graded against that line's symbols (ADR-0020 §3).
  Falsified by `scripts/score-mapping.test.mjs` + `eval/spec/falsify/`
- `scripts/eval-run.sh --spec <spec> --slug <s> --lines <ids> --task "<t>" [...]`
  — one eval run: `config.md` first, `up.sh` on the spec's ROM, each task
  blind through `trio.sh` under a cost cap (default $1; a turn ending on a
  provider error is resumed once, `TRIO_SESSION_ID`), streams, images and
  transcripts into `eval/runs/<id>/`, then `scripts/eval-grade.mjs <run>`
  (grades.md with proof held, distribution.md); Claude judges and writes
  `report.md`
- `scripts/dsh-dev.sh` — boot the `jeromy` dsh profile with the plugin
  mounted from `src/dsh/index.ts` (web UI on :3080, bridge on :9001). Runs
  `scripts/link-dsh.sh` first, which symlinks the harness checkout's
  packages into `node_modules/@deepseek-ai` (dev only, not committed).
- Emulator view (ADR-0004): while `scripts/dsh-dev.sh` runs, open the
  right-sidebar **Browser** in dsh and enter `http://127.0.0.1:9002/`
  (live screenshot, pixel picker with four selection modes,
  pause/step/resume). A click pauses the game and queues a
  `[emulator view] The user clicked pixel ...` line in the click history;
  the checked lines go with the next prompt (ADR-0015).
  `curl http://127.0.0.1:9002/status` checks it headlessly.
- `scripts/dsh-log.mjs list | show <id|latest> | tail latest --follow |
  stats <id> | events <id> --type T` — read dsh's persisted session logs
  (`~/.dsh/sessions/*/session-*/session.v4.jsonl.zstd`; images under
  `~/.dsh/attachments/v1/objects/`). `<id>` is any unique prefix. See `/replay`.
- `scripts/bridge-call.mjs <method> [json]` — call one Lua handler directly
  (no dsh, no model): `get_lua_logs`, `debug_state`, `ping`, or any tool
  handler. Needs port 9001 free (`scripts/up.sh --down` first, `up.sh` after).
- `scripts/lua-log.sh [-f] [N]` — tail `bridge.lua`'s file log
  (`Mesen2/LuaScriptData/bridge/jeromy-bridge.log` on the Windows side); the
  place a Lua callback error shows up from WSL.
- `scripts/mesen-up.sh --restart` — kill and relaunch Mesen so a changed
  `bridge.lua` loads. The single-instance handoff swaps the ROM but keeps
  the running script, so every Lua change needs this.
- `scripts/install-check.sh [--keep]` — roadmap item 7 proof: build, fresh
  profile from the web template, `dsh plugin --profile jeromy-pkg add
  <repo>`, boot, view `/status` and `/pick`, one headless look through the
  installed bundle patch, profile removed. Needs the dev dsh down.
- `cordis.patch.yml` (repo root) is the bundle patch and the single source
  of the composition (ADR-0012); `scripts/dsh-dev.sh` derives the dev
  overlay from it. Edit the root file, never `.dsh-dev/cordis.yml`.
- `scripts/budget.sh [floor]` — DeepSeek balance in USD; non-zero exit
  below the floor or when the account is unavailable. Check between items
  in an unattended run (`docs/plans/overnight-2026-10-05.md`).
- Headless turn through dsh (the scripted check):
  `cd /home/oof/deepseek-harness && pnpm dsh --profile headless --patch /home/oof/jeROMy/.dsh-dev/cordis.yml --json "<task>"`.
  Only one dsh process can own port 9001 at a time; stop the web one first.
- dsh source checkout: `/home/oof/deepseek-harness` (pnpm workspace,
  `dsh-v0.2.1-alpha.1`). Profiles: `~/.dsh/profiles/{web,jeromy}`.
