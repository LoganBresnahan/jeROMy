---
name: up
description: Bring the whole jeROMy loop up from WSL in one move — dsh (profile jeromy with the plugin from source), Mesen2 on Windows with the ROM and bridge.lua, bridge connected, URLs printed — and tear it down. Idempotent; run at the start of any session that will touch the emulator, before /verify, or whenever the view says the bridge is not connected.
---

# /up — bring the loop up (or down)

One command, safe to repeat:

```bash
scripts/up.sh            # start what is missing, hand Mesen the ROM + Lua, wait for the bridge
scripts/up.sh --down     # stop our dsh (Mesen stays open)
```

It prints the dsh web URL (with its token), the emulator view URL for the
right-sidebar Browser, and the view's `/status`. A non-zero exit names the
one thing to fix.

## What it does, in order

1. **dsh.** If port 9001 is owned by our `--profile jeromy` process, reuse
   it. If it is owned by anything else (the v0.1 server, a headless run), stop
   and say so: two bridge servers cannot coexist. Otherwise start
   `scripts/dsh-dev.sh --no-open` in the background (log: `.dsh-dev/dsh.log`)
   and wait for `dsh web: http`.
2. **Mesen.** `scripts/mesen-up.sh [rom]`: launches `C:\Mesen.exe` with the
   ROM and `\\wsl.localhost\...\mesen\bridge.lua` as positional arguments.
   Mesen's SingleInstance preference hands them to a running instance, so
   this is also how to switch ROMs.
3. **Bridge.** Poll `http://127.0.0.1:9002/status` until `connected:true`
   (the Lua side retries every ~2 s). The Mesen service resumes a paused
   emulator on connect and loads the ROM's mapping by SHA1.

## When it fails

- **"port 9001 is owned by pid N, not our dsh"**: a leftover
  `scripts/dev-deepseek.sh` or headless run. Kill that pid, rerun.
- **"bridge not connected"**: the script is not running in Mesen. In Mesen:
  Tools → Script Window → it should show `bridge.lua` running; if the window
  is empty, Open the path printed by mesen-up and Run. Settings needed once
  per machine (already set here): Script Window → allow network access,
  allow I/O, timeout 1 s, auto-start on load.
- **`[mesen-up] Mesen did not start`** with Mesen visibly open: that was a
  `grep -q` + `pipefail` false negative, fixed 2026-10-05; if it returns,
  check the process check in `scripts/mesen-up.sh`.
- **View shows "PAUSED" and no frames after a handoff**: known
  (`docs/issues.md`); press Resume in the view or ask the agent to resume.

## Then

- A person: open the dsh URL, **New Session**, right-sidebar **Browser** →
  `http://127.0.0.1:9002/`, click a tile, ask the agent about it.
- A script: `scripts/trio.sh` runs the /verify trio headless (it stops the
  web dsh for the duration and restarts it).

## Report

```
UP — jeROMy
  dsh       <reused pid N | started> · http://127.0.0.1:3080/?token=…
  mesen     <ROM name> · handoff <ok | started>
  bridge    connected in <n>s · rom "<name>" · paused <true|false>
  view      http://127.0.0.1:9002/
```
