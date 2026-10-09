# ADR-0019: The agent plays the game through a bounded controller tool, finds variables by differential search, and a reference is calibration, never a prerequisite

**Status:** Accepted (2026-10-05, Logan: "yes, I want this as a direction. And to be clear many games will not have a disassembly like Super Mario Bros")
**Date:** 2026-10-05

## Context

Mapping today is steered by a person: a click in the view names a thing,
the model reads around it, `record_mapping` writes it down. Logan asked
what it would take for the agent to map on its own, by playing, and
whether it could "just digest the binary".

Two facts shape the answer.

1. **Most games have no answer key.** Full labeled disassemblies exist for
   a few dozen NES titles out of roughly 1,300 released; partial wiki RAM
   maps for a few hundred more; the long tail has nothing. The reference
   import (ADR-0017) made Super Mario Bros. the exception. A mapping method
   that needs a reference does not generalise, and the release gate's point
   (`docs/DIRECTION.md`) is skills that map any game Mesen loads.
2. **Static reading of a 6502 binary is weak on its own.** Data and code
   interleave, jump tables hide control flow, and the same byte pattern
   recurs. Humans map by combining the static view with the running game:
   change something, watch what moves, read the code that moved it. The
   plugin already has the reading half (`read_memory`, `trace_writes`,
   `disassemble`, `search_memory`) and none of the playing half: no tool
   presses a button, and the differential search the campaign plan calls
   `find-variable` (`docs/plans/mapping-campaign.md`, sheet 3) has no
   `snapshot_memory` or `diff_memory` behind it.

Mesen's Lua API offers `emu.setInput(port, buttons)`, honoured until the
next `inputPolled` event, and `emu.breakExecution()`. The bridge already
has two-phase requests that complete from `endFrame` after N frames
(ADR-0010), with a 600-frame cap, and a rule that read-only tools never
advance the emulator (ADR-0013).

A model call per frame is the wrong grain: slow, expensive, and no better
at playing than a scripted button hold. The useful unit is an experiment
the model designs and the plugin runs deterministically.

## Decision

1. **One controller tool, `play_input`, bounded and announced.** It takes a
   script of segments `[{buttons: ["right", "a"], frames: 30}, ...]`
   (buttons from `a b select start up down left right`, port 0 by default),
   runs them in real time from an `inputPolled` callback in `bridge.lua`
   with every button of the port set explicitly, and completes as a
   two-phase request when the frames have elapsed. Total frames per call
   are capped at 600 (10 seconds). If the emulator was paused, the tool
   resumes it for the run and breaks again at the end, and the result says
   so; the view's pause and the person's own controller are otherwise
   untouched. It joins `step_frame`, `reset_emulator` and the save-state
   tools as the only tools that run frames (amending the ADR-0013 list),
   and its result carries `frames_run` and `paused`.
2. **`watch` turns a run into a measurement.** `play_input` accepts up to
   16 CPU addresses and returns their value at the end of each frame
   (thinned to at most 60 samples per address on long runs), so "hold right
   for a second" comes back with the candidate X-position traces beside it.
   Reads go through the debug memory type and have no side effects.
3. **Differential search is two pure tools on the TypeScript side.**
   `snapshot_memory {name, address?, length?}` reads a range (default the
   NES's 2 KiB of internal RAM through `cpuDebug`) into a per-adapter,
   in-memory, session-scoped store and returns the name, range, frame and
   a checksum, never the bytes. `diff_memory {a, b, filter, value?, from?,
   name?}` compares two snapshots with `changed | unchanged | increased |
   decreased | equals`, optionally restricted to the survivors of an earlier
   named diff (`from`), stores its own survivors under `name`, and returns
   up to 64 addresses with old and new values and the count of the rest.
   When a reference is imported, each returned address carries its symbol
   as a lead, marked unverified (ADR-0017). Snapshots are never written
   back and never ledgered; the proof of a found variable is a
   `write_memory` the model makes afterwards and a screenshot.
4. **The first skill is `find-variable`, written from the first blind
   session** (ADR-0008): snapshot, act (through `play_input` or by asking
   the person to play), snapshot, diff, repeat with `from` until a handful
   remain, prove by writing, record an `address` entry with `source:
   "differential search"`. The skill tells the model to search first and
   consult `lookup_symbol` only afterwards, to name or dispute what it
   found; a reference is never the search.
5. **Super Mario Bros. is the calibration game, and the score is a
   script.** `scripts/score-mapping.mjs <sha1>` compares every `address`
   entry in `mappings/sha1-<sha1>.json` against `reference.json`: agrees,
   disagrees (same address, different meaning), unknown to the reference.
   The number that matters for the release gate is how many variables a
   blind session finds and how many of them the reference confirms; a
   method tuned on SMB with the reference in the loop would not tell us
   that, so calibration sessions run with `lookup_symbol` held back until
   the proof step.
   *Amended the same day, from the adr-plan review:* holding back is a
   switch, not an instruction to the model. With `JEROMY_BLIND=1` in the
   plugin's environment the reference is null for every tool: no leads on
   `diff_memory` or `play_input` watches, and `lookup_symbol` says it is a
   blind session. A task text alone would leave the leads in the diff
   results and inflate the score silently. RAM leads, when not blind, are
   exact equates only: the reference cannot tell `DeathMusic = 1` from
   `FrameCounter = $09`, so a nearest-label hint would name every byte.
6. **Autonomy stays inside the existing bright lines.** Playing never writes
   PRG or CHR; snapshots and diffs read debug memory; the only state a run
   changes is the game's own RAM, as the person's controller would. A
   session that plays can use `save_state` and `load_state` to return to a
   starting point, and a long campaign is a chain of bounded calls the
   person watches in the view, not a detached process.
7. *Amended 2026-10-09:* **`play_input` is probed, not assumed.** On every
   connect `MesenService` calls `debug_event_types`; a build without the
   `inputPolled` event or `emu.setInput` marks `play_input` unavailable
   (`src/agent/capabilities.ts`), the tool fails with that reason before
   reaching Lua, and the prompt lists it, so the model asks the person to
   play the moment instead of running frames that press nothing. A failed
   probe (an older `bridge.lua`) blocks nothing.

## Consequences

- Sheet 3 of the mapping campaign (lives, coins, timer, score, position,
  power state) becomes a procedure that needs nobody in the chair, and the
  same tools serve sheet 4 (`play_input` to walk into a level while
  `trace_writes` watches the loader) and sheet 5.
- `play_input` is the first tool that keeps the game running for seconds
  on the model's behalf. The cap, the explicit frame count in every result
  and the restore of the pause state are what keep it a tool rather than a
  loss of control; the view shows the run as it happens.
- Three more tools (all but `extract_sprite` register in dsh), a new Lua event
  callback (`inputPolled`), and a store of up to a few dozen 2 KiB
  snapshots per session in process memory. Snapshot bytes never reach the
  model, so they are not a logging concern under ADR-0003; every diff
  result is a tool result and is logged.
- Scoring is only possible on games with a reference, which is the point:
  it measures the blind method where we can, so we can trust it where we
  cannot.
- Not covered: conditional scripts ("hold A until address X reads 8"),
  input recording of the person's play, and SNES or GBA button sets. See
  revisit triggers.

## Alternatives

- **The model drives frame by frame** through `step_frame` plus a
  `set_input`. Rejected: one model call per frame is roughly 60 calls a
  second of game time, cents per second, and a model is not a better
  button holder than a script. The model designs, the plugin executes.
- **Static analysis only** (the model reads the disassembled binary).
  Rejected as the sole method for the reasons in Context; it stays as the
  second half of the loop, on the addresses and PCs that play and traces
  surface.
- **Watching the person play** with before/after snapshots and no
  controller tool. Kept as a mode of the same skill (the "act" step can be
  the person), rejected as the only mode because it needs someone present
  for every experiment.
- **Snapshots in Lua, diffed in Lua.** Rejected: JSON-encoding 2 KiB in the
  bridge is fine but a growing snapshot store inside the watchdog's reach
  is not, and the diff is pure logic that belongs in testable TypeScript.
- **An input file format (TAS-style `.fm2`)** as the experiment unit.
  Rejected for now: the segment list covers every experiment in the
  campaign plan; a recording format is a revisit trigger.

## Revisit triggers

- A campaign experiment needs a condition rather than a frame count (reach
  a screen, wait for a value), or more than 600 frames in one call.
- A game keeps its variables outside the 2 KiB internal RAM (battery SRAM
  at `$6000`), which the `address`/`length` parameters cover but the
  default does not.
- Someone wants to record the person's own play as a replayable script.
- A second platform's adapter needs a different button set.
- The SMB calibration score shows the blind method missing a class of
  variable the reference has (for instance per-slot enemy arrays), which
  would call for a structured filter rather than a per-address one.
