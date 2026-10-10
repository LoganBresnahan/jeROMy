# ADR-0025: The model sees tiles through view_tiles, undoes ROM edits newest first, and reaches the game's bytes only through the tools

**Status:** Accepted (2026-10-10, Logan: "document and fix all")
**Date:** 2026-10-10

## Context

With SMB mapped (roadmap item 18, 89/89 lines), Logan ran the first session
that used jeROMy as a person would: "Instead of playing as mario, I would
like to play as bowser" (dsh session `ff5f8d4d`, `deepseek-flash`, 176 tool
calls, about $0.85). It ended with five hand-drawn CHR tiles in hack
`logan-1` that the model itself called "a small red monster", and the
replay showed six separate failures:

1. **Out-of-order undo left an unrecorded change.** The model tested by
   writing `$50 $50` into the player-form table (`prgRom 0x6ED3`, ledger
   #1), then wrote the originals back as a new edit (#2), then undid #1 and
   then #2. Undoing #2 restored #2's old bytes, which were #1's test bytes:
   the emulator's PRG held `$50 $50` with an empty ledger, and the model
   then redrew tiles `$50`/`$51` because the game was drawing its leftover.
2. **`export_rom` named the file `logan-1-bowser`**, without `.nes`, and the
   model's link to `logan-1-bowser.nes` pointed at nothing.
3. **No way to see a pattern table.** To find Bowser's tiles the model
   needed to look at the CHR; it had `read_tile`, one 8×8 grid at a time.
   It rendered a PNG with Python through the shell, could not read it
   back, and asked for a sandbox escalation to do so.
4. **The shell reads anything.** The `jeromy` preset keeps a read-only
   shell (roadmap item 11); the model used it to open the ROM file and to
   `find` `.nes` files, and the directory it read holds the disassembly
   source. Nothing was written. No eval run had a shell (the headless
   profile has none; audited over every `eval/runs/*/streams`).
5. **The mapping held the answer and the model did not read it.** The
   promoted note on the enemy sprite layout table gives its bounds and the
   Goomba's row; Bowser's four rows are inside those bounds (`prgRom
   0x6810`–`0x6827`), unnamed. The model played to 1-4 instead, twice to
   game over.
6. **It teleported.** Writing the player's and the camera's position bytes
   to skip the castle, the failure `play-to-reach` exists for (ledger F16);
   it never loaded the skill.

## Decision

1. **`undo_edit` refuses an entry that a later entry overlaps** (same
   memory, intersecting bytes), naming the later entries to undo first,
   newest first. Its description and the prompt say an edit is put back by
   undoing it, never by writing the old bytes as a new edit.
2. **`export_rom` adds `.nes`** to a given name and refuses a name with a
   path separator or `..`.
3. **A new tool, `view_tiles`**, returns an image: up to 256 tiles as a grid
   with a hex column header and row labels (tile id = row label + column;
   `B` and `D` drawn lowercase so they never read as `8` and `0`), or an
   explicit list of tile ids drawn edge to edge in `columns` (a sprite layout
   table's row shown as the object it makes), colored by a live palette or
   by four fixed distinct colors. It reads through `ppuDebug` (what the PPU
   sees, tiles 0-511) or `chrRom` (every bank), in 1 KiB bridge reads, all on
   the TypeScript side; no Lua change. The PNG encoder is `node:zlib`; no
   new dependency.
4. **The prompt says the game's bytes come through the tools**, never the
   shell, and names `view_tiles` for seeing many tiles. This is a rule, not
   a wall: the shell stays (Logan's item 11 call), and dsh's read-only
   sandbox has no per-path read deny. `docs/issues.md` keeps it open.
5. **Two more prompt rules from the replay:** read what the mapping's
   tables already hold before playing to find something; reach far places
   by playing (`play-to-reach`, whose `whenToUse` now names a castle's
   boss), never by writing position or camera bytes.
6. **The mapping gap is an eval line, not a hand edit.** `eval/spec/smb.json`
   v22 adds `B3.enemy_rows` (name every row and the table's first and last
   row), judged against the disassembly's row comments, and runs through
   the loop like any other line (ADR-0020). Writing the names into the
   mapping from the disassembly would make the reference the search
   (ADR-0019).

## Consequences

- An out-of-order undo is now an error the model must read and follow; a
  ledger can no longer disagree with the emulator through `undo_edit`.
  `use_hack` already reverts newest first and is unchanged.
- `view_tiles` is a 42nd core tool and one more image a turn may carry; a
  full sheet is 429×415 px, an assembled metasprite 64 px per tile.
- Live, the assembled image of Bowser's front and rear rows was
  byte-identical to a render made from the ROM file, and `deepseek-flash`
  still called it "a green turtle-like creature". The tool shows the right
  pixels; naming a 32×24 pixel-art object is a limit of the worker's vision.
  The B3.enemy_rows runs measured it: three repeats drew every row right and
  named 10-12 of 43, Bowser in none (`eval/runs/20261010-1152-sheet2-enemy-rows-r3`,
  ledger F21). They did find the table's true bounds, which corrected the
  mapping's note (ledger F22).
- Logan's `logan-1` keeps its five edits; #4 and #5 (tiles `$50`/`$51`)
  were made against the leftover bytes and may belong to another of
  Mario's frames. That is his call; the emulator was restarted clean.

## Alternatives

- **Disable the shell in the `jeromy` preset.** Closes item 4 outright, and
  loses the shell Logan chose to keep for reading his own files. Revisit if
  the rule is broken again.
- **Ledger the inverse on undo** (an undo as a new entry). Keeps history,
  but the ledger is the hack, and a hack whose ledger holds a write and its
  inverse exports a no-op patch with noise in it; ADR-0009 already chose
  removal.
- **Render the pattern table in the emulator view only.** The person can
  see it there already (`chr_tile` in the picker); the model cannot, which
  was the failure.
- **Label the enemy rows in the mapping by hand from the disassembly.**
  Faster, and it makes the reference the search (decision 6).

## Revisit triggers

- A session reads ROM files or reference material through the shell after
  the prompt rule: disable the shell in the preset, or ask dsh for a
  per-path read deny.
- The B3.enemy_rows runs cannot name the rows from `view_tiles` images: the
  naming needs a second signal (where the enemy appears, a screenshot of
  the enemy in play), or a stronger vision model for that step (ADR-0024
  Open 1).
- A ledger and the emulator disagree again (`export_patch verify: true`
  differences with no session writing behind the ledger).
