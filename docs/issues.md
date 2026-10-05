# Issues

Known defects and rough edges, mostly found by real use. This is the
**inbox**, not the plan: `docs/roadmap.md` says what we are building and
`docs/plans/` says how. A finding graduates out of here the moment it earns a
checklist item, an ADR, or a carry-in pinned to the work that will hit it.

Newest first within each section. Delete an entry when it is fixed. The
commit is the record; a file of ticked boxes stops being read.

## Tests

- **`npx tsc --noEmit` fails with 9 errors, all in `src/db/`** (`eventStore.ts`,
  `sessionManager.ts`, `snapshotManager.ts`): the row interfaces passed to
  `stmt.get<T>()` / `stmt.all<T>()` lack the index signature that
  `@signalapp/sqlcipher`'s `Record<string, SqliteValue>` constraint now
  requires. Tests pass because vitest does not typecheck. Not fixed on
  purpose: `src/db` is deleted at roadmap item 8 (ADR-0003). If it must
  compile before then, the fix is `interface EventRow extends Record<string, unknown>`
  or a cast at the nine call sites. Found 2026-10-05. (A stale compiled test under `dist/` failed `npm test` on 2026-10-05; fixed the same day by `vitest.config.ts` scoping the suite to `src/**`. Delete `dist/` if the stale file bothers you; it is gitignored.)

## Bridge

- **Emulator comes up paused after `scripts/mesen-up.sh` hands the ROM to a
  running Mesen.** `get_emulator_status` reported paused, `screenshot`
  returned an empty PNG, and the first model turn died with a provider 400
  on the empty image. `resume_emulator` fixes it; cause not identified
  (Mesen's PauseWhenInBackground is off). Guard added the same day: the
  screenshot tool now returns an error text naming `resume_emulator`
  instead of an empty image. Carry-in for roadmap item 3: the Mesen service
  should resume (or step one frame) on connect, or the launcher should.
  Found 2026-10-05.
- **`clear_palette_overrides` stops re-applying the override but does not
  restore the original color**; `get_palette` still reads the overridden
  value until the game rewrites that palette entry. Either the tool restores
  `old_color` on clear, or its description says it does not. Decide when
  porting the palette tools (roadmap item 4). Found 2026-10-05.

## Agent / tools

- **Unpromoted discoveries die with the process.** `record_mapping` results
  live in memory on the Mesen service until `promote_mappings` writes them.
  A crash or restart between the two loses them; dsh's session log still
  has the tool results, so they are recoverable by hand. Fix: a
  `ctx.storageDomain` ledger keyed by ROM SHA1 (roadmap item 5 carry-in).
  Found 2026-10-05.

- **Model slip on the headless read check (2026-10-05)**: raw values were
  reported correctly, but the summary called NES color 54 ($36, orange) "a
  duplicate of black". Prompt could carry a short master-palette hue table
  so the model does not guess hue from index. Note for item 5's prompt work.

- **v0.1 agent streams DeepSeek thinking blocks as raw JSON text**
  (`{"type":"thinking",...}` lines in the reply) when run through the
  Anthropic-compatible endpoint, because Phase 4.5 never landed. Not worth
  fixing: the agent loop is deleted at roadmap item 8 and dsh handles
  thinking. Documented so the model-check transcripts are read correctly.
  Found 2026-10-05.
