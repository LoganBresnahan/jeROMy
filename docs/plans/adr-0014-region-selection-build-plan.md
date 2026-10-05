# ADR-0014 build plan: region selection by palette slot

Produced by the `adr-plan` workflow on 2026-10-05 (11 slices, 13 agents,
16 minutes; it ran against the half-built tree, so every slice came back
"partial"). Its five phases are the five below; its critical path was
handler → fill → blast radius → sentence → pick → overlay → live check →
docs. Its notes that changed the build: one scroll capture per pick (the
first cut took two; `pickPixel` now captures once and hands it to both the
tile lookup and the region fill), the refused-capture fallback decided as
"refuse with a clear message" for `get_region` and "pick without a region"
for the view, and the watchdog measurement taken paused over sprites, not
an empty corner. Source of truth for intent is
`docs/adr/0014-region-selection-by-palette-slot.md`; this is the
checklist. Roadmap item 16 tracks it.

## Phases

### 1. The map (`read-region-handler`, `region-rows-from-ring`) — verify — DONE 2026-10-05

`handlers.read_region` in `mesen/bridge.lua`: a window of at most 64x64
rendered to per-pixel layer/palette/slot/tile/oam the way the PPU composes
it (lowest OAM index wins, behind-background sprites lose to an opaque
background pixel), pattern bytes read through `nesPpuDebug` so CHR banking
holds, nametable and pattern reads cached per tile row. The caller supplies
the per-row scroll: `windowRows()` in `src/agent/region.ts` maps
`reconstructScrollAt()` for each window line to `{scroll_x, nt_x, v_y,
nt_y}`, so the loopy replay stays in the fixture-tested TypeScript module.
Assessor: effort high, verify warranted (risk medium: a wrong row
convention would select the wrong tiles silently; the handler runs inside
the paused poll, so its time counts against the 1 s watchdog). Verified
live against the SMB status bar with a zero scroll: digits render as
slot-1 glyphs, SMB's sprite-zero coin pixels as the sprite layer; and
through `getRegionAt` on the title demo (scroll 53 applied from row 32 of
the window, matching ADR-0010's pipe lookup). Timing: 28 paused
`read_region` calls during the Mario scan and the status-bar picks, every
one 0-2 ms in Lua (`scripts/lua-log.sh`), response about 60 KB; the
worst case is bounded (64 sprites × 16 rows × 8 columns plus 4096
background pixels with cached reads), so no window over any row can
approach the budget.

### 2. The fill and its answer (`region-flood-fill`, `region-result-blast-radius`) — DONE 2026-10-05

`regionFromMap()`: 4-neighbour stack fill; `color` = same layer, palette
and slot; `object` = same layer and palette, any non-zero slot; background
slot 0 in object mode selects the backdrop run and says so; layer 0 answers
"nothing is drawn". `RegionResult` carries mode, layer, palette, slot or
slots, bbox, pixel_count, runs, truncated (window edge that is not the
screen edge), tiles, oam, window, `sharing` (color mode: pixels outside the
region using the same slot, through which tiles and OAM entries) and
`free_slots` (slots 1-3 of the palette unused by that layer in the window).
Unit-tested on a hand-built Mario map with a button (`region.test.ts`):
the button is 4 pixels of slot 2 sharing with 11 face pixels, no free slot;
the hat is 13 pixels with no sharing; object mode is all of Mario.

### 3. The sentence and the tool (`region-context-sentence`, `get-region-tool`) — DONE 2026-10-05

`describeRegion()` writes the summary: what was selected and where, the
palette-edit blast radius (or that nothing else in view uses the slot),
whether a tile edit has a free slot, the backdrop note, the truncation
note. `get_region {x, y, mode}` in `src/agent/tools.ts` returns the result
without `runs` (token budget). Prompt section gained the two-edit-paths
rule and the region line's meaning.

### 4. The view (`pick-endpoint-mode`, `view-region-overlay`) — DONE 2026-10-05

`POST /pick` takes `mode` (default `color`, 400 on an unknown one);
`pickPixel` adds `region` in color and object modes and survives an older
`bridge.lua` without the handler. The page has a Select row (Pixel, Tile,
Color, Object; Color on), tints the region's runs translucent blue with a
solid one-pixel halo outside it, draws the tile cell dashed and the whole
sprite dotted, and keeps the overlay until the next click (the four-second
timer is gone). The context line ends with the region summary.

### 5. Skills, live check, docs (`skills-region-vocabulary`, `region-live-check`, `region-docs-roadmap-carry-ins`) — DONE 2026-10-05

`identify-click` reads the region sentence first and renumbers its steps;
`palette-swap` uses it to answer "only this part" honestly. `trio.sh
region` calls `get_region` in both modes at (176, 182) and pins the shape
of the answer (both modes present, a layer, a non-empty region, the
tile-edit sentence, slot 0 named as the backdrop), not the palette, because
the demo cycles scenes. `/verify`'s human half now names the hat, button
and whole-Mario clicks. `docs/bridge.md` row, roadmap item 16, README and
CLAUDE.md updated.

Live acceptance on the running demo (paused, through the view): color mode
on Mario selected 19 pixels of slot 2 across OAM #5 and #6 and reported 25
other pixels on OAM #5-#8 sharing the slot with no free slot in sprite
palette 4; object mode selected all four of his sprites (143 pixels,
12x16). A status-bar digit selected 12 pixels of slot 1 of background
palette 2 with 207 sharing pixels and slots 2-3 free.

## Carry-ins (on roadmap item 16)

- Label a selection into a mapping group from the view (the "label them"
  half of the Later-list item): a name box next to the pick text that
  calls `record_mapping` with the region's tiles.
- `object` mode prefers an existing mapping group when the clicked tile
  belongs to one, so a labelled pipe selects as a pipe even where its
  palette continues into the hill.
- The eight-sprites-per-scanline overflow rule in `read_region`.
- A rectangle or lasso gesture, with these modes as its snap rules
  (ADR-0014 revisit trigger).
- A golden `read_region` fixture captured from SMB (ROM and checker
  named) beside the hand-built Mario map, so a Lua composition change is
  caught by a unit test and not only by the trio.
- Nametable addresses per background tile in `RegionResult` (derivable
  from each pixel's row scroll with `tileAddressAt`), so a background
  selection can go straight to `write_nametable` or `record_mapping`.
- Palette per scanline in the map, if a game with mid-frame palette
  writes turns up (ADR-0014 revisit trigger).
