# Super Mario Bros. (World) map coverage

Release gate 1 (`docs/DIRECTION.md`): one line per thing a person would
point at, ticked with the session that proved it live and promoted it into
`mappings/sha1-33d23c2f2cfa4c9efec87f7bc1321ce3ce6c89bd.json`. The sheets
are those of `docs/plans/mapping-campaign.md`. A line is ticked only when a
session saw the fact in the emulator; the reference (ADR-0017) may name it
afterwards, and `scripts/score-mapping.mjs` records whether it agrees.

## Sheet 3. The RAM a hacker reaches for

- [x] Lives: `$075A`, stores lives minus one; the "WORLD 1-1 x N" card
      shows value + 1. Blind differential search, session `b3d6d3a5`
      (2026-10-06, `trio.sh --blind variable`); reference agrees
      (`NumberofLives`).
- [ ] Player screen X: `$03AD` (candidate from a 2026-10-05 session;
      reference agrees, `Player_Rel_XPos`). Needs a proof by write before
      it counts as more than a candidate.
- [ ] Coins (`$075E` per the reference; unproven)
- [ ] Timer (three BCD digits at `$07F8` per the reference; unproven)
- [ ] Score
- [ ] World and level
- [ ] Player X page and position, Y, speed, power state
- [ ] Enemy slots (per-slot arrays)
- [ ] Frame counter: `$09` seen counting once a frame in every `play`
      check (2026-10-05); not yet recorded.

## Sheet 1. What the pictures are

- [ ] Title screen, HUD, overworld tiles, underground, water, castle,
      player and enemy sprites, items and effects; palettes per scene.
- [x] Pipe/bush green is background palette 0 slot 1, `$29`, copied from
      the PRG palette table (2026-10-05, `persist-edit` session; the
      red-pipe hack).

## Sheet 2. Where the pictures come from

- [x] The area palette table in PRG (origin of the `$0F $29 $1A $0F` row),
      ledgered and exported (2026-10-05).
- [ ] Metatile graphics tables, sprite layout tables.

## Sheet 4. The level data

- [ ] Area pointer tables, the area/enemy object format, each level's PRG
      range.

## Sheet 5. The routines

- [ ] NMI, the scanline-31 scroll split, the palette loader, the level
      loader, the lives decrement, physics constants.
