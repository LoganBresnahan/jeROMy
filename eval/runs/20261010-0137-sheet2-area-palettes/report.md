# Report: 20261010-0137-sheet2-area-palettes

Three sheet-2 lines on SMB: where the underground, water and castle
palettes come from in PRG ROM. One blind task; the worker reached each area
through the mapped area index, read the palette RAM, searched PRG for the
colors and proved each table with a ledgered write in a throwaway hack.
deepseek-flash, $0.22, 211 tool calls, about 15 minutes. The first run with
web tools disabled (ledger F17): no `web_` call. Held back as holds: the
area-type and palette-selector bytes, the palette-loading routine, the
three scene entries and three notes, all of which named the PRG palette
records an earlier run had found in passing.

## Distribution

| Stage | Count |
|---|---|
| lines in scope | 3 |
| recorded / reached proof | 3 / 3 |
| derived (search hit before the record) | 2 (underground, water) |
| graded right (reference) | 3 |
| graded wrong | 0 |
| promoted | 3 |
| cost (USD), tool calls, wall time | 0.22, 211, 890 s |

| line | claim | reference | proof |
|---|---|---|---|
| B1.underground_palette | `$8CEF-$8D0E` | UndergroundPaletteData | write+reset+look |
| B1.water_palette | `$8CA7-$8CC6` | WaterPaletteData | write+reset+look |
| B1.castle_palette | `$8D13-$8D32` | CastlePaletteData | write+reset+look |

Each claim is the 32 palette bytes inside a record, after its three-byte
VRAM header. Hack hygiene: every write was in `eval-sheet2-palettes` and
undone (its ledger held no edits at the end; removed after the run); the
`default` ledger's checksum is unchanged (`e10ff823…`); the active hack is
`default`.

## The change this run argues for

None. Sheet 2 is at 8 of 10 (left: the enemy sprite layout table and the
CHR origin of a tile).
