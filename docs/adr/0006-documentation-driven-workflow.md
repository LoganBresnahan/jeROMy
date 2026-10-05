# ADR-0006: Documentation-driven workflow: ADRs, roadmap, issues inbox, skills

**Status:** Accepted
**Date:** 2026-10-05

## Context

jeROMy was developed in early 2026 with phase plans and architecture docs
but no decision records, no frontier, and no session-start or pre-commit
discipline. After a seven-month gap the project needed a full re-orientation
from scratch, and the decisions behind the original design were
unrecoverable. The maintainer's other projects (Monster Paws at
`/home/oof/dogchain`, DeepSeek Moby) run a documentation-driven agentic flow
that he reports "really keeps us on track": ADRs for every decision, a
roadmap with a single frontier, an issues inbox, and Claude Code skills for
orienting, verifying and shipping, plus a workflow that decomposes an ADR
into a build checklist.

## Decision

Adopt that flow here, with `docs/` as the root (this repo already uses it):

1. `docs/DIRECTION.md` is product truth. `docs/roadmap.md` is build order;
   frontier = first unchecked item under Now; deferred work is a carry-in on
   an item, never a `TODO` in code. `docs/issues.md` is the inbox for
   findings from real use; entries are deleted when fixed.
2. Every decision gets `docs/adr/NNNN-slug.md` (Nygard style). Cite as
   `ADR-NNNN`, exactly, everywhere. Supersede rather than rewrite. Build plans
   derived from ADRs live in `docs/plans/`.
3. Skills in `.claude/skills/`: `/orient` (read-only session-start bearing),
   `/shipshape` (tests green twice, docs current, grep-checkable
   conventions; proposes, never applies), `/verify` (runtime recipe against
   a live Mesen, the deploy analog for a local tool). Workflow
   `.claude/workflows/adr-plan.js` turns an accepted ADR into a phased
   checklist.
4. Comments carry invariants with their ADR, traps, sanctioned exceptions,
   or fixture provenance. Nothing else. Rules stated as prohibitions at the
   point of temptation.
5. Commits happen only when the maintainer asks. Work is reported and left
   in the tree for review.
6. `CLAUDE.md` at the root holds the rules, stack, conventions, skills and
   commands. It is not a work tracker; the roadmap is.

## Consequences

- Each slice costs a little more up front (an ADR, a roadmap tick) and far
  less to resume after a gap.
- `/shipshape`'s conventions gate is only as good as its greps; they are
  tightened as the plugin takes shape (ADR-0005's import boundary, tool↔test
  parity, Lua handler↔adapter parity, the watchdog budget).
- The pre-rethink docs (`docs/architecture/*`) describe code slated for
  deletion; they are kept until roadmap item 8 and then rewritten or
  removed, not left to drift.

## Alternatives

- **CLAUDE.md as the live tracker** (Moby's shape). Works for a single
  release stream, but mixes authoritative rules with as-of-write-time state
  in the one file that auto-loads every session. Rejected in favor of a
  separate roadmap.
- **No ADRs, plan docs only.** That is what v0.1 had; the why was lost.

## Revisit triggers

- A session starts and `/orient` cannot reconstruct where the project
  stands from commits plus roadmap alone.
- The conventions gate produces more false positives than findings.
