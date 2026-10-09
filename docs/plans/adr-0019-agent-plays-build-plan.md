# ADR-0019 build plan: the agent plays and maps blind

**Shipped 2026-10-06** (roadmap item 22): the blind proof ran as written,
session `b3d6d3a5`. Carry-ins live on the roadmap item, not here.

Produced by the `adr-plan` workflow on 2026-10-05 (12 slices, 14 agents,
7 minutes), run while the Lua handler, the protocol types, the snapshot
store and the doc edits were already in the working tree. Source of truth
for intent is `docs/adr/0019-the-agent-plays-and-maps-blind.md`; roadmap
item 22 tracks it. Critical path as ranked: bridge handler → watch
sampling → adapter → core tool → dsh registration and prompt →
`find-variable` skill → blind calibration → docs.

Findings that changed the build:

1. **Blind is a switch, not a sentence.** `diff_memory` attaches reference
   leads to every hit; a calibration task that merely says "do not call
   lookup_symbol" would still hand the model `NumberofLives` beside
   `$075A`. `JEROMY_BLIND=1` nulls the reference for every tool (ADR-0019
   amended), and the calibration check should fail if a `lookup_symbol`
   call precedes the first `write_memory` in the stream.
2. **RAM leads were noise.** `symbolHint`'s 0x400 nearest-label distance is
   tuned for code PCs; on RAM it labels every byte `Label+$N`. The SMB
   reference also cannot tell constants from addresses (`$0001` carries
   `DeathMusic`, `GameModeValue`, `Right_Dir`, three more). RAM leads are
   now exact equates only, all names listed, with a sentence saying so.
3. **Validate `watch` and `port` in the handler.** A bad watch entry would
   otherwise throw inside the guarded `endFrame` callback every frame and
   return partial samples silently. Both are range-checked at the call.
4. **The adapter timeout.** A 600-frame run would have hit the connection's
   10 s default while Lua kept playing and refused the next call as
   "already running". The adapter sizes the timeout from the summed frames,
   as `traceWrites` does.

5. **Verify a Lua API against the build, not the docs.** The online
   reference gives `emu.setInput(port, input)`; this build takes the table
   first. The first live run pressed nothing, logged one error per polled
   frame (5,187 lines in the file log), and the flood crashed Mesen's
   Script Window renderer (an AvaloniaEdit exception in its log pane).
   Three fixes: the argument order; the handler probes `setInput` once at
   request time so a refused call fails the request with its message; and
   `guarded` logs a callback's first error in full and then one line per
   300, so no per-frame callback can flood the window again. The `play`
   check now resets to the title, holds Start and asserts SMB's game-mode
   byte (`$0770`, 0 title / 1 game) flipped, because a check that passes
   with no input is not a check. (`$06FC`, the saved pad, was tried first
   and is useless as a probe: the attract demo writes its own Right there
   and the title screen leaves it 0.)

6. **Promotion was dropping the source and the notes.** The first real
   promotion of an address wrote `player_lives_counter` and nothing else:
   `discoveryFromRecordResult` never copied `source` (so ADR-0017's
   attribution had never reached a file) and the loader's address case
   ignored `notes`, where the encoding lives. Both fixed and pinned by
   tests; the SMB entry was completed by hand from the session's record.

The reviewers' single adversarial-pass candidate was the pause state
machine in the handler (parked from `codeBreak` while paused, resumed
through `pending_resume`, completed from `endFrame`, `breakExecution`
re-armed with `is_paused`/`step_active`). That is discharged live, not on
paper: `trio.sh play` from a running game, then a run from a paused one
with the view's status checked after.

## Phases

### 1. Snapshot store and diff (TypeScript only) — DONE 2026-10-05

`src/agent/snapshots.ts`: `SnapshotStore` per adapter (WeakMap), chunked
`takeSnapshot` over `cpuDebug`, `diff` with the five filters, `from`
narrowing on the full survivor set, 64-hit cap with the count; the
`snapshot_memory` and `diff_memory` tools; tests in `snapshots.test.ts`
and `tools.test.ts`. Bytes never leave the store.

### 2. The bridge handler — DONE 2026-10-05, live-checked

`handlers.play_input` in `mesen/bridge.lua`: standing `inputPolled`
callback applying the current segment with every button explicit,
`play_tick` from `endFrame` ahead of `tick_pending` so both reach the total
on the same frame, two-phase completion with `allow_paused`, the paused
game resumed for the run and broken again on completion, watch sampling
thinned to 60 per address. Live: 60 frames, 60 samples of `$09` counting
149 to 208, pad back to the person after.

### 3. Adapter, core tool, registration, prompt — DONE 2026-10-05

`playInput` with a frames-sized timeout; the `play_input` tool with
`watch` leads and the pause sentence; `mesen-service` reads `paused` from
its result; prompt section gains the tool and a "Finding Variables Without
a Reference" paragraph; `trio.sh play` as the standing check (frames_run,
per-frame samples, a 2048-byte diff with at least one change).

### 4. Calibration: blind session, skill, score — DONE 2026-10-06

`scripts/score-mapping.mjs` (agrees / disagrees / unknown against
`reference.json`; first run: the one existing discovery, player screen X
at `$03AD`, agrees with `Player_Rel_XPos`). A blind headless session on
SMB found the lives counter (`$075A`, 29 then 3 survivors, proven by a
write and the card reading "x 4"; session `b3d6d3a5`); the reference
agrees. `skills/find-variable/SKILL.md` is written from that trace
(ADR-0008); `trio.sh --blind variable` is the standing calibration check
(two diff rounds, one narrowed with `from`, an address recorded with the
differential-search source; the address scored separately).

### 5. Docs close — DONE 2026-10-06

CLAUDE.md rules and counts, README section, DIRECTION principle,
mapping-campaign sheet 3, roadmap item 22 ticked with carry-ins.

## Carry-ins (on roadmap item 22)

- Conditional segments (`until: {address, equals}`) and runs longer than
  600 frames as one call (ADR-0019 revisit trigger).
- Recording the person's own play as a `play_input` script.
- Hand-checked fixtures for `score-mapping.mjs`'s classifier (a constant
  collision, an array slot, an unknown) once arrays appear in the mapping.
- A `mesen-service` unit test for the pause regex against `play_input`'s
  `was_paused`/`paused` pair.
