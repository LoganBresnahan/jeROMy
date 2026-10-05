# ADR-0009 build plan: persistent edits, ledger, patch export

Produced by the `adr-plan` workflow on 2026-10-05 (12 slices, 14 agents),
edited by Claude the same night. Intent lives in
`docs/adr/0009-persistent-edits-ledger-and-patch-export.md`; roadmap item 10
tracks it. Facts established live before planning finished: SMB stores its
level palettes in PRG ROM as `0F 29 1A 0F 0F 36 17 0F ...` with the backdrop
(`$22`) in a separate table, so a search for `22 29 1A 0F` finds nothing and
`0F 29 1A 0F` finds the table; `emu.convertAddress($8000)` → `prgRom` 0;
`emu.reset()` keeps the emulator's in-memory PRG edits (a byte written with
`write_memory prgRom` reads back after reset and the palette shows it).

## Phases

### 0. Landed before the plan (2026-10-05)

`search_memory` (Lua scan capped at 64 KiB per request, TypeScript chains
chunks with pattern overlap), `reset_emulator` (clears palette overrides
first, `emu.reset`), `convert_address` (adapter + handler). These are the
plan's `search-memory-tool`, `reset-emulator-tool` and the address seam of
`trace-writes-tool`.

### 1. Foundations (Opus, no bridge) — `hack-dir-store`, `mapping-schema-v2-rom-origins` — DONE 2026-10-05

`src/hacks/store.ts` (`HackStore`: edits with stable `seq`, discoveries, atomic writes), `hacksDir` config on the plugin and service, schema v2 (`schema: 2` separate from the `version` revision counter; `rom_origins` on tiles, palettes, addresses; merge adds origins to existing entries without renaming; prompt prints them; `record_mapping` takes and validates them).

- `src/hacks/store.ts`: `hacksDir` config (default `<repo>/hacks`,
  threaded like `mappingsDir`), `hacks/sha1-<sha1>/` with `edits.json`,
  `discoveries.json`, `notes.md`; mkdir on first write; write temp then
  rename. Entry shape `{ mem, offset, length, old, new, at, reason, tool }`.
- Mapping schema v2: optional `rom_origins: [{mem, offset, length}]` on
  palette/tile/address entries; `version` 2; loader accepts 1 and 2;
  `record_mapping` takes `rom_origins`; prompt formatter prints them.
  Unit tests over temp dirs. Ends in /shipshape.

### 2. Fable batch — `patch-format-writers` and `trace-writes-tool` — DONE 2026-10-05

`trace_writes`: two-phase, per-PC aggregation with an event cap (4096 recorded, counting continues), `max_writers`, PCs resolved through `convertAddress` at completion, refused while paused, `mode: read` for reads, `mem_type: ppu` for PPU address space. Live: `$2005` for 60 frames → 4 writer PCs (`0x8EE9/0x8EEC` the vblank pair, `0x8162/0x8168` the split pair) with PRG origins, 360 accesses, no visible stall; a cold address returns no writers with the "trigger the event" note.

`src/hacks/patch.ts`: iNES layout (header, trainer, PRG/CHR starts), CRC32 (IEEE check value pinned), IPS writer (EOF-offset guard, 65535 splits, small-gap run merging) and BPS writer (beat varints, SourceRead/TargetRead), each checked by an **independent applier** in the tests plus a seeded fuzz. Live: the SMB `$29→$16` edit exported as a 14-byte IPS whose one record a hand parser read back at file offset 0xCDC = 16 + 0xCCC.

- `src/hacks/patch.ts`: CRC32 (hand-rolled, no dependency), IPS writer
  (split records > 65535, refuse offsets ≥ 0x1000000 and the `EOF` offset
  0x454F46), BPS writer (varints, action words, SourceCopy/TargetCopy, three
  CRC32s), and an **independent applier** for both formats used only by the
  tests, plus a fixture checked against a third-party tool if one is at
  hand. iNES header rule in one place: 16 bytes, plus 512 when flags6 bit 2
  (trainer); PRG offset = header; CHR offset = header + PRG size.
- `trace_writes`: two-phase Lua handler modelled on `capture_scroll_writes`;
  callback records `(pc from getState, address, value)` into a per-PC
  table, capped (writers ≤ 64, events counted not stored); `complete`
  resolves each PC with `convertAddress` once (document: per-PC bank at
  completion time, exact on NROM); `trace_reads` is the same with the read
  callback type and must not count opcode fetches (use the read type, not
  exec). Paused: refuse with the pending-while-paused error (the user steps
  or resumes; stepping two frames would trace a frame the game did not
  play). Adversarial check: a hot address (`$2005`, hundreds of writes a
  second) must not drop frames visibly over 60 frames; a cold one (`$075A`
  lives) returns the writer at the right PRG offset.

### 3. Ledgers and bridge tools (Opus) → /verify — `discoveries-ledger-on-disk`, `edit-ledger-auto-append` — DONE 2026-10-05

`src/agent/edit-ledger.ts`: `ledgeredRomWrite` reads before, writes, reads back, appends; `executeTool` takes the ledger as its last dependency; `write_memory` (prgRom/chrRom), `write_tile` and `write_sprite` (chrRom) go through it and carry `reason`; a missing ledger or a failed append is said in the tool text, never hidden. `MesenService` creates the `HackStore` on connect from the ROM SHA1, loads `discoveries.json` into the existing array, appends on every `record_mapping`, clears after `promote_mappings`. The undo seam is a direct adapter write (the wrapper lives only inside the tool cases).

- Discoveries: `MesenService` loads `discoveries.json` on connect for the
  ROM's SHA1 (replace array contents, not identity), appends on each
  `record_mapping`, clears after `promote_mappings` saves. Survives a dsh
  restart.
- Edit ledger: `write_memory` with `prgRom`/`chrRom`, `write_tile` and
  `write_sprite` with `chrRom` read the bytes before the write and again
  after (no 2bpp re-encode in TypeScript), then append; write failure means
  no entry; append failure is reported in the tool text. Core gets an
  `EditLedger` interface through `executeTool`'s deps; the dsh layer owns
  the instance. `undo_edit` needs a raw write path that bypasses the ledger
  (a `ledger: false` flag on the internal write helper), decided here.
  /verify: write a chrRom tile, read `edits.json`, re-read the 16 bytes.

### 4. Export and undo (Opus) → /verify — `export-patch-tool`, `export-rom-tool`, `undo-edit-tool` — DONE 2026-10-05

`export_patch` (ips/bps, self-checked with the independent applier before writing, `verify: true` dumps PRG/CHR in 4 KiB chunks and lists bytes the ledger does not explain), `export_rom` (`<name>.hacked.nes` beside the ledger, original never written, path from `get_rom_info` through `windowsPathToWsl`), `undo_edit` (raw adapter write, read-back, entry removed). Live (session `ba57b41e`): IPS and `.hacked.nes` written; the hacked copy handed to Mesen booted with **red bushes** on the title screen from a clean start; original restored.

- `export_patch` (IPS default, BPS on request) from the ledger with the
  header rule; `verify: true` dumps PRG and CHR through `read_memory` in
  4 KiB chunks and diffs against the original file (Windows path from
  `get_rom_info` via `wslpath`). `export_rom` applies the ledger to a copy:
  `hacks/sha1-<sha1>/<name>.hacked.nes`; never touches the original; the
  description says derived copies are for the user's own use.
- `undo_edit` by ledger index writes `old` back through the raw path and
  removes the entry.
- /verify: patch exported, `.hacked.nes` loaded through
  `scripts/mesen-up.sh <path>` and screenshotted, undo restores bytes,
  original ROM byte-identical afterwards (SHA1 from `get_rom_info`).

### 5. Integration (Opus) → /verify — `persist-edit-skill-and-trio-check`

One real SMB recolor through dsh on deepseek-flash: find the palette table
with `search_memory`, patch it, `reset_emulator`, confirm, `record_mapping`
with `rom_origins`, `export_patch`. Replay the session, write
`skills/persist-edit/SKILL.md` from what worked, add `trio.sh persist` whose
pass criteria parse the raw results (ledger entry present, reset survived,
patch file exists and applies). Tick roadmap item 10.

## Critical path

`hack-dir-store` → `edit-ledger-auto-append` → `export-patch-tool` →
`undo-edit-tool` → `persist-edit-skill-and-trio-check`; `patch-format-writers`
gates phase 4 in parallel.

## Notes from the assessors

Only two slices warrant adversarial verification: the patch writers (the
failure mode is a golden fixture written by the same mind as the encoder)
and `trace_writes` (callback cost on the emulation thread, PC source, bank
at completion time). Everything else is Opus-grade with temp-dir unit tests
and the named mocked-adapter tests. Sequencing risks: the undo seam must be
chosen before the ledger wrapper lands, and the iNES header rule must live
in one module that both exporters import.
