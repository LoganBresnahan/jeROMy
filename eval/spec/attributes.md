# What "mapped" means: the attributes of an NES game a hacker can change

Draft, 2026-10-09, for Logan to ratify (ADR-0020 §1). Each attribute class
says what it is, how an entry for it is recorded in the mapping file, how a
claim about it is graded, and what proof a line needs before it counts.
Classes map onto the five answer sheets of `docs/plans/mapping-campaign.md`;
the sheet number is in the heading. Per game, `eval/spec/<game>.json` lists
the instances.

Two columns run through everything:

- **Edit path.** Every attribute names how it is changed live (a RAM,
  palette, OAM or nametable write that vanishes on reset) and how it is
  changed for good (a ledgered PRG/CHR write at the origin, ADR-0009/0018).
  A line is fully mapped only when both paths are known. This is what ties
  release gate 1 (mapped) to gate 2 (a hack you can boot).
- **Grader.** `reference` where the imported disassembly or RAM map can
  answer; `claude` (from an image) where only looking can; `both` where the
  reference names the table and the image shows the picture.

Schema gaps are marked **[schema]**: the mapping file cannot hold that entry
today (`src/mappings/types.ts`), so the loop's first changes are there.

## A. Graphics (sheet 1: what the pictures are)

| Attribute | What it is | Recorded as | Grader | Proof |
|---|---|---|---|---|
| A1 Scene | A distinct visual state: title, HUD, overworld, underground, water, castle, bonus, ending. Each has a tile set, a palette set, a scroll behaviour. | **[schema]** `scene` entry: name, how to reach it (a `play_input` script or a save state), its palettes, its background pattern table | claude | a screenshot in that scene, named |
| A2 CHR tile | One 8x8 pattern, in pattern-space (0-511), named and grouped | `tile`, keyed **[schema: key must carry the pattern table]** | claude (reference can say which table a scene uses) | `read_tile` output read against the screenshot |
| A3 Metatile / background object | A group of tiles that is one thing to a person: brick block, question block, pipe top, cloud, bush, the title logo | `tile` entries sharing a `group`, plus **[schema]** a metatile entry: tile ids, arrangement, palette | both (reference: the metatile tables; claude: the picture) | `get_region` in object mode, named |
| A4 Metasprite | The OAM layout of one object: small Mario, big Mario, Goomba, Koopa, fireball, coin | `sprite` entry **[schema: needs per-tile offsets and flips, and animation frames]** | both (reference: sprite layout tables; claude: `list_sprites` + screenshot) | `list_sprites` hit on the object, named |
| A5 Palette slot role | Per scene, which of the 8x3 colour slots paints what ("background 0 slot 1 is pipe and bush green") | `palette` entry **[schema: keyed by scene + palette, not palette alone]** | claude; reference for the table it came from | `write_palette`, look, `clear_palette_overrides` |
| A6 Fixed layout | Nametable contents of a static screen: title screen, HUD row, the "WORLD 1-1" card | **[schema]** `note` or a `layout` entry with the nametable region and what each run of tiles is | claude | `read_nametable` against the screenshot |
| A7 Text and font | Which tiles are the font, and where strings live (HUD labels, "GAME OVER", "TIME UP") | `tile` group `font`; **[schema]** string entries with their ROM origin | both | the string found by `search_memory` and changed, looked at |

## B. ROM data origins (sheet 2: where the pictures come from)

| Attribute | What it is | Recorded as | Grader | Proof |
|---|---|---|---|---|
| B1 Palette table | The PRG bytes a scene's palettes are copied from | `rom_origins` on the `palette` entry | reference (table label and size) | ledgered write, `reset_emulator`, look |
| B2 Metatile table | The PRG tables that say which tiles compose each metatile | `rom_origins` on the metatile entry | reference | ledgered write of one tile id, reset, look |
| B3 Sprite layout table | The PRG tables that say which tiles compose each metasprite | `rom_origins` on the `sprite` entry | reference | ledgered write, reset, look |
| B4 String table | Where a string's bytes live | `rom_origins` on the string entry | both | ledgered write, reset, look |
| B5 CHR origin | For CHR-ROM games: a tile's bytes are its own origin; for CHR-RAM games: the PRG bytes copied into CHR | `rom_origins` on the `tile` entry | reference (CHR-RAM copy routine); trivial for CHR-ROM | ledgered `write_tile`, reset, look |
| B6 Music and sound tables | Note data, headers | **[schema]** `note` | reference | trace only; no proof by look (out of scope for the first campaign unless Logan says otherwise) |

## C. RAM state (sheet 3: the RAM a hacker reaches for)

| Attribute | What it is | Recorded as | Grader | Proof |
|---|---|---|---|---|
| C1 Progress counters | lives, coins, score, timer, world, level, area type, continue count | `address` with value semantics (BCD, offset, digit order) **[schema: a `format` field instead of prose]** | reference | `write_memory`, look at the HUD or the card |
| C2 Player state | x (page + fine), y, x and y speed, facing, power state, animation frame, invincibility timer, crouch, swim | `address` | reference | write, look (Mario moves, grows, flips) |
| C3 Object slots | Per-slot arrays: type, x, y, state, timer; the slot count | `address` **[schema: a `stride`/`slots` field for arrays]** | reference | write a slot's type, look |
| C4 Engine state | frame counter, RNG, game mode, pause flag, scroll position, level-loaded flags, controller mirrors | `address` | reference | write or watch (`play_input` `watch`), look |
| C5 Save RAM | battery-backed state at `$6000+` for games that have it | `address` with `mem_type: workRam/saveRam` | reference | write, reset, look |

## D. Level data (sheet 4)

| Attribute | What it is | Recorded as | Grader | Proof |
|---|---|---|---|---|
| D1 Area format | How a level's objects are encoded (SMB: 2-byte area objects, 2-byte enemy objects, terminators) | **[schema]** `note` with the format, or a `format` entry | reference (the decoder routine) | one byte changed, reset, the level differs as predicted |
| D2 Pointer tables | The tables from world/level to area data | `address` with `mem_type: prgRom` **[schema: a `table` kind with entry size and count]** | reference | redirect one entry, reset, a different area loads |
| D3 Per-level range | Each level's PRG offset and length, by world-level-area | **[schema]** `level` entry: id, offset, length, header fields | reference (level data labels and sizes) | one object byte changed, reset, look |
| D4 Level header | Per-level time, music, palette set, start position, scroll type | part of the `level` entry | reference | header byte changed, reset, look |

## E. Code (sheet 5: the routines)

| Attribute | What it is | Recorded as | Grader | Proof |
|---|---|---|---|---|
| E1 Vectors | reset, NMI, IRQ entry points | `address` kind `routine` **[schema: a `routine` kind with range]** | reference | `read_memory` at `$FFFA`, `disassemble` |
| E2 Frame structure | the NMI body, the game-mode dispatch, where the main loop waits | `routine` | reference | `trace_exec` (missing tool), `disassemble` |
| E3 Rendering | scroll split (scanline, register writes), palette loader, nametable column writer, sprite drawer | `routine`; the split as a `note` | reference | `trace_writes` on `$2005/$2006`, `capture_scroll_writes` |
| E4 Loaders | level loader, enemy spawner, area decoder | `routine` | reference | `trace_writes mode: read` on the level range while it loads |
| E5 Gameplay | physics constants (gravity, jump impulse, walk and run speed), timer countdown, lives decrement, coin increment, power-up handler, collision | `routine` with its constants, each a ledgerable byte **[schema: a `constant` kind]** | reference | ledgered write of the constant, reset, play, look |
| E6 Mapper and banking | which bank is in when (for MMC1/MMC3 games); the bank-switch routine | `routine` + `note` | reference | `trace_writes` on the mapper register |

## Out of scope for the first campaign

Music composition, sound effects, the PRNG's sequence, and anything that
needs listening. They are listed (B6) so the spec is complete; no line in
`smb.json` requires them until Logan says so.

## What the per-game file holds

`eval/spec/<game>.json`:

```json
{
  "game": "Super Mario Bros. (World)",
  "sha1": "33d23c2f2cfa4c9efec87f7bc1321ce3ce6c89bd",
  "spec_version": 1,
  "holdout": false,
  "lines": [
    { "id": "C1.lives", "class": "C1", "name": "lives counter", "grader": "reference",
      "proof": "write, look at the card", "status": "proven",
      "run": "20261006-b3d6d3a5", "verdict": "agrees", "entry": "addresses.0x075A" },
    { "id": "A5.overworld.bg0.1", "class": "A5", "name": "overworld background palette 0 slot 1",
      "grader": "claude", "proof": "write_palette, look", "status": "open" }
  ]
}
```

`status` is one of `open`, `attempted`, `proven`, `recorded`, `promoted`;
`verdict` is from `eval/README.md`'s vocabulary. A line's `run` names the
record that proved it. The human checklist is generated from this file when
wanted; it is not maintained by hand.
