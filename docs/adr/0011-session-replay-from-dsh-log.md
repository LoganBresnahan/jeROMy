# ADR-0011: Agent sessions are reviewed from dsh's persisted log, not a jeROMy log

**Status:** Accepted
**Date:** 2026-10-05

## Context

Developing jeROMy means watching what the DeepSeek agent did: which tools
it called with which arguments, what came back, what it reasoned, which
screenshots it saw, and what it cost. The v0.1 stack kept its own event
store for this (`src/db`, deleted at roadmap item 8). Under dsh there is no
jeROMy-side record, and the web UI shows a rendered conversation, not the
tool trace or the reasoning behind a wrong answer. The first click session
(2026-10-05) was evaluated from a transcript Logan pasted into chat, which
lost the tool results and the images. An autonomous loop, where Claude
drives dsh and judges each turn, needs the same record without a person in
the middle.

dsh already persists every session (ADR-0003) as an append-only JSONL under
`~/.dsh/sessions/<cwd-key>/session-<id>/session.v4.jsonl.zstd`, one zstd
frame per checkpoint, written while the session runs. The log carries
`system/message`, `user/message` with a `source.kind` (`user`,
`jeromy-view`, `agent-instructions`, …), `assistant/message` with
`reasoning`, `text` and `tool-call` blocks plus per-step `usage`,
`tool/call`, `tool/result` with `isError` and image blocks that reference
content-addressed files under `~/.dsh/attachments/v1/objects/<2 hex>/<sha256>`,
and `turn/end` with a reason. The headless `--json` stream is a subset
(no reasoning, no system prompt, results flattened) and does not exist for
web sessions. dsh's own export is a browser ZIP download; its session
inspector is an experimental web view.

## Decision

1. **Read dsh's log directly; keep no jeROMy log.** The session file is
   the record for evaluation, debugging and the autonomous loop.
   "Model-visible means logged" (ADR-0003) is what makes this sufficient:
   anything that reached the model is in the file.
2. **A read-only reader script, `scripts/dsh-log.mjs`**, dependency-free
   Node: `list`, `show` (transcript with reasoning, calls, results, image
   paths, usage), `tail --follow` (live), `stats` (tool histogram, errors,
   tokens, cost estimate), `events` (raw, for `jq`), `path`. It decodes the
   concatenated zstd frames itself because Node's one-shot decoder stops
   after the first frame, and tolerates a torn final line. Images are
   resolved to the attachment store; `--images DIR` copies them out for
   viewing.
3. **A Claude skill, `/replay`**, says how to read a session: answer
   against the question, tool trace, images judged against the frame,
   reasoning slips, cost, injected context; where findings go; the stop
   conditions for an autonomous loop.
4. **The reader never writes to `~/.dsh`.** No lock handling, no
   compaction, no edits. If dsh's format moves, the reader moves.

## Consequences

- Every dsh run is reviewable after the fact with the same evidence a
  person had in the web UI plus the parts it hides. Headless checks
  (`scripts/trio.sh`) print the session id so the transcript is one command
  away.
- We depend on an internal, pre-stable format: file naming
  (`session.v<N>.jsonl.zstd`), the event shapes, and the attachment layout.
  The reader reads the newest generation in a session directory and prints
  unknown event types as nothing, so a format bump degrades to a thinner
  transcript rather than a crash; the tests pin the v4 shapes we rely on.
- The reader surfaced two facts worth knowing on day one: dsh injects the
  nearest `AGENTS.md`/`CLAUDE.md` above its cwd into the agent as
  `agent-instructions`, so headless runs must start from a directory
  outside every repo (not the harness checkout, not jeROMy); and
  the `session-log-deepseek` plugin uploads the session log (system prompt,
  tool results, clicks) to DeepSeek's API by default. The first is fixed in
  `trio.sh`; for the second Logan decided on 2026-10-05 to turn the upload
  off (`session-log-deepseek` `enabled: false` in the dev patch; the bundle
  at roadmap item 7 must carry the same row).
- Cost figures are estimates from list prices with an assumed cache-read
  rate; they are for comparing runs, not billing.

## Alternatives

- **Parse only the headless `--json` stream.** Already saved by
  `trio.sh`, but it has no reasoning or system prompt, and web sessions
  (where the pixel picker and the real use happen) never produce one.
  Rejected as the primary record; kept as the trio's quick summary.
- **Mirror events into a jeROMy store** via `SessionEventMap` or a storage
  domain. Duplicates what dsh writes, adds a second fork semantics, and
  re-creates the deleted `src/db`. Rejected (ADR-0003).
- **Use dsh's export or session-inspector packages.** Browser download and
  an experimental web view respectively; neither gives Claude a file to
  read from a shell, and both pull in the web client. Rejected for now;
  revisit if dsh ships a host-side export command.

## Revisit triggers

- dsh bumps the session format (a `session.v5.jsonl.zstd` appears) or
  changes the attachment store layout.
- dsh ships a supported host-side session export or query CLI.
- The autonomous loop needs more than tailing: structured per-turn
  verdicts stored somewhere, at which point a `docs/plans/` entry decides
  where.
