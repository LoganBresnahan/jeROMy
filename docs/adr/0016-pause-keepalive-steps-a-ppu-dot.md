# ADR-0016: The paused keep-alive steps one PPU dot, never a CPU instruction

**Status:** Accepted (2026-10-05, from the `get_region` failure in session `d8b747b1`)
**Date:** 2026-10-05

## Context

Mesen calls the Lua `codeBreak` callback once when execution breaks. If the
callback returns without resuming or stepping, Mesen stays paused and the
script is never called again until something external happens; the bridge
would be deaf while paused. `bridge.lua` therefore ends every idle
`codeBreak` round with a keep-alive step so the callback fires again. That
step was `emu.step(1, emu.stepType.step)`: one CPU instruction per round,
about one or two a second with the 600 ms poll.

So a "paused" game was not frozen. Over a minute it crept a hundred or two
instructions; because a pause lands at the end of a frame, the CPU soon
entered SMB's NMI, which switches rendering off while it updates the PPU,
and anything reading the live mask said nothing was drawn (the `get_region`
calls in `d8b747b1`, a minute after the clicks). RAM the NMI touches
changed under a paused `read_memory` the same way. The mask was fixed by
sealing it with the ring's frame (ADR-0014), but the root was the creep.

Mesen 2.1.1's `emu.stepType` offers `step`, `stepOut`, `stepOver`,
`cpuCycleStep`, `ppuStep`, `ppuScanline`, `ppuFrame`, `specificScanline`,
`runToNmi`, `runToIrq`. Measured on 2026-10-05, paused at scanline 240 with
the bridge pinged every 4 s for a minute:

| keep-alive | CPU after 60 s | PPU after 60 s | bridge answered |
|---|---|---|---|
| `step(1, step)` (before) | ~100-200 instructions, into the NMI | a few hundred dots | yes |
| `step(1, ppuStep)` | PC moved 2 bytes (the idle loop), ~65 CPU cycles | 195 dots, same scanline, frame count unchanged | 12 of 12 |
| `step(0, ppuStep)` | n/a | n/a | 0 of 6: no re-break, bridge deaf |

## Decision

1. **The keep-alive is `emu.step(1, emu.stepType.ppuStep)`**, falling back
   to `step` only on a build without `ppuStep` (`KEEPALIVE_STEP` in
   `bridge.lua`). All four keep-alive sites use the one `keepalive()`
   function; **no code path may step the CPU to stay alive.** The frame
   steps for `step_frame`, resets and save states are unchanged.
2. **A long pause is still "paused at some point inside the next frame".**
   About three PPU dots per idle round means the NMI line (scanline 241) is
   reached after roughly two minutes of idle pause, and the CPU then walks
   through the NMI at about one cycle a second. Tools that read live PPU
   or CPU state while paused keep that in mind: the mask and scroll come
   from the sealed frame (ADR-0013, ADR-0014); `get_cpu_state` and RAM
   reads report what is there now, which after minutes of pause may be a
   few instructions into the frame's NMI.

## Consequences

- Ten to a hundred times less drift while paused; a pause of normal length
  (seconds to a minute) now sits inside the post-render line with the CPU
  in its idle loop, which is what "paused" should mean.
- Zero drift is not available from the step API: a zero-count step does
  not re-enter the callback. True zero would need either a longer script
  timeout with a blocking loop that never returns (Mesen's UI resume could
  not interrupt it) or a Mesen-side timer callback, which the Lua API does
  not offer.
- The watchdog theory in `docs/issues.md` (keep-alive steps nesting
  `codeBreak` callbacks) is unchanged by the step type; if "Maximum
  execution time" recurs, that entry still holds the plan.

## Alternatives

- **Raise Mesen's script timeout and block inside `codeBreak`.** Removes
  the step entirely, but Mesen's own Resume cannot interrupt the loop, the
  UI's pause state and ours would disagree, and the 1 s watchdog is a
  per-machine setting every user would have to change. Rejected.
- **`cpuCycleStep`.** Three dots per step, no better than `ppuStep`, and it
  names the CPU as the thing being advanced. Rejected.
- **Keep the CPU step and fix each reader.** The mask fix was that; RAM
  reads cannot be fixed that way. Rejected as the only measure.

## Revisit triggers

- Mesen gains a timer or idle callback for Lua; then the keep-alive goes.
- A tool needs byte-exact RAM after a multi-minute pause; then snapshot
  RAM at pause time (`emu.read` into a table at the first `codeBreak`) and
  serve reads from the snapshot.
