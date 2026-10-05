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

- None recorded.

## Agent / tools

- None recorded.
