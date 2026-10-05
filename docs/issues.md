# Issues

Known defects and rough edges, mostly found by real use. This is the
**inbox**, not the plan: `docs/roadmap.md` says what we are building and
`docs/plans/` says how. A finding graduates out of here the moment it earns a
checklist item, an ADR, or a carry-in pinned to the work that will hit it.

Newest first within each section. Delete an entry when it is fixed. The
commit is the record; a file of ticked boxes stops being read.

## Bridge

- **Watchdog trip inside the request decoder while paused.** Twice on
  2026-10-05 (sessions `f02bae50`, `e0899303`), after `pause_emulator` and a
  run of back-to-back `get_pixel_color` calls, the Lua log shows "JSON parse
  error: Maximum execution time (1 seconds) exceeded"; the request was
  answered under id `error`, so the tool timed out after 15 s. Not
  reproduced by scripted bursts (spaced, parallel, sequential, with
  screenshots) through `scratchpad/paused-burst.mjs`. Mitigations shipped
  the same night: line-mode receive (per-request latency while paused
  200 ms → ~1 ms, so far less time is spent inside each callback), a 0.6 s
  wall-clock guard per `codeBreak` callback, and the request id recovered on
  decode failure so a trip is an immediate error, not a timeout. If
  "Maximum execution time" shows up in `scripts/lua-log.sh` again, the
  working theory is that keep-alive `emu.step` calls nest `codeBreak`
  callbacks inside the same watchdog window; the fix would be to let the
  callback return without stepping when nothing is pending and rely on a
  periodic step from the TypeScript side.

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
## Agent / tools

- **A plugin row that names a package *directory* fails with "failed to
  import".** dsh's loader imports an absolute `name:` as a file URL, and
  Node cannot import a directory; mount by package name (`jeromy-dsh`) or
  by the entry file (`.../dist/dsh/index.js`, `src/dsh/index.ts`). Found
  2026-10-05 while writing `scripts/install-check.sh`; the same message
  appeared once on a first web boot right after `dsh plugin add` and could
  not be reproduced on later fresh installs. If it returns, the startup
  diagnostics under `~/.dsh/logs/` have the cause.
