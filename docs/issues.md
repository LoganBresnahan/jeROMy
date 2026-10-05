# Issues

Known defects and rough edges, mostly found by real use. This is the
**inbox**, not the plan: `docs/roadmap.md` says what we are building and
`docs/plans/` says how. A finding graduates out of here the moment it earns a
checklist item, an ADR, or a carry-in pinned to the work that will hit it.

Newest first within each section. Delete an entry when it is fixed. The
commit is the record; a file of ticked boxes stops being read.

## Bridge

- **The Lua client sometimes never notices that a headless dsh run ended.**
  Reproduced twice on 2026-10-05 (trio runs 220244 and 221242): after the
  `read` run's last call the Lua log shows no `Disconnected` line at all,
  the next dsh listened for 50 s with no client, and only a Mesen restart
  brought it back. So `receive` on the dead socket kept returning
  `timeout` (the peer's close never surfaced on the Windows side), not a
  script crash. Fixes shipped the same night: a `{"heartbeat":true}` line
  every ~2 s from Lua, which fails on a dead socket and triggers a
  reconnect (`docs/bridge.md`), a file log readable from WSL
  (`scripts/lua-log.sh`), `pcall` guards on the frame callbacks, and
  `trio.sh` failing a check on tool errors and retrying once after
  `mesen-up.sh --restart`. The next full trio passed with no retry. Delete
  this entry after a week of trio runs with no `bridge never connected`
  line; if one appears, `scripts/lua-log.sh` now has the evidence.
- **A palette override is not visible in a screenshot taken after
  `pause_emulator` + `step_frame`; it shows after `resume_emulator`.** The
  2026-10-05 edit check (session `eaf1faaa`, again in `trio-20261004-221850`)
  had `write_palette` land (`get_palette` read it back) but the paused,
  stepped capture still showed the old color, and the agent burned 26
  steps reconciling that. Likely the override is applied in `endFrame`
  after the frame rendered and the stepped frame is captured before the
  next render, or `takeScreenshot` while paused returns the previous
  frame. Verify with `scripts/bridge-call.mjs` (write_palette, pause,
  step_frame ×2, screenshot) and fix in the Lua step path or document the
  two-step rule in the `palette-swap` skill. Found 2026-10-05.
- **`clear_palette_overrides` stops re-applying the override but does not
  restore the original color**; `get_palette` still reads the overridden
  value until the game rewrites that palette entry. Either the tool restores
  `old_color` on clear, or its description says it does not. Decide when
  porting the palette tools (roadmap item 4). Found 2026-10-05.

## Agent / tools

- **Headless runs carried the harness checkout's `AGENTS.md` into the
  agent.** dsh injects the cwd's agent instructions as a USER
  `<agent-instructions>` message; `trio.sh` ran `pnpm dsh` from
  `/home/oof/deepseek-harness`, so every headless turn opened with the
  harness's coding rulebook (thousands of tokens, wrong audience). Seen in
  the first `/replay` of session `0d64843e`, 2026-10-05; fixed the same day by
  running `bin.ts` from `~/.cache/jeromy/headless-cwd` (dsh walks up from
  the cwd, so a directory inside the jeROMy repo picked up our own
  `CLAUDE.md` instead; session `e64df8b5`). `/replay` lists the injected
  kinds under `inputs`; `agent-instructions` there means the cwd is wrong.
  If a `dsh-dev.sh` web session shows it, the workspace picker chose a repo
  with an `AGENTS.md`/`CLAUDE.md`.

- **Unpromoted discoveries die with the process.** `record_mapping` results
  live in memory on the Mesen service until `promote_mappings` writes them.
  A crash or restart between the two loses them; dsh's session log still
  has the tool results, so they are recoverable by hand. Fix: a
  `ctx.storageDomain` ledger keyed by ROM SHA1 (roadmap item 5 carry-in).
  Found 2026-10-05.
