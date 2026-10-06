---
name: persist-edit
description: Make a change permanent in the ROM, not just in the running game. Find where the bytes the game copies into RAM or palette RAM live in PRG/CHR ROM, write them there (ledgered), prove it with a reset, record the origin, and export a patch. Use when the user says "permanently", "save this to the ROM", "make a patch", or asks whether a change will survive a restart.
whenToUse: The user wants a change kept beyond this session, asks for a patch or a hacked ROM file, or asks why an edit disappeared after a reset or level change.
user-invocable: true
---

# Persist an edit

A `write_palette` or RAM write is volatile: the game rewrites it on the next
level load, and a reset erases it. A persistent edit changes the bytes the
game copies *from*, in PRG ROM or CHR ROM. Every such write is ledgered in
`hacks/sha1-<sha1>/<hack>/edits.json` (the active hack, ADR-0018) with its old bytes, so it can be undone and
exported. Procedure from the 2026-10-05 run on Super Mario Bros. (World)
(ADR-0009): recoloring the pipe/bush green `$29` to red `$16`.

## Steps

1. **Make it visible first, cheaply.** `write_palette` (or the RAM write)
   and a screenshot prove which palette slot or address controls the thing.
   Note the exact byte values you need to find (SMB pipes: palette 0 slot 1
   is `$29`; the full row reads `$0F $29 $1A $0F`).
2. **Find the origin.** `search_memory` in `prgRom` for the bytes as a run
   (`hex: "0F 29 1A 0F"`). The backdrop (`$22` on SMB) is stored separately,
   so search the row without it. One hit is the table; several hits need
   context: `read_memory` 32 bytes around each and pick the one whose
   neighbours are the other palettes. If the search finds nothing, the
   bytes are computed or compressed: `trace_writes` on the RAM/palette
   address (`mem_type: "ppu"` for `0x3F01`) over 60-180 frames while the
   game writes it (resume, or `reset_emulator` and trace during boot) gives
   the writer's PC and its PRG offset; `disassemble` around it to see the
   table it reads.
3. **Write the ROM byte with a reason.** `write_memory` with `mem_type:
   "prgRom"` (or `chrRom`, or `write_tile` with `target: "chrRom"`), one
   change, `reason` saying what and why. The result carries
   `persistent: true` and `ledger.seq`; if it says `ledger_warning`, stop and
   say so.
4. **Prove it with a reset.** `reset_emulator`, then `get_palette` (or
   `read_memory`) shows the new value, and `get_pixel_color` on a pixel of
   the object confirms the render. On SMB the title screen already shows
   bushes; you do not need to step frames to reach gameplay.
5. **Say what else changed.** A palette slot is shared: on SMB slot 1 of
   palette 0 is the pipe rim and bush light pixels, slot 2 (`$1A`) the pipe
   body and hill. Name the result honestly ("red rim, green body").
6. **Record the origin.** `record_mapping` for the palette (or tile or
   address) with `rom_origins: [{mem: "prgRom", offset, length, notes}]` and
   `confidence: 1` only after the reset proved it. Next time the recolor is
   a direct write.
7. **Export.** `export_patch` (`ips` by default; `bps` refuses the wrong
   ROM) writes `<hack>-v<N>.ips` in the active hack's directory, never
   overwriting an earlier version (ADR-0018), and self-checks it with an
   independent applier; `verify: true` also diffs the emulator against the
   ledger. `export_rom` writes `<name>.hacked.nes` for the user to load
   (`scripts/mesen-up.sh <path>`); the original is never touched.
8. **Undo is `undo_edit seq`.** It writes the old bytes back and removes the
   entry; `reset_emulator` afterwards if the game already copied the bytes.

## Traps seen

- `save_state` snapshots gameplay state (RAM, PPU), not ROM edits; undo a
  ROM edit with `undo_edit`. After Mesen reloads the ROM the emulator's copy
  is clean while the ledger still lists the edits: the prompt says so, and
  `reapply_edits` puts them back (never on its own).
- Stepping thousands of frames to "reach gameplay" burned most of the run;
  the title screen or `get_palette` already proves a palette change.
- `search_memory` with the backdrop included (`22 29 1A 0F`) finds nothing
  on SMB.
- Stepping thousands of frames while paused to "see gameplay" is the most
  expensive way to prove a palette change; `get_palette` after
  `reset_emulator` proves it in one call.

## Report shape

Origin: `<mem> 0x<offset>` (found by <search|trace>). Wrote `$old → $new`,
ledger #<seq>, reason "<…>". After reset: <palette/pixel evidence>. Also
affected: <shared users>. Recorded: <mapping entry with rom_origins>.
Exported: <patch path> (<bytes>), <hacked ROM path if made>.
