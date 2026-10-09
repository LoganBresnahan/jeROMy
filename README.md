# jeROMy

AI ROM-hacking agent for retro games. You describe a change in plain
language; the agent inspects the running game in Mesen2 (screenshots, tiles,
palettes, sprites, nametables, memory), edits it live, verifies by looking,
and records what it learned about the ROM as a shareable mapping.

jeROMy is a plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
(dsh). dsh provides the chat UI, the model access (`deepseek-flash`, with
native vision), sessions and settings; jeROMy provides the emulator bridge,
the ROM-hacking tools, the NES prompt section, the mapping files and an
emulator view page for dsh's sidebar browser. Product intent lives in
[docs/DIRECTION.md](docs/DIRECTION.md); decisions in [docs/adr/](docs/adr/README.md);
build order in [docs/roadmap.md](docs/roadmap.md).

```
dsh (web UI, model, sessions)  ──plugin──▶  jeROMy (src/dsh/)
                                               │ EmulatorAdapter
                                               ▼
                               TCP :9001 ◀──── mesen/bridge.lua in Mesen2 (Windows)
                               :9002 emulator view (sidebar Browser)
```

## What you need

- Windows with [Mesen2](https://www.mesen.ca/) 2.1+ and a NES ROM you own.
  jeROMy never ships or fetches ROMs.
- WSL2 (Ubuntu) with Node 22+ and pnpm, and a checkout of DeepSeek Harness
  (`dsh-v0.2.1-alpha.1` or later) next to this repo.
- A DeepSeek API key in `DEEPSEEK_API_KEY`.

Mesen2 settings, once per machine: Tools → Script Window → allow network
access, allow I/O, script timeout 1 s, auto-start on load.

## Install

jeROMy is one npm package, `jeromy-dsh`, that is both the dsh plugin and a
dsh bundle (ADR-0012): adding it to a profile mounts the plugin and applies
its composition (`deepseek-flash`, the sidebar browser, session-log upload
off, the coding toolbelt replaced by the `jeROMy` agent preset with a
read-only sandbox default).

```bash
dsh jeromy --from-default-profile web          # a profile from the web template, once
dsh plugin --profile jeromy add https://github.com/LoganBresnahan/jeROMy.git   # or a local path, or jeromy-dsh@<version> once published
dsh --profile jeromy                           # boot; open the printed URL
```

A game's hacks live under `hacksDir` (plugin config; default: the plugin's
`hacks/` while developing, `~/.dsh/jeromy/hacks/` installed). Point it at a
git repository of your own, one for all your games or one per game: it holds
ledgers, manifests and patches and never a ROM (a `.gitignore` is seeded).
Each game is a `sha1-<sha1>/` folder, each hack a named folder inside it
(`list_hacks`, `new_hack`, `use_hack`); one hack is active in the emulator
at a time and is applied when the bridge connects (ADR-0018). The tour of
what a mapping, a hack and a patch are: [docs/guide/rom-hacking-with-jeromy.md](docs/guide/rom-hacking-with-jeromy.md).

A git or local install needs the package built (`npm install && npm run
build` in the checkout; the Capstone WASM under `capstone/` is optional and
only enables `disassemble`). On an installed copy, promoted mappings and
hack directories go to `~/.dsh/jeromy/`; the package's `mappings/` is a
read-only seed.

To work on jeROMy itself, clone this repo next to a DeepSeek Harness
checkout and use `scripts/up.sh`: it mounts `src/dsh/index.ts` from source
through an overlay derived from the same `cordis.patch.yml`.
`scripts/install-check.sh` proves the packaged install in a throwaway
profile.

## Boot it

From WSL, in the checkout:

```bash
scripts/up.sh            # dsh (profile jeromy), Mesen2 with the ROM + bridge.lua, waits for the bridge
scripts/up.sh --down     # stop dsh (Mesen stays open)
scripts/up.sh <rom>      # a different ROM (default: SMB (World) in C:\Users\<you>\Documents)
```

What `up.sh` does, in order: starts dsh on the `jeromy` profile (web UI on
`:3080`, bridge listening on `:9001`, emulator view on `:9002`), launches or
re-points Mesen2 on Windows with the ROM and `mesen/bridge.lua`, and waits
until the Lua client connects. It prints the dsh URL when the bridge is up.
On an installed copy without the scripts: `dsh --profile jeromy`, then in
Mesen2 open the ROM and run `bridge.lua` from the Script Window (the view's
status line prints the script's path when the bridge is not connected).

Then, in the browser:

1. **Open the dsh URL.** The first boot of a profile shows dsh's own
   first-run notice; click through once.
2. **Start a session.** It starts on the `jeROMy` preset (emulator tools
   plus a read-only shell for pixel arithmetic) in the read-only sandbox.
3. **Put the emulator view in the right sidebar.** dsh opens links in its
   sidebar Browser by default (Settings → Chat → link opening), so clicking
   `http://127.0.0.1:9002/` in any chat message opens the view beside the
   chat; paste the URL into a message if none is there, or open the
   Browser tab from the sidebar's guide and enter the URL by hand. The tab
   stays with the session. dsh has no setting to open a sidebar page at
   startup, so this is a once-per-session click.
4. **Click.** The view shows the live frame at 60 fps with a pixel picker and
   Pause / Step / Resume. A click pauses a running game on that frame and
   never advances it (ADR-0013, ADR-0015); untick **Pause on click** to
   have it pause only for the readout and resume. The **Select** row
   chooses what a click means (ADR-0014):
   **Color** (default) highlights the connected pixels that use the same
   palette slot, which is the unit a recolor acts on (a hat, a button, a
   pipe rim); **Object** the connected pixels of the same palette (all of
   Mario, the whole pipe); **Tile** the 8x8 cell, the unit `write_tile`
   edits; **Pixel** just the readout. The highlight stays until the next
   click.
5. **Choose what the agent gets.** Clicks collect in a history under the
   frame, one section per mode, newest first, each with a checkbox. The
   newest click of each mode is checked by default; the checked clicks go
   with your next prompt as one line each, naming the tile, the palette,
   the rendered color, the sprite if one is drawn there, and the selected
   region with what a palette edit would also recolor and whether the
   palette has a free slot for a tile edit. Click a row to see its
   highlight again; sent rows dim.

Try: "Take a screenshot and describe what you see", "What did I just
click?", "Make the pipes red", "Make that permanent and export a patch",
"Find the lives counter in RAM".

## References for a game (optional)

A community disassembly or wiki map makes mapping a game fast, but a full
disassembly is the ROM in another spelling, so jeROMy never ships or fetches
one (ADR-0017). You bring it, beside your ROM, and import its symbols into
the gitignored hack directory; the agent then looks names up with
`lookup_symbol`, and still proves every fact in the emulator before it is
recorded. For Super Mario Bros. (World):

```bash
git clone https://github.com/threecreepio/smb-disassembly ~/smb-disassembly
cp "/path/to/Super Mario Bros. (World).nes" ~/smb-disassembly/   # the build extracts CHR from your copy
(cd ~/smb-disassembly && make)                                   # needs cc65; produces main.nes.dbg
npm run build
scripts/import-reference.mjs import ~/smb-disassembly/main.nes.dbg --sha1 <your ROM's sha1> --source "smbdis (doppelganger), ca65 port by threecreepio"
scripts/import-reference.mjs near 0x8EE9 --sha1 <sha1>          # nearest label to a PC from trace_writes
```

Without cc65, `import` also reads `Name = $075A` equates straight from the
`.asm` (RAM names only), and a wiki table pasted as `address,name,notes`
CSV (Data Crystal's RAM map is GFDL; credit it in `--source`). The ROM's
sha1 is in the agent's prompt and in `get_rom_info`.

Headless checks and session review:

```bash
scripts/trio.sh                       # look / read / edit / click / persist through dsh, streams under .chat-out/
scripts/dsh-log.mjs show latest       # what the agent saw, reasoned and called (ADR-0011)
```

## Letting the agent play (no reference needed)

Most games have no disassembly and no RAM map, so the agent can find
things by playing (ADR-0019). Ask it, for instance, "find the lives
counter without looking anything up". It will:

1. `snapshot_memory` the 2 KiB of NES RAM as `before`;
2. `play_input` a button script (hold right, jump, walk into an enemy;
   at most 10 seconds per call, run in real time while you watch the
   view; a paused game is resumed for the run and paused again after);
3. `snapshot_memory` again and `diff_memory` with the filter the action
   predicts (`decreased` after losing a life), naming each diff so the
   next round only considers the survivors;
4. prove the last candidates with `write_memory` and a screenshot of the
   HUD, then `record_mapping` the address with `source: "differential
   search"`.

`play_input` also takes a `watch` list of up to 16 addresses sampled every
frame, so one run of "hold right" shows which candidate climbs like an X
position. The agent never presses a button outside a `play_input` call,
never writes ROM while playing, and reports every run's frame count.

If you imported a reference (above), `scripts/score-mapping.mjs <sha1>`
grades what the agent found against it: agrees, disagrees, unknown to the
reference. That score, on Super Mario Bros., is how we know the blind
method works before pointing it at a game nobody has mapped.

## Layout

```
mesen/bridge.lua        Lua client inside Mesen2: JSON over TCP, palette overrides, memory, PPU, OAM
src/bridge/mesen/       connection, protocol, EmulatorAdapter (host-agnostic)
src/agent/tools.ts      the 33 ROM-hacking tools against the adapter; prompts.ts; nes-palette.ts
src/agent/tile-lookup.ts  screen pixel → nametable tile + sprites, scroll-split aware
src/agent/region.ts     region selection by palette slot: flood fill of the bridge's pixel map (ADR-0014)
src/hacks/              edit ledger per ROM, IPS/BPS patch writers (ADR-0009)
src/mappings/           mapping loader + schema; mappings/sha1-*.json are the shipped artifact
src/dsh/                the dsh plugin: Mesen service, tool registration, prompt section, emulator view
skills/                 curated ROM-hacking procedures shipped with the plugin (ADR-0008)
scripts/                up.sh, trio.sh, dsh-dev.sh, mesen-up.sh, dsh-log.mjs, budget.sh, install-check.sh
docs/                   DIRECTION, roadmap, issues inbox, ADRs, plans, bridge protocol
```

New to ROM hacking, or to what a mapping, a hack and a patch are? Start
with [docs/guide/rom-hacking-with-jeromy.md](docs/guide/rom-hacking-with-jeromy.md).
Rules for working in the repo are in [CLAUDE.md](CLAUDE.md).

## Tools

Screenshot and pixel lookup (`screenshot`, `get_tile_at_pixel` with the
sprites over the pixel, `get_pixel_color`, `list_sprites`, `get_region`
by palette slot, `read_tile`, `read_nametable`), palettes (`get_palette`, `get_all_palettes`,
`write_palette` with per-frame override, `clear_palette_overrides`), memory
(`read_memory`, `write_memory`, `search_memory`, `trace_writes`,
`convert_address`), CPU and ROM info, save/load state, emulator control
(`pause_emulator`, `resume_emulator`, `step_frame`, `reset_emulator`),
`disassemble` (Capstone WASM), persistent edits (`undo_edit`,
`reapply_edits`, `export_patch`, `export_rom`) and the mapping tools
(`record_mapping`, `promote_mappings`). RAM edits are the default; every
CHR/PRG ROM write is explicit, ledgered with its old bytes under
`hacks/sha1-<sha1>/`, and exportable as an IPS or BPS patch.

## Development

```bash
npm test             # vitest, all suites
npx tsc --noEmit     # typecheck
cd capstone && ./build.sh   # rebuild the Capstone WASM (needs emsdk; artifacts are gitignored)
```

## License

AGPL-3.0
