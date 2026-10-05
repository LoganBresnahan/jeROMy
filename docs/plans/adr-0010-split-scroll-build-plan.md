# ADR-0010 build plan: pixel lookups on split-scroll frames

Produced by the `adr-plan` workflow on 2026-10-05 (13 slices, 15 agents),
edited by Claude the same night to reflect the tree. Source of truth for
intent is `docs/adr/0010-split-scroll-pixel-lookup.md`; this is the
checklist. Roadmap item 12 tracks it.

## Phases

### 0. Landed (commit `21bacc7`, 2026-10-05)

`nearest-nes-color`, `lua-get-pixel-color`, `get-pixel-color-tool`,
`picker-context-pixel-color`, `picker-caveat-interim`. `get_pixel_color`
exists end to end; the picker's context line ends with the rendered color
and says whether it is one of the readout's palette entries;
`get_tile_at_pixel`'s description carries the caveat; `identify-click`
step 3 verifies against the color. Verified live (session `99da5d7b`).

Residual noted by the assessors, deliberately not done: `nearestNesColor`
returns a bare index. Mesen's configured palette does not byte-match our
table (it rendered `$36` as 254,204,197 against our 244,196,188), which is
why the lookup is nearest rather than exact; add a `distance` to the tool
text only if a real click is ever mis-mapped.

### 1. Two-phase dispatcher (`bridge-two-phase-pending`) — Fable, verify — DONE 2026-10-05

Shipped as designed plus two things the live check forced: a request parked
during an `endFrame` poll starts counting on the next frame (first run
reported 29 of 30), and `codeBreak` now reconnects while paused with a
throttled keep-alive step, because a drop detected inside the paused poll
used to leave Mesen paused with no callback ever firing. Verified with
`scripts/bridge-call.mjs`: `wait_frames 30` → waited 30; refused while
paused; reconnect while paused; cancel logged on a mid-wait disconnect;
full trio green afterwards.

A handler may return `{ pending = { frames = N, complete = fn, cancel = fn } }`.
The Lua loop stores it by request id; each `endFrame` decrements `frames`
and, at zero, sends `complete()`'s result under the original id. Lifecycle
rules the assessors called out as the plausible-but-wrong traps:

- **Pending while paused never ticks.** `endFrame` does not fire when
  paused, so a pending request issued while paused would outlive the
  TypeScript timeout with its callbacks still installed. The dispatcher
  therefore refuses to park a request while `is_paused` unless the handler
  says it will step (phase 3 does), and the TS side passes a per-request
  timeout so a parked request is not bound by the 15 s default.
- **Cap and disconnect run `cancel()`.** A pending entry that expires, or
  a connection drop, calls the handler's `cancel` so memory callbacks are
  removed; nothing is ever sent to a dead socket from `endFrame` outside
  `drop_connection`.
- **Never from `codeBreak`.** `poll_connection` is also called inside the
  paused blocking poll; pending completion runs only from `endFrame` so it
  cannot eat the 600 ms budget.
- Ships with a trivial pending handler, `wait_frames {n}`, so the live
  check can exercise the path without the capture; `MesenConnection.request`
  gains an options arg with `timeoutMs`; `docs/bridge.md` documents the
  pending phase in the same commit.

Verify: trio green (no regression across the synchronous tools);
`wait_frames` answers while running with the frame count it waited;
errors immediately while paused; after a forced disconnect mid-wait the
Lua log shows the cancel and no stray send.

### 2. Capture and reconstruction (`lua-scroll-write-capture`, `scanline-scroll-reconstruction`) — Fable, verify — DONE 2026-10-05

Shipped with two findings that changed the design: Mesen invokes write
hooks *before* the write lands (and lets the return value override it), so
the capture records the pre-write loopy state and the TypeScript side
applies each write itself; and `emu.getState()` exposes `ppu.tmpVideoRamAddr`,
`ppu.videoRamAddr`, `ppu.xScroll`, `ppu.writeToggle`, `ppu.scanline`,
`ppu.cycle`, which lets a unit test check our loopy arithmetic against
Mesen's own next-write state (it matches on the fixture). Reconstruction is
TypeScript (`src/agent/scroll-reconstruct.ts`), pure, with the SMB title
fixtures (`src/agent/fixtures/`) and hand-written lists for mid-frame $2006,
mid-frame $2005 Y, a late $2006 load, and ambiguity. SMB toggles NMI through
$2000 mid-frame without touching the nametable bits; only a changed select
counts as an update.

Capture first, behind a debug handler `capture_scroll_writes` that returns
the raw list of `(scanline, dot, register, value)` through the pending
path: `emu.addMemoryCallback` on CPU writes `$2000-$3FFF` (mirrors), filter
by `addr & 7`, record `ppu.scanline`/`ppu.cycle` from `emu.getState()` at
the callback, remove the hooks in `complete`/`cancel`. Install tears down
any prior set defensively. The /verify pass on SMB running records the
World 1-1 write list as a fixture in the repo (ROM, checker, date): expect
the NMI `$2005` pair at scanline 241+ and the sprite-0 `$2005` pair
mid-frame.

Reconstruction is a pure function (TypeScript or Lua; the assessors lean
Lua so the handler answers without a round trip, but a TypeScript fold
over the returned list is testable in vitest and is the choice here unless
latency says otherwise) implementing the loopy registers honestly:

- `$2005` first write sets fine X and coarse X in `t`; second write sets
  coarse Y and fine Y in `t`. **Only the horizontal bits copy from `t` to
  `v` at dot 257 of every visible scanline; the vertical bits copy only
  during the pre-render scanline.** So a mid-frame `$2005` pair changes X
  from the next scanline and Y not until the next frame.
- `$2006` second write loads `v` immediately: coarse X, coarse Y, nametable
  and fine Y come from the address; fine X still comes from the `$2005`
  first-write register. A `$2006` split gives "address at scanline N+1",
  which must be converted before reusing the `abs_y = tile_y + scroll_y/8`
  math.
- `$2000` bits 0-1 set the nametable select in `t`.
- The `w` latch is shared and reset by `$2002` reads, which the capture
  does not see; pair writes by order but tolerate a stray single write
  (report `scroll_ambiguous`, phase 4).
- Writes in vblank (scanline 241+) and pre-render govern the top of the
  next frame; a write at visible scanline N applies from N+1 (horizontal).

Unit fixtures: the recorded SMB list, plus hand-written lists for a
mid-frame `$2006` pair, a mid-frame `$2005` Y-only change (must not apply
this frame), and a stray single write.

### 3. Precise lookup, running and paused (`get-tile-at-pixel-precise`, `paused-capture-steps-frame`) — Fable, verify — DONE 2026-10-05

`src/agent/tile-lookup.ts` is the one path for the tool and the picker:
capture → reconstruct at the pixel's scanline → `tileAddressAt` (fine scroll
added before dividing; nametable from the reconstructed bits; the row comes
straight from v's vertical position) → two `ppuDebug` reads. `precise:
false` and a refused capture fall back to the request-time Lua answer
labelled `scroll_source: "legacy"` with a note. Paused is handled inside the
capture handler: it bumps `pending_steps` by two and parks with
`allow_paused`; the second stepped frame is the complete one. Verified via
the pick route running (`scroll_source: scanline`, `scroll_scanline: 31`)
and paused (`stepped_frames: 2`, still paused after).

`get_tile_at_pixel` gains `precise` (default true): install the capture,
wait one frame, answer with the scroll in effect at the clicked scanline.
Non-negotiables: tile column is `floor((x + scroll_x) / 8)` (the current
`tile_x + floor(scroll_x/8)` is off by one when `x%8 + scroll_x%8 >= 8`);
nametable select from the reconstructed `$2000` bits, not only the overflow
heuristic; response carries `scroll_source: "scanline" | "vblank"` and the
scanline used; the `vblank` fallback never silently reuses `emu.getState()`
without saying so.

Paused: a single frame step from a mid-frame break runs only the rest of
the current frame and misses the writes above the break point. Step two
frames with the callbacks live across both, answer from the second
`endFrame`, keep `is_paused` true, re-set `step_active` before each step,
and report `stepped_frames: 2`. The pending response must leave from
`endFrame` before the TS timeout.

Verify on SMB: a pipe-rim click running and paused both return
`scroll_source: "scanline"`, non-zero scroll, the pipe tile, palette 0;
`stepped_frames` only on the paused run; pause state unchanged after.

### 4. Guard, skills, closing check (`raster-ambiguity-guard`, `skills-verify-against-pixel-color`, `smb-split-scroll-live-check`) — Opus — DONE 2026-10-05

`scroll_ambiguous` counts distinct visible scanlines with a completed update
(a `$2005` pair plus a `$2000` nametable switch on one line is one split;
the first live run flagged exactly that false positive). `identify-click`
reads `scroll_source`; `palette-swap` compares against `get_pixel_color`;
the picker treats the shared backdrop as consistent with any background
palette. `scripts/trio.sh click` parses the raw `get_tile_at_pixel`,
`get_pixel_color` and `get_palette` results: scanline source, pixel color
in the palette or the backdrop. No save-state setup: SMB's status-bar split
exists on the title screen too, and the attract demo scrolls on its own.

- Ambiguity guard: count completed scroll updates per scanline region
  (write pairs), never raw writes, or every SMB click flags; surface
  `scroll_ambiguous` and a count in the tool text.
- Skills: `identify-click` step 2 reads `scroll_source`/`scroll_scanline`
  instead of "zero scroll is the warning sign"; `palette-swap` step 1 gains
  the compare step; state the honest false positives (a sprite over the
  clicked background pixel yields a sprite-palette color; slot 0 is shared
  across the four background palettes, so "color in palette" does not prove
  the readout right). Delete the interim caveat string and its assertion.
- Live check: a `click` check in `trio.sh` whose pass criteria parse the
  raw `tool_result` JSON (`scroll_source == "scanline"`, non-zero scroll,
  palette 0, nearest `$29`), on a reproducible game state past the first
  pipe (a save state slot), running and paused. Then delete the
  `docs/issues.md` split-scroll entry, tick item 12, and record
  steps-to-answer against the dozen-step baseline.

## Critical path

`bridge-two-phase-pending` → `lua-scroll-write-capture` →
`scanline-scroll-reconstruction` → `get-tile-at-pixel-precise` →
`paused-capture-steps-frame` → `smb-split-scroll-live-check`.

## Notes from the assessors

Phases 1-3 are one Fable block, three commits, three live checks, each
feeding the next (phase 1 proves the pending path; phase 2's verify records
the fixture phase 3 is tested against). Adversarial verify is warranted for
every Fable slice: the failure mode in each is an implementation that
passes the SMB fixture and is wrong on the next game. Phase 4 is Opus
grade; a wrong guard produces a spurious caveat, not a wrong tile.
