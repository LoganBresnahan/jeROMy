# ADR-0003: Persistence on dsh's session log and storage; SQLCipher dropped

**Status:** Accepted
**Date:** 2026-10-05

## Context

jeROMy v0.1 has an event-sourced SQLCipher store (`src/db`): append-only
events, an M:N join table giving zero-copy forks, snapshots for context
compression, 15 event types. In production it was opened without a key
(`src/index.ts`), so it was never actually encrypted. DeepSeek Moby's later
schema (content-addressed blobs, live structural events, recovery on open)
is two ADRs ahead and was reviewed as a reference.

dsh persistence has three seams, each a service a plugin may replace:
`ctx.sessionPersistence` (shipped backend: append-only JSONL, zstd frames,
versioned headers, `fork()` with `inheritedEventCount`, no repair of a log
crashed mid-turn, readers synthesize closers); `ctx.attachments` (shipped
backend: image files under `DSH_HOME`, content-addressed refs, model sees
refs never bytes); `ctx.storage` / `ctx.storageDomain` (JSON-file or SQLite
backends; schema-validated, change-emitting key-value domains). Plugins add
their own durable event types by declaration-merging `SessionEventMap`;
events tagged for message projection replay into model history.

The maintainer briefly wanted to keep SQLCipher, then decided encryption at
rest is not a requirement for this project.

## Decision

1. **Sessions, forks and screenshots live in dsh's shipped backends.** No
   session store in this repository.
2. jeROMy's domain events (palette, tile, nametable and memory writes with
   old bytes; `record_mapping` discoveries and hypotheses) are
   `SessionEventMap` entries, so they fork and replay with the session.
3. Promoted mappings stay as `mappings/sha1-<sha1>.json`: the shareable
   artifact, independent of any session store.
4. Per-ROM scratch state (unpromoted discoveries, palette override ledger)
   lives in a `ctx.storageDomain`.
5. `src/db` is deleted. Snapshots/context compression are dsh's
   `compaction` concern.

**Amendment 2026-10-05.** Decision 2 is narrowed: jeROMy registers no
`SessionEventMap` entries for now. dsh's session log already records every
tool call and result durably and replays them, which covers palette, tile,
nametable and memory writes (they are tool calls with their arguments and
`old_color`/old bytes in the result). `record_mapping` discoveries are kept
in a process-level ledger on the Mesen service and written to the mapping
file by `promote_mappings`; moving that ledger into a `ctx.storageDomain` is
the remaining durability gap (roadmap item 5 carry-in).

## Consequences

- Zero-copy forking is lost; dsh deep-clones seed events. Acceptable at
  jeROMy's session sizes.
- No encryption at rest. If that ever matters, the right shape is a
  `dsh-session-persistence-sqlcipher` plugin against the documented seam,
  with Moby's `src/events` as the reference, not a revival of `src/db`.
- "Model-visible means logged" (dsh's rule) applies to us: pixel-picker
  results and mapping context must enter through `agent.inject()` or
  session events, never a side channel.

## Alternatives

- **Keep SQLCipher as a dsh persistence backend.** Real work against an
  alpha seam, and the project has no encryption requirement. Rejected.
- **Keep `src/db` beside dsh for domain data only.** Two stores, two fork
  semantics, and the domain data would not replay with the session.
  Rejected.
- **SQLite via `storage-sqlite` for everything.** It is a document KV store,
  not an event log; sessions do not belong there. Rejected.

## Revisit triggers

- A real requirement for encryption at rest (shared machines, sensitive
  ROM research).
- dsh's session log proves too slow or too large for long editing sessions
  with many screenshots.
