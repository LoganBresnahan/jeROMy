# The mapping campaign: five answer sheets, one skill each, SMB first

Logan, 2026-10-05: the release gate is Super Mario Bros. mapped end to end
and a hack you can boot and iterate on (`docs/DIRECTION.md`), and the point
of mapping SMB is to end up with the skills that let anyone map any game
Mesen loads. This plan is the shape of that work. Each sheet below is a
kind of knowledge, the skill that discovers it from the emulator alone, the
tools the skill needs (existing or missing), and how SMB's run of it is
accelerated by the reference import (ADR-0017). Coverage for SMB is ticked
in `smb-map-coverage.md` as sessions prove items.

Rules that hold for every sheet:

- Discovery is from the running game; a reference (disassembly, wiki) tells
  the model where to look, never what to record. `confidence: 1` means a
  session saw it.
- Every entry carries `source` (ADR-0017) and promotes with `promote_mappings`
  into `mappings/sha1-<sha1>.json`, which is committed. Hacks, ledgers and
  references stay in the gitignored `hacks/`.
- Each skill is written from the first real session that does the job, per
  the standing rule (ADR-0008), and carries a `trio.sh` check or a plain
  reason why it cannot have one.

## Sheet 1. What the pictures are

Tiles, the objects tiles compose, sprites and metasprites, and what each
palette slot paints, per scene (SMB: overworld, underground, water, castle,
title, HUD).

- **Skill: `map-scene`.** Pause on a scene; `screenshot`; walk the frame
  with `get_region` in object mode on each distinct thing (click history
  rows from the person count as the walk); for each object record a `tile`
  entry per CHR tile with a group name, a `sprite` entry per metasprite
  (OAM run from `list_sprites`), and a `palette` entry per slot with its
  role. Finish with `promote_mappings`. Repeat per scene; the scene list is
  itself recorded as a `note`.
- **Tools:** all exist (`get_region`, `list_sprites`, `read_nametable`,
  `read_tile`, `record_mapping`). Missing: a `note` mapping type for facts
  that are not tile/palette/sprite/address (the model already reached for
  it); label-from-the-view (item 16 carry-in) so a person's click becomes an
  entry without a model turn.
- **SMB accelerator:** the disassembly names every metatile and sprite
  table; Data Crystal's ROM map lists the tilemap offsets.

## Sheet 2. Where the pictures come from

The PRG tables the game copies palettes, metatiles and sprite layouts from,
so a change can be made in ROM and survive reset.

- **Skill: `find-origin`.** Already half-written as `persist-edit`: take a
  value seen in palette RAM, OAM or a nametable, `search_memory` for its
  byte run in PRG, disambiguate hits by context, else `trace_writes` on the
  destination during a load to get the writer's PC and `disassemble` the
  table read; record `rom_origins` on the entry. Split out of `persist-edit`
  so that mapping an origin and persisting an edit are two procedures.
- **Tools:** exist (`search_memory`, `trace_writes` with `mem_type: ppu`,
  `convert_address`, `disassemble`). Missing: `trace_reads` is available as
  `mode: "read"` on `trace_writes` but the name hides it; a `watch` that
  reports the PC on the first access instead of counting for N frames
  would make origin tracing one call. `lookup_symbol` (ADR-0017) names the
  table.
- **SMB accelerator:** `AreaPalette`, `MetatileGraphics_Low/High`,
  `PlayerGraphicsTable` and friends are labels in the disassembly.

## Sheet 3. The RAM a hacker reaches for

Lives, coins, timer, score, world and level, player position, speed and
power state, enemy slots, the frame counter.

- **Skill: `find-variable`.** Differential search: snapshot RAM, make the
  value change in the game (lose a life, grab a coin, wait a second),
  snapshot again, keep the addresses that changed the expected way, repeat
  until one remains; then prove it by writing it and watching the HUD.
  Record an `address` entry with the value semantics (BCD, offset by one,
  per-slot arrays).
- **Tools:** missing the core of it: `snapshot_memory {mem_type, name}` and
  `diff_memory {a, b, filter: changed|increased|decreased|equals N}` over
  the 2 KiB of work RAM, pure and cheap; `read_memory` and `write_memory`
  exist for the proof. `lookup_symbol` gives the candidate's reference name.
- **SMB accelerator:** Data Crystal's 120 addresses and the disassembly's
  equates; the skill verifies each one it needs instead of searching.

## Sheet 4. The level data

The format a game stores its levels in, where each level lives in PRG, and
the pointer tables that get there.

- **Skill: `map-level-data`.** Trace the level loader: `trace_writes` with
  `mode: "read"` on a PRG range while a level loads (or `reset_emulator`
  into a level) to find which bytes the loader walks; `disassemble` the
  loader to read the format; find the pointer table by searching for the
  level's address bytes; record a `note` with the format and an `address`
  entry per level with its PRG offset and length. Prove by changing one
  object byte (ledgered) and watching the level differ after reset.
- **Tools:** `trace_writes` read mode, `search_memory`, `disassemble`,
  ledgered `write_memory`, `reset_emulator` exist. Missing: a trace that
  records the order of reads, not per-PC counts (the loader's walk is a
  sequence); a `note` type for the format; a per-level entry shape.
- **SMB accelerator:** the disassembly's `AreaDataAddrLow/High`,
  `EnemyDataAddr*`, and the area-object decoder are all labeled, and the
  format is documented in community docs; the skill still proves it live.

## Sheet 5. The routines

NMI, the scroll split, the palette loader, the level loader, physics
constants, the timer countdown, the lives decrement, the object spawner.

- **Skill: `map-routines`.** Start from the vectors (`read_memory` at
  `$FFFA`) and from traces (who writes `$2005`, who writes the lives
  address), `disassemble` from each PC until a return, name the routine from
  what it touches, record an `address` entry of kind `routine` with its
  range and the constants inside it (jump impulse, run speed), each a
  ledgerable byte.
- **Tools:** `disassemble`, `trace_writes`, `convert_address`, the ledger
  exist. Missing: an exec hook (`trace_exec {address}`: when does this PC
  run, how often, called from where) which Mesen's `emu.callbackType.exec`
  gives us in the same two-phase shape as `trace_writes`; `lookup_symbol`
  for names.
- **SMB accelerator:** the whole thing is labeled; the skill confirms the
  entry points and constants by trace and records them.

## Order for SMB

1. Reference import (ADR-0017): Logan clones the ca65 port beside his ROM,
   builds it, `scripts/import-reference.mjs` makes `reference.json`;
   `lookup_symbol` lands. One session proves it: "what writes the lives
   counter" answered by name in two calls.
2. Sheet 3 tools (`snapshot_memory`, `diff_memory`) and `find-variable`,
   because it is the most asked hack ("infinite lives") and the smallest
   build.
3. Sheet 1 across SMB's scenes with `map-scene`, plus the `note` type and
   label-from-the-view, because every other sheet's entries hang off these
   names.
4. Sheet 2 as a split of `persist-edit`.
5. Sheet 5's `trace_exec` and `map-routines`.
6. Sheet 4 last: the biggest and the one that makes "a rewritten game" mean
   rewritten levels.

Each step ends with a `promote_mappings` commit to `mappings/`, so the SMB
map grows in the repo as the gate requires, and with the skill written from
the session that did it.
