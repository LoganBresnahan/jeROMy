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

- **A paused game is not frozen: the keep-alive creeps through
  instructions.** Each `codeBreak` round that finds nothing to do ends with
  `emu.step(1, step)` so the callback fires again, which advances the CPU
  by one instruction every poll cycle (about one or two a second). Over a
  minute's pause SMB's CPU walks into its NMI, where it writes `$2001` with
  rendering off, and anything that reads the live PPU mask then says
  "nothing is drawn" (session `d8b747b1`, 2026-10-05: `get_region` a
  minute after the click). Fixed for the mask by sealing it with the ring's
  frame (`frame_mask` in `bridge.lua`) and, the same day, for the creep
  itself by stepping one PPU dot instead of a CPU instruction (ADR-0016:
  195 dots and two PC bytes per idle minute, against a hundred-plus
  instructions). Residual: after about two minutes of idle pause the dot
  steps reach the NMI line and the CPU walks through SMB's NMI at a cycle
  a second; a tool that needs byte-exact RAM after a long pause should
  snapshot RAM at the first `codeBreak` (ADR-0016 revisit trigger). Delete
  this entry when that snapshot exists or when a week of sessions shows no
  one noticing.

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
- **A web dsh restarted by `trio.sh` came up without the plugin's ports.**
  Once on 2026-10-05 (after `trio.sh click` followed within a minute by
  `trio.sh --task`): the restarted instance listened on :3080 but neither
  :9001 nor :9002 was bound, the Lua client logged no `Connected` after
  the headless run's disconnect, and `.dsh-dev/dsh.log` had been
  overwritten by the second restart and held only the boot banner, so the
  cause (a plugin import failure, or an `EADDRINUSE` on :9001 while the
  headless process was still letting go) is unknown. `scripts/up.sh --down
  && scripts/up.sh` fixed it. `trio.sh` now waits for the view's `/status`
  after its restart and prints a warning when it does not come back, so
  the next occurrence is seen immediately; if it recurs, keep that
  instance's log before restarting. Second data point the same afternoon:
  the 45 s wait warned after `trio.sh --task`, but two minutes later all
  three ports were bound, the log showed the bridge server listening and
  the Lua client connected 9 s after the headless run's disconnect, and
  `/status` answered in 10 ms; so that one was a slow cold boot, not a
  missing plugin. The wait is now 120 s with 3 s per probe. The first
  incident (no :9001 minutes later) stays unexplained.

## Agent / tools

- **A plugin row that names a package *directory* fails with "failed to
  import".** dsh's loader imports an absolute `name:` as a file URL, and
  Node cannot import a directory; mount by package name (`jeromy-dsh`) or
  by the entry file (`.../dist/dsh/index.js`, `src/dsh/index.ts`). Found
  2026-10-05 while writing `scripts/install-check.sh`; the same message
  appeared once on a first web boot right after `dsh plugin add` and could
  not be reproduced on later fresh installs. If it returns, the startup
  diagnostics under `~/.dsh/logs/` have the cause.
