# ADR-0007: A push-based binary frame channel for the emulator view, if 10 fps stops being enough

**Status:** Not needed (measured 2026-10-05). Logan asked for 60 fps; the existing request/response channel was measured first: with `viewFps: 60` the view receives 58 events/s and 38 distinct PNG frames/s at 109 KB/s (3 KB per PNG), emulation holds 60.0 fps, and tool latency is unchanged; 30 and 20 scale linearly (61 and 43 KB/s). The default is now 60 (`viewFps`, plugin config). Reopen only if a game's frames stop compressing to a few KB or the sidebar browser cannot decode 60 PNGs a second.
**Date:** 2026-10-05

## Context

The emulator view (ADR-0004) shows the running game by pulling frames
through the same JSON-over-TCP bridge the tools use: the server asks Lua for
`screenshot`, Lua calls `emu.takeScreenshot()` (PNG encoded by Mesen),
base64-encodes it in pure Lua, and answers inside the next `endFrame`
callback; the server pushes the result to browser tabs over Server-Sent
Events. One shared pump serves all tabs. Measured 2026-10-05: a steady 10
events/s, unchanged frames suppressed, about 4.5 KB per changed frame.

Costs per frame on this path: one request/response round trip (at most one
bridge message is processed per emulated frame, so the floor is 16.7 ms plus
socket latency); PNG encode in Mesen (cheap, native); base64 in Lua (about
4 KB, cheap); JSON framing; base64 again inside the SSE JSON. The bridge
request queue is shared with agent tool calls, so a fast stream competes
with the model's own screenshots and memory reads. While paused the only
path is the blocking `codeBreak` poll with a 600 ms budget under Mesen's
1-second watchdog (CLAUDE.md non-negotiable), so the stream deliberately
drops to 1 Hz there.

20 fps is the configured ceiling. Going higher on this path means two
bridge round trips per three emulated frames, with the model's tool calls
queued behind them. The NES runs at 60.1 fps; a person watching gameplay in
the panel notices the difference between 10 and 30, not between 30 and 60.

## Decision (proposed)

1. **A second, one-way TCP channel from Lua to the server, for frames only.**
   The Lua script opens it beside the command socket when the server
   advertises a frame port. Lua pushes frames unprompted every N emulated
   frames (N configurable, default 2 for ~30 fps) from `endFrame`; nothing on
   this channel is a request, so it never competes with tool calls and never
   touches the `codeBreak` budget.
2. **Frame encoding: NES palette indices, run-length encoded, binary.** A
   frame is 256x240 pixels at 6 bits of master-palette index each. Lua reads
   `emu.getScreenBuffer()` (ARGB per the Mesen API reference), maps each
   pixel to its master-palette index through a 64-entry reverse table built
   once at startup, and RLE-encodes rows. Typical NES frames compress to a
   few KB; the worst case is 61,440 bytes, still fine on loopback. Framing is
   `[u32 length][u32 frame number][u8 paused][payload]`, no JSON, no base64.
   If the Lua loop over 61,440 pixels proves too slow inside `endFrame`,
   fallback is sending Mesen's PNG bytes raw on the same binary framing,
   which already removes both base64 passes and the round trip.
3. **The server decodes to RGBA once** using `nes-palette.ts` and pushes
   frames to the page over a WebSocket (binary) instead of SSE; the page
   blits with `putImageData`. The SSE path stays as the fallback when the
   frame channel is absent, so old Lua scripts keep working.
4. **The command protocol is unchanged.** `screenshot` remains the tool the
   model uses; the stream is for people. `docs/bridge.md` gains a "frame
   channel" section in the same commit as the Lua change.

## Consequences

- Smooth 30 fps for the viewer at roughly 100 KB/s, no contention with the
  agent's tool traffic, and no new load on the paused path.
- A second socket and a binary framing to maintain in Lua, TypeScript and
  the page. The reverse palette lookup assumes Mesen's default NES palette;
  a custom palette in Mesen breaks the index mapping (detectable: a color
  with no table entry), in which case the PNG fallback engages.
- More Lua in the per-frame path. Must be measured against the watchdog:
  `endFrame` work is not under the 1 s budget the way `codeBreak` is, but a
  slow callback drops emulated frames, which the person sees as stutter in
  the game itself. Budget: under 3 ms per pushed frame.

## Alternatives

- **Raise the SSE pump to 20 fps and stop.** Zero new code; keeps the
  round-trip floor and the shared queue. This is the first thing to try
  when someone complains, and may be enough.
- **Request/response but binary.** Removes base64 and JSON, keeps the
  round trip and the one-message-per-frame limit. Half the benefit.
- **WebRTC or MJPEG.** Heavier than the problem; the consumer is one
  loopback iframe.
- **Capture Mesen's window from Windows.** Leaves the bridge entirely, but
  depends on window focus and WSL/Windows screen capture; brittle.

## Revisit triggers

- Adopt when a person using the sidebar view for actual play or long
  verification sessions reports the 10 fps view as a problem after the
  20 fps setting was tried, or when agent tool latency measurably rises
  while the view is open.
- Drop if Mesen2 grows a native frame-streaming API or a Lua
  `getScreenBuffer` variant that returns palette indices directly.
