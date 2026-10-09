---
name: verify
description: Runtime-verification recipe for jeROMy — drive the agent against a live Mesen2 with a real ROM loaded, through the dsh profile `jeromy`. This is the deploy analog for a local tool; a green /shipshape does not discharge it. Run after substantive changes to tools, the Lua bridge, the prompt, or the emulator view, and before claiming a roadmap item done.
---

# /verify — exercise the change in the real loop

"Verified" means a real Mesen2 with a real ROM did what the change claims,
and a screenshot showed it. Unit tests mock the adapter; this does not.

**Precondition:** Mesen2 is running on Windows with a NES ROM loaded and
`mesen/bridge.lua` loaded in Tools → Script Window. If the bridge is not
connected, stop and say so; do not simulate a result.

## Through dsh

```bash
scripts/up.sh          # dsh + Mesen + bridge, prints URLs (see /up)
scripts/trio.sh        # look, read, edit, click, region, hacks, persist, play — headless through dsh, streams under .chat-out/
scripts/trio.sh --blind variable   # ADR-0019 calibration after a change to play_input, the diff tools or find-variable (~2 min, not in the default set)
```

`trio.sh` stops the web dsh for its duration (one process owns the bridge
port) and restarts it. It prints a `replay:` line per check; run it
(`scripts/dsh-log.mjs show <id> --images DIR`, see `/replay`) and read the
tool trace and reasoning, not just the `final` text. For `look` and
`edit`, Read the copied PNGs rather than trusting the description. For the
human half, open the right-sidebar Browser at `http://127.0.0.1:9002/`,
pause, and click in each selection mode (ADR-0014): in **Color** a click
on Mario's hat tints the hat and nothing of the sky; a click on an overalls
button tints the button alone and the pick text says the slot is shared
with his face and that sprite palette 4 has no free slot; in **Object** a
click anywhere on Mario tints all of him; the frame must not move on any
click (ADR-0013), and the first click on a running game pauses it
(ADR-0015). The history under the frame lists each click per mode with
its checkbox, newest checked; untick one, send a prompt about "the thing
I clicked", and `/replay` that web session (`scripts/dsh-log.mjs list`
shows it by cwd): exactly the checked lines appear as `jeromy-view`
messages ahead of the prompt, the rows dim as sent, and the answer comes
from the context line, not from pixel sampling.

## The standing trio, plus what the change touched

Every run does these three, in order, and reports each with the evidence:

1. **Look.** "Take a screenshot and describe what you see." The description
   names things actually on screen. Note the image token count and cost.
2. **Read.** "What tile is at pixel (x, y) and what palette does it use?"
   on a pixel you clicked in the emulator view. The answer matches the
   picker's own readout.
3. **Edit and confirm.** "Change palette N color M to <color>", then a
   second screenshot. The edit is visible in the second screenshot and the
   tool trace shows one `write_palette` and no silent retries.

Then the surfaces the change touched: a ported tool is called by name with a
hard input; a Lua change is exercised paused and running (the watchdog only
bites while paused); a prompt change is checked by asking the model to
restate the rule it introduces.

## What to record

Findings go to `docs/issues.md` immediately, never left in chat. A finding
that blocks the frontier is also pinned to that roadmap item as a carry-in.
A behavior worth guaranteeing gets a unit test naming it (tools) or a
protocol test (bridge).

## Report

```
VERIFY — jeROMy @ <sha> · ROM <name/sha1 prefix> · model <id> · sessions <id prefixes>
  look      ✓|✗  <one line of what it described> · <image tokens / cost>
  read      ✓|✗  tile <id> palette <n> matches picker
  edit      ✓|✗  write_palette → visible in screenshot 2
  touched   <surface>: ✓|✗ <evidence>
  findings  <issues.md entries added, or none>
```
