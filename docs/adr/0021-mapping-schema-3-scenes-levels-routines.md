# ADR-0021: Mapping schema 3: scenes, levels, routines and notes are entries; tiles are keyed in pattern space; addresses carry format and extent

**Status:** Accepted
**Date:** 2026-10-09

## Context

ADR-0020 makes "mapped" a spec (`eval/spec/attributes.md`), and the spec
marks the things a run cannot record today `[schema]`. A blind session on
sheet 3 finds the timer as three BCD digits at one address and the score as
six; `record_mapping` has nowhere to put "three bytes, one decimal digit
each" except prose in `notes`, so the grader (`scripts/score-mapping.mjs`)
cannot tell a three-byte claim from a one-byte one, and the next session
cannot either. The same gap stops sheet 4 (a level's PRG range), sheet 5 (a
routine's entry PC) and sheet 1 (a scene; a tile whose id means a different
picture in each pattern table: SMB's `$24` is sky in the background table and
a slope in the sprite table, which the current mapping file spells out in a
name, `0x00 (CHR 0x100)`). Roadmap item 23 (c) asks for these as one change.

## Decision

1. **`record_mapping` gains four entry types**, each landing in its own
   record of the mapping file:
   - `scene` → `scenes[id]`: `name`, `notes`, `reach` (how to get there: a
     `play_input` script, a save state, "Start on the title").
   - `level` → `levels[id]` (`id` the game's own name, `1-1`): `name`,
     `notes` (header fields in prose until a header format earns a field),
     `rom_origins` (the PRG ranges of its data; the grader checks each lies
     inside one level's data).
   - `routine` → `routines[id]` (`id` the entry PC, hex): `name`, `notes`,
     `length` (bytes, when known).
   - `note` → one line appended to `notes[]` as `id: name: notes`, for
     what has no entry type yet (an area object format, a scroll split).
2. **Addresses carry their extent and encoding**: `length` (bytes from the
   address that are the same thing), `stride` and `count` (a per-slot
   array: `count` slots `stride` bytes apart), and `format` (free text with
   suggested values `binary`, `bcd`, `digits` (one decimal digit per byte),
   `minus-one` (stored value is the shown value minus one), `signed`,
   `flags`). The grader reads `length`, or `stride × count`, as the claim's
   extent.
3. **A tile's key is its pattern-space index when the table is known**:
   `record_mapping` takes `table` (0 for `$0000`, 1 for `$1000`) and keys the
   entry `chr:0x124` (table × 256 + id, three hex digits). An id already
   above `0xFF` is pattern space without `table`. A tile recorded without
   either keeps its bare id, as before: old files stay valid, and the key
   says it is ambiguous.
4. **`MAPPING_SCHEMA` becomes 3.** Files at 1 or 2 load unchanged; the new
   records are optional; a merge stamps 3. As before, a later discovery
   fills gaps and adds `rom_origins`; it never overwrites a name. The prompt
   section prints the new records.

## Consequences

- Sheet 3's multi-byte variables are graded on their real extent: a timer
  claimed as four bytes from `$07F8` is wrong, three is right
  (`eval/spec/falsify/`).
- Sheets 4 and 5 become recordable, so the loop can reach them without
  another schema change first.
- The mapping file grows three optional records. Readers that iterate only
  `tiles/palettes/sprites/addresses` (the old prompt formatter, third-party
  tools) see a valid file and skip what they don't know.
- Scene-keyed palettes (A5), per-tile metasprite layouts (A4), metatile and
  string entries (A3, A7) and a `constant` kind (E5) are still `[schema]` in
  the spec. They wait for a run that needs them, each a revision of this ADR
  or its successor.

## Alternatives

- **Everything in `notes`.** No schema work; the grader would parse prose,
  and a later session reads a paragraph instead of a field. The eval loop
  exists to make claims checkable.
- **A generic `entry` type with a free `kind` string.** One code path; but
  the grader and the prompt both need to know what a level or routine is,
  and a closed set lets the tool's schema tell the model.
- **Rekey all old tiles to pattern space now.** Cleaner file; needs each
  old tile's table, which only some notes state. Old keys stay; new ones are
  canonical.

## Revisit triggers

- A run records a level's header fields or a metasprite's layout in `notes`
  repeatedly: that is the next field.
- The prompt section grows past what a model reads usefully once levels and
  routines fill in: group or summarise them.
- A banked game's routines need a bank number beside the PC (the holdout is
  MMC1): add `bank` to `routines`.
