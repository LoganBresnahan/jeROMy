# ADR-0018 build plan: named hacks in the person's own repository

Produced by the `adr-plan` workflow on 2026-10-05 (13 slices, 15 agents,
8 minutes), run while the implementation was already in the working tree,
so every slice came back "partial" with a review of the code as it stood.
Its phases are the five below; its critical path was layout → migration →
active pointer → tools → swap → boot apply → prompt/status → live check →
docs. Source of truth for intent is
`docs/adr/0018-named-hacks-in-the-persons-own-repo.md`; roadmap item 19
tracks it.

Three review findings changed the build, and are the reason to keep
running the workflow even on finished code:

1. **`src/hacks/` was never committed.** `.gitignore`'s unanchored `hacks/`
   matched `src/hacks/` too, so the store, the IPS/BPS writers and their
   tests from ADR-0009 (2026-10-05, overnight) never reached a commit;
   `origin/main` would not have built for a fresh clone. Fixed by anchoring
   the pattern to `/hacks/` and staging the directory; `/shipshape` now
   checks that every source file is tracked.
2. **`switchHack` moved the pointer before reverting.** A failed revert
   would have left the store naming the new hack while the old hack's bytes
   sat in the emulator, so the next ledgered edit would record wrong old
   bytes. Reordered: revert, then `useHack`, then apply; a test pins it.
3. **The migration guard keyed on the directory.** A crash between
   `mkdir default/` and the renames would have blocked the migration for
   good. Keyed on `default/hack.json`; a test pins it.

The reviewers also asked for a reset after a boot-time apply (the game had
already copied its tables), which is in, with no reset on a reconnect edge
where nothing was applied.

## Phases

### 1. Layout contract and the gitignore unblock — DONE 2026-10-05

`HackStore` with `gameDir` / `dir` (active hack), `hack.json`, `HACK_NAME`,
`createHack` / `useHack` / `listHacks`, `nextVersion` / `recordExport`;
`HackStore.open` migrating a pre-ADR-0018 ledger into `default/` and
writing `game.json`; the root `.gitignore` seed (`*.nes`, `reference/`,
`*.tmp`), never overwriting a person's own; `hacksDir`'s description
reworded. Tests in `store.test.ts` cover the two-level layout, the
migration (including a half-done one), hack lifecycle, export versions.

### 2. Active pointer, tools, swap, exports, boot apply — DONE 2026-10-05

`game.json` holds the active hack and `open()` honours it; `list_hacks`,
`new_hack`, `use_hack` in `tools.ts`; `switchHack` and `applyOnBoot` in
`src/hacks/activate.ts` (direct adapter writes of ledgered bytes, never
new entries); `export_patch` writes `<hack>-v<N>.<fmt>` and records it,
`export_rom` writes `<hack>.hacked.nes`; `MesenService.refresh` opens the
store, applies the active hack on a clean ROM, resets when it applied
anything, and keeps the report. Reviewers flagged the swap and the boot
apply as the two slices worth an adversarial pass; both got the ordering
fix and the reconnect-edge test above.

### 3. Surfaces — DONE 2026-10-05

The prompt section opens with "Active hack: <name>", its edit count, what
the boot apply did and any conflicts; `/status` and every stream event
carry `hack`; the view's status line shows it. Not built: a hack selector
in the view (`view-hack-control`); `use_hack` through the chat is the
switch for now, recorded as a carry-in.

### 4. Proof — DONE 2026-10-05

Live: the SMB game directory migrated on the first boot; the view reported
`hack: default`; a model session ran `list_hacks`, `new_hack halloween`,
`use_hack halloween`, `list_hacks`, `use_hack default` with zero tool
errors (session `0e99de91`). `trio.sh hacks` is the standing check:
create a throwaway hack, switch to it, write one ledgered byte, export,
switch back, with criteria on the raw results, and the throwaway removed
afterwards.

### 5. Docs close — DONE 2026-10-05

Bright line reworded in `docs/DIRECTION.md` and `CLAUDE.md`; README's
hacks-root guidance; the learning guide's "several hacks" section rewritten
as built with the directory tree; roadmap item 19 ticked with carry-ins;
`persist-edit` names the versioned export.

## Carry-ins (on roadmap item 19)

- A hack selector in the view (list, switch, new) beside the Select row.
- `hack diff` against the original: the ledger rendered as a table of
  offsets, old and new bytes, with symbol names from the reference.
- Persistent paths for nametable, CHR-tile and level edits proven on SMB
  the way the palette table was.
- A first-run story for `hacksDir` on an installed copy (ask for a
  repository path once, remember it).
- Stacked hacks (`base` in `hack.json`) if someone wants a skin over a
  gameplay hack (ADR-0018 revisit trigger).
