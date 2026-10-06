# jeROMy — Direction

**Source of truth for product intent.** Read before product-level decisions;
update when scope changes. Build plans derive from ADRs (`docs/adr/`), build
order lives in `docs/roadmap.md`.

## What it is

An AI ROM-hacking agent for retro games, starting with NES on Mesen2. A
person describes a change in plain language ("make the sky purple", "give
Mario a hat", "what address holds the lives counter?"). The agent looks at
the running game through screenshots, tiles, palettes, nametables and memory,
edits it live in the emulator, verifies with another screenshot, and records
what it learned about the ROM so the next session starts smarter.

## The loop

```
describe change → inspect (screenshot / tiles / palette / memory)
  → edit live (palette, CHR tile, nametable, RAM) → verify (screenshot)
  → persist (ledgered PRG/CHR write → hacks/sha1-*/edits.json → IPS/BPS/ROM)
  → record discovery (record_mapping) → promote to mappings/sha1-*.json
```

Three things fall out of the loop and are the actual assets:

1. **The Mesen bridge**: Lua in the emulator, JSON over TCP, pause/step/
   resume under the 1-second Lua watchdog. The only part that runs on Windows.
2. **The tools**: 33 emulator operations the model can call, with
   model-readable renderings (ASCII tile art, palette tables, nametable
   grids, slot-based region selections).
3. **The mappings**: per-ROM JSON keyed by SHA1 that names tiles, palettes,
   sprites and memory addresses. Discovered in sessions, promoted to files,
   shared with other people.
4. **The procedures**: curated skills, one per kind of hack (recolor an
   object, redraw a tile, find a variable), shipped with the plugin and
   loaded on demand by the model or invoked as a command by the person
   (ADR-0008).

## Shape (decided 2026-10-05)

jeROMy is a **plugin for DeepSeek Harness (dsh)**, installed into a profile,
not an app. dsh provides the chat UI, sessions and forking, model providers,
settings, MCP and plugin management. jeROMy provides the bridge, the tools,
the NES system prompt, the mapping store, and a small emulator-view page shown
in dsh's sidebar. See ADR-0001 through ADR-0005 and
`docs/plans/dsh-migration.md`.

Default model is `deepseek-flash` (V4.1-Flash, native vision, roughly a
hundredth of Claude's per-screenshot cost). Switching to Claude or anything
else is a dsh settings change, never code here.

## Release gate (Logan, 2026-10-05)

jeROMy is not released, published or announced until two things are true
on Super Mario Bros. (World), the reference game:

1. **The game is mapped end to end.** `mappings/sha1-<smb>.json` names the
   things a person would point at in every scene the game has (title, the
   HUD, each world's tile sets, enemies and the player, item and effect
   sprites), the palettes and what each slot paints, the RAM a hacker
   reaches for (lives, coins, timer, score, world/level, player state,
   enemy slots), the level data format and where each level lives in PRG,
   and the routines that matter (NMI, scroll split, palette loads, level
   loader). Coverage is measured, not felt: a checklist in
   `docs/plans/` with one line per item and the session that proved it.
2. **A rewritten game can be iterated on.** Edits are not experiments in
   RAM that vanish on reset; a hack is a thing you boot. The ledger under
   `hacks/sha1-<sha1>/` is the hack, every PRG/CHR change goes through it,
   the loop brings the game up with the hack applied without the model
   being asked, and a person can keep changing it across sessions, undo,
   diff, and export a patch or a ROM at any point. Palette, tile,
   nametable, level and code edits all have a persistent path, not only
   the palette table proven on 2026-10-05.

Everything else on the roadmap serves one of these two.

## Principles

- **Cheap turns.** A session should cost cents. Screenshots are the main
  input and must stay cheap, which is why vision pricing drove the model.
- **Discoveries outlive sessions.** Anything the agent learns about a ROM is
  worth a mapping entry. Mapping files are the community artifact.
- **Model-visible means logged.** Anything that reaches the model request
  (tool results, pixel-picker clicks, mapping context) is a session event
  that replays and forks. No side channels.
- **Platform-agnostic layering.** Agent and tools talk to an emulator
  adapter interface, never to Mesen directly. NES is first; SNES and GBA are
  adapters, not rewrites.
- **Verify by looking.** An edit is not done until a screenshot shows it.

## Bright lines

- Never ship, download or link ROMs. Users bring their own. Output is
  edits, mappings and eventually IPS/BPS patches.
- Never write CHR ROM or PRG ROM without a recorded instruction from the
  person. Volatile RAM edits are the default; a persistent edit is an
  explicit tool call recorded in the hack's ledger, and the active hack's
  ledger is itself the instruction to apply it again at boot (ADR-0018).
- No own chat UI, no own session database, no own provider adapters. If dsh
  lacks something, extend it through a documented seam or file an issue
  upstream.

## Non-goals (for now)

- SNES/GBA before NES editing is solid end to end.
- Emulators other than Mesen2.
- Running without a debugging emulator (static ROM analysis only).
- A hosted or multi-user service. This is a local tool.
