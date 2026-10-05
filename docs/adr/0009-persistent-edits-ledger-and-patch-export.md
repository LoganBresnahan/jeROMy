# ADR-0009: Persistent edits: find the ROM origin, keep a ledger, export a patch

**Status:** Accepted (2026-10-05, for the overnight run Logan authorized; items 6 and 8 shipped first as planned)
**Date:** 2026-10-05

## Context

Every edit the agent makes today lives in the emulator and dies with it.
Palette writes are per-frame overrides, tile writes go to CHR RAM, and even
writes to the `prgRom` / `chrRom` memory types only change Mesen's in-memory
copy. The mapping files (`mappings/sha1-*.json`) persist what we *know*
about a ROM; nothing persists what we *changed*. A "fully hacked ROM" needs
both, on disk, keyed by the ROM's SHA1, shareable.

Three facts shape the design. First, a visible thing and its ROM origin are
different addresses: SMB copies palette bytes from a PRG ROM table into
palette RAM at level start, so a permanent recolor edits the table, not
$3F01. Finding the table is the actual ROM-hacking work. Second, the bridge
already reads and writes `prgRom` and `chrRom`, and Mesen's Lua API offers
`addMemoryCallback` (per-access hooks by address range and memory type),
`convertAddress` (CPU address to ROM offset through the mapper), and
`reset`. Third, two patch formats matter: IPS (trivial: records of 3-byte
offset, 2-byte length, data; universally applied; no checksum; offsets are
file offsets, so the 16-byte iNES header shifts every ROM offset by 16) and
BPS (source/target CRC32s, so a patch refuses the wrong ROM).

The unpromoted-discoveries ledger from ADR-0003's carry-in has the same
durability need and the same key.

## Decision

1. **A hack directory per ROM: `hacks/sha1-<sha1>/`.** Files, not a
   database: `edits.json` (the edit ledger), `discoveries.json` (unpromoted
   `record_mapping` results), `patch.ips` / `patch.bps` (exports), and
   `notes.md`. Human-readable, diffable, shareable beside the mapping. This
   replaces the `ctx.storageDomain` plan for the discovery ledger: the person
   wants these on disk and visible, not in a harness store.
2. **The edit ledger records every ROM-targeted write automatically.**
   `write_memory` with `mem_type` `prgRom` or `chrRom`, and `write_tile` /
   `write_sprite` with target `chrRom`, append `{mem, offset, old, new, at,
   reason}` to `edits.json` before returning. Writes to RAM, palette RAM,
   CHR RAM and OAM are volatile by definition and are not ledgered; the
   `persist-edit` skill is how a volatile edit becomes a ROM edit. Old bytes
   are read before the write so every entry is reversible.
3. **Two discovery tools.** `search_memory`: find a byte pattern (with
   optional wildcards) in a memory type, returning offsets, capped. `trace_writes`:
   install a Lua write callback on an address range for N frames (default
   60, max 600), collect `{pc, rom_offset, value, count}` per writer using
   `convertAddress`, remove the callback, return the table. The callback
   body is one table update, no logging, no socket I/O; it runs on the
   emulation thread per access and must stay O(1). A read variant
   (`trace_reads`) is the same tool with a flag.
4. **Export and apply.** `export_patch` writes IPS by default (BPS when
   asked) from the ledger, header offset applied, and when `verify: true`
   instead dumps PRG and CHR from the emulator and diffs against the
   original ROM file (path from `get_rom_info`, converted from Windows to
   WSL), so edits made by any path are caught. `export_rom` applies the
   ledger to a copy of the original and writes
   `hacks/sha1-<sha1>/<name>.hacked.nes`. The original file is never
   modified. Producing a local derived copy of the user's own ROM is inside
   DIRECTION's bright line; distributing it is not, and the tool says so in
   its description.
5. **Verification is a reset, not a screenshot alone.** `reset_emulator`
   (Mesen `emu.reset`) plus the existing screenshot check proves a ROM edit
   survived; loading the exported `.hacked.nes` through `scripts/mesen-up.sh`
   is the final proof. The skill ends there.
6. **Mapping schema v2 records ROM origins.** Palette, tile and address
   entries gain optional `rom_origins: [{mem, offset, length}]`, written by
   `record_mapping` when the agent has found one. Next time, the recolor is
   a direct ROM write. `version` bumps to 2; the loader accepts both.
7. **One skill, `persist-edit`, written from the first real SMB run:**
   make it visible (volatile edit), find the origin (`search_memory` for the
   bytes just read, `trace_writes` on the target when the search is
   ambiguous, disassemble around the writer), patch the ROM copy, reset and
   confirm, record the origin, export. Per ADR-0008 it ships with a
   `trio.sh` check.

## Consequences

- A hack becomes two files anyone can apply: a mapping (knowledge) and a
  patch (changes), both keyed by SHA1. The repo's `mappings/` stays the
  shareable knowledge; `hacks/` is per-user by default (gitignored, with an
  opt-in to commit a hack as an example).
- Bank-switched games: `convertAddress` answers the ROM offset for the
  currently mapped bank; the ledger stores ROM offsets, never CPU addresses,
  so bank state at write time is captured correctly. Searches over PRG ROM
  are over the whole ROM, independent of banking.
- The Lua watchdog is not the constraint for `trace_writes` (callbacks run
  outside the 1 s `codeBreak` budget), but a slow callback drops emulated
  frames. Budget: the callback does one table increment; collection and
  JSON happen once at the end.
- `clear_palette_overrides` semantics (docs/issues.md) stop mattering for
  persistence: a ROM edit is undone by writing the ledger's `old` back,
  which `undo_edit` does by ledger index.

## Alternatives

- **Dump-and-diff only, no ledger.** Simplest export, but no `reason`, no
  per-edit undo, no reversibility without the original file at hand.
  Rejected as the only path; kept as `verify: true`.
- **Store the ledger in `ctx.storageDomain`.** Durable and typed, but
  invisible to the person and not shareable without an export step. The
  point is files on disk. Rejected.
- **Mesen's own save-state or cheat system.** Cheats are RAM patches that
  do not survive outside Mesen; save states are not ROM edits. Rejected.
- **Write the ROM file in place.** One accident destroys the user's only
  copy. Rejected; derived copies only.

## Revisit triggers

- A second console (SNES, GBA): header handling and address conversion
  differ; the ledger format stays, the export gains a per-system header
  rule.
- Hacks that need expansion (extra PRG banks): IPS cannot grow a file
  usefully; BPS or a custom builder becomes the default.
- `trace_writes` measurably drops frames on a hot address; then sample or
  move counting to the server side via a bounded event stream.
