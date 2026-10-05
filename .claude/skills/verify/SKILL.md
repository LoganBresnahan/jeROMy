---
name: verify
description: Runtime-verification recipe for jeROMy — drive the agent against a live Mesen2 with a real ROM loaded, through the v0.1 server today and through a dsh profile once the plugin exists. This is the deploy analog for a local tool; a green /shipshape does not discharge it. Run after substantive changes to tools, the Lua bridge, the prompt, or the emulator view, and before claiming a roadmap item done.
---

# /verify — exercise the change in the real loop

"Verified" means a real Mesen2 with a real ROM did what the change claims,
and a screenshot showed it. Unit tests mock the adapter; this does not.

**Precondition:** Mesen2 is running on Windows with a NES ROM loaded and
`mesen/bridge.lua` loaded in Tools → Script Window. If the bridge is not
connected, stop and say so; do not simulate a result.

## Handle A — v0.1 server (until roadmap item 1)

```bash
scripts/dev-deepseek.sh &            # server on deepseek-flash, :3000 / :9001
scripts/mesen-up.sh                  # Mesen2 + SMB + bridge.lua, from WSL
node scripts/chat.mjs "Take a screenshot and describe it" --out .chat-out
```

Expect `[Bridge] Mesen Lua client connected` in the server log. If the first
screenshot comes back empty, the emulator is paused (known after a handoff,
see `docs/issues.md`): send `{"action":"resume_emulator"}` over the
WebSocket or ask the agent to resume. Screenshots land in `--out`; Read the
PNGs yourself rather than trusting the description.

## Handle B — dsh profile (from roadmap item 1)

```bash
scripts/up.sh          # dsh + Mesen + bridge, prints URLs (see /up)
scripts/trio.sh        # look, read, edit — headless through dsh, streams saved under .chat-out/
```

`trio.sh` stops the web dsh for its duration (one process owns the bridge
port) and restarts it. Read each check's `final` text and the saved JSON
stream; for `look` and `edit`, also open the attachment PNGs dsh saved
(under `~/.dsh/attachments/`) rather than trusting the description. For the
human half, open the right-sidebar Browser at `http://127.0.0.1:9002/`,
click a tile, and ask the agent about "the pixel I clicked".

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
VERIFY — jeROMy @ <sha> · handle <A|B> · ROM <name/sha1 prefix> · model <id>
  look      ✓|✗  <one line of what it described> · <image tokens / cost>
  read      ✓|✗  tile <id> palette <n> matches picker
  edit      ✓|✗  write_palette → visible in screenshot 2
  touched   <surface>: ✓|✗ <evidence>
  findings  <issues.md entries added, or none>
```
