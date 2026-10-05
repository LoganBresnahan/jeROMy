# jeROMy

AI ROM-hacking agent for retro games: a person describes a change in plain
language, the agent inspects the running game in Mesen2 (screenshots, tiles,
palettes, nametables, memory), edits it live, verifies by looking, and records
what it learned about the ROM as a shareable mapping.

**`docs/DIRECTION.md` is the source of truth for product intent.** Read it
before product-level decisions; keep it updated when scope changes.

## Where we are (2026-10-05)

Mid-rethink. jeROMy is becoming a **DeepSeek Harness (dsh) plugin**
(ADR-0001) on `deepseek-flash` (ADR-0002). The v0.1 standalone stack in
`src/` (own web UI, SQLCipher store, Anthropic adapter, Node server) still
runs and is the thing roadmap item 0 tests against; it is deleted at roadmap
item 8. Plan: `docs/plans/dsh-migration.md`. Build order: `docs/roadmap.md`.

## Stack

- **Keep:** `mesen/bridge.lua` (Lua in Mesen2, JSON over TCP, the only part
  on Windows), `src/bridge/mesen/*` (connection, protocol, adapter),
  `src/agent/tools.ts` (24 tools), `src/agent/prompts.ts`, `src/mappings/*`
  and `mappings/*.json`, `src/agent/disassembler.ts` (Capstone WASM),
  `src/agent/nes-palette.ts`. These move under `src/core/` (ADR-0005).
- **Target:** `src/dsh/` plugin: Mesen service, `defineTool` mappings,
  prompt section, `SessionEventMap` events, loopback emulator-view page
  (ADR-0004), bundle patch + settings card. TypeScript ESM, Node 22+, pnpm
  inside dsh, npm here until the package is restructured.
- **Delete at item 8:** `src/web`, `src/db`, `src/server`, `src/index.ts`,
  `src/agent/agent.ts`, `src/agent/providers`, `src/agent/provider.ts`.
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
- **Never write CHR ROM or PRG ROM silently.** RAM edits are the default;
  persistent edits are explicit in the tool call and recorded as events.
- **Never ship or fetch ROMs.** Users bring their own.
- **Mapping files are the artifact.** Keyed by ROM SHA1 in `mappings/`;
  discoveries promote there from session events, never the other way round.

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

- `/orient` — session-start bearing: commits + roadmap + docs reconciled
  against memory, drift flagged. Read-only.
- `/shipshape` — pre-commit verification: tests green twice + typecheck,
  docs current, conventions hold (ADR citations, no escaped TODOs, tool↔test
  parity, Lua handler↔adapter parity, watchdog budget, dsh import boundary).
  Proposes fixes, doesn't apply them.
- `/verify` — runtime recipe against a live Mesen2: today through
  `npm run dev`, after roadmap item 1 through `dsh --profile jeromy`.
  A green `/shipshape` does not discharge it.
- `adr-plan` workflow (`.claude/workflows/adr-plan.js`) — decompose an
  accepted ADR into an effort-ranked, dependency-ordered build checklist
  before implementing it. Output goes to `docs/plans/adr-NNNN-<topic>-build-plan.md`.

## Commands

- `npm run dev` — build the v0.1 web UI and start the server (HTTP :3000,
  TCP :9001 for Mesen). Load `mesen/bridge.lua` in Mesen2's Script Window.
- `npm test` — vitest, all suites once (run twice for the ship bar)
- `npm run test:watch` — watch mode
- `npx tsc --noEmit` — typecheck (test files are excluded from the build)
- `npm run build` — tsc + esbuild web bundle to `dist/`
- `cd capstone && ./build.sh` — rebuild the Capstone WASM (needs emsdk; the
  built artifacts are gitignored and already present locally)
- Env: `DEEPSEEK_API_KEY` is set in the shell. For roadmap item 0:
  `ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic ANTHROPIC_API_KEY=$DEEPSEEK_API_KEY npm run dev`
