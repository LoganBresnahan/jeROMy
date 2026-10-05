# ADR-0017: Reference material is imported at the person's request, verified live, and promoted entry by entry; never vendored

**Status:** Accepted (2026-10-05, Logan: "oh yes please do, I remember that being the original plan")
**Date:** 2026-10-05

## Context

Release gate 1 (`docs/DIRECTION.md`) is Super Mario Bros. mapped end to end:
graphics and their objects, where they come from in PRG, the RAM a hacker
reaches for, the level data format, the routines. Discovering all of that
from clicks and traces alone is months of sessions. The community already
did most of it:

- **doppelganger's `smbdis.asm`**, a complete labeled disassembly. The ca65
  port ([threecreepio/smb-disassembly](https://github.com/threecreepio/smb-disassembly))
  builds only with the person's own `Super Mario Bros. (World).nes` beside
  it (CHR is extracted from it) and emits `main.nes.dbg`, a cc65 debug
  file that lists every label and equate with its address, which Mesen's
  debugger can load for source-level stepping. The asm6f port
  ([Xkeeper0/smb1](https://github.com/Xkeeper0/smb1)) ships the CHR and
  assembles to the ROM outright. Neither carries a license; the header says
  "provided for your own use as-is".
- **Data Crystal's RAM map and ROM map** for SMB
  ([RAM](https://datacrystal.tcrf.net/wiki/Super_Mario_Bros.:RAM_map),
  [ROM](https://datacrystal.tcrf.net/wiki/Super_Mario_Bros.:ROM_map)),
  GFDL 1.2: about 120 RAM addresses with names, and the palette, tilemap,
  text and mechanics tables with offsets. No level format.

A full disassembly contains every PRG byte as `.db` lines: it is the ROM in
another spelling. Committing it, or having the plugin download it, would
cross the first bright line ("never ship or fetch ROMs") in substance while
honouring it in letter. At the same time, label names and address
knowledge are exactly what the mapping files exist to hold, and they are
only worth holding once the emulator has confirmed them.

## Decision

1. **Nothing ROM-equivalent enters the repo or is fetched by the plugin.**
   A disassembly is downloaded by the person, at their own request, into
   the gitignored hack directory: `hacks/sha1-<sha1>/reference/`. The
   README gives the one `git clone` line and says why it is theirs to run.
   The same holds for any game: references live beside the hack, keyed by
   the ROM they describe.
2. **A script turns a reference into symbols.** `scripts/import-reference.mjs`
   reads a cc65 `.dbg` file (labels and equates with exact addresses; the
   preferred form, since it comes out of a build against the person's ROM)
   or, as a fallback, an assembler source for `Name = $addr` equates, and
   writes `hacks/sha1-<sha1>/reference.json`: `{ source, imported_at,
   symbols: [{ name, address, kind, size?, file?, line? }] }`. Wiki tables
   pasted into a CSV import the same way with `kind: "wiki"`. The file is
   gitignored with the rest of the hack directory.
3. **The model reads symbols through one tool, `lookup_symbol`.** By name
   or by address (nearest label at or below, with the distance), from the
   current ROM's `reference.json`; every answer says the source and that
   it is unverified until a live observation agrees. `trace_writes`
   writers, `disassemble` output and `convert_address` results gain a
   symbol name beside the raw address when one is known, marked as
   reference. Nothing is injected wholesale into the prompt: 3,000 labels
   are a lookup, not context.
4. **Promotion stays entry by entry, after a live check, with attribution.**
   `record_mapping` gains `source` (free text such as "smbdis via
   threecreepio ca65 port" or "Data Crystal RAM map, GFDL 1.2") and the
   mapping schema stores it. An entry promotes to `mappings/sha1-*.json`
   only when a session saw the fact in the emulator (the lives counter
   decremented at that address, the palette table's bytes matched the PPU);
   the reference is how the model knew where to look, not the proof. The
   promoted entry is written in our words with the reference credited; no
   wiki prose or disassembly text is copied in.
5. **Mesen may load the `.dbg` too.** When the ca65 build exists, the
   person can load `main.nes.dbg` in Mesen's debugger for labeled
   stepping; the bridge does not depend on it.

## Consequences

- The SMB campaign starts with a complete symbol table instead of a blank
  page: a `trace_writes` on the lives address names `NumberOfLives` and the
  routine that writes it; the level loader is a lookup away. The model's
  job becomes verifying and recording, which is the fast path to gate 1.
- Every other game starts without a reference unless its community has
  one, which is why the discovery skills (`docs/plans/mapping-campaign.md`)
  must work from the emulator alone; the reference is an accelerator the
  skills check against, never a step they require.
- Two files to maintain: the import script with its parsers, and a
  `source` field through `record_mapping`, the schema and `promote_mappings`.
- A person who never downloads a reference loses nothing; `lookup_symbol`
  says "no reference for this ROM" and the skills carry on.

## Alternatives

- **Vendor the disassembly or a trimmed label list in the repo.** The
  trimmed list is defensible, the full file is not, and the line between
  them would be argued forever. Rejected: the hack directory is where
  per-ROM material lives already.
- **Pre-fill `mappings/sha1-<smb>.json` from Data Crystal under GFDL.**
  Legal, but it would ship 120 addresses nobody here verified, under a
  license that does not match the repo's, as if they were discoveries.
  Rejected; import to the reference, verify, promote with credit.
- **Put the symbol table in the prompt section.** Thousands of names on
  every request. Rejected; a tool.

## Revisit triggers

- A reference with a clear free license and a verified-by-us claim for
  every line; then a curated subset could ship as a seed mapping.
- Mesen exposes loaded debug symbols to Lua; then `lookup_symbol` can read
  the emulator's own table instead of ours.
