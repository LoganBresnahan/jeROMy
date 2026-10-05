---
name: orient
description: Take a bearing at the start of a new jeROMy context window. Read the recent commits and docs/roadmap.md to reconstruct what shipped and what's next, follow the commit trail into whichever docs it points at (docs/DIRECTION.md, ADRs, docs/plans/), then reconcile that ground truth against remembered state (MEMORY.md, cavemem) and flag any drift. Read-only — it briefs, it does not write memory or change code. Run when opening a fresh session or whenever you've lost the thread of where the project stands.
---

# /orient — take a bearing at session start

A new context window starts blind to *where we are*. Reconstruct it from the
sources that don't auto-load — commits, roadmap, and the docs they point at —
then check that what you already remember still matches reality.

**Read-only.** The deliverable is a briefing, not actions. It does **not**
edit code and does **not** write memory. Assumes cwd = the jeROMy repo root.

## The context sources — and which lane is orient's

| Source | Holds | Trust | Loaded |
| --- | --- | --- | --- |
| CLAUDE.md | how-to-work rules, stack, conventions | authoritative, static | auto |
| MEMORY.md + memory files | curated durable facts | *as-of-write-time* — can drift | auto |
| **cavemem** (MCP, if connected) | narrative / the *why*, cross-session | *as-of-write-time*, richer | **on-demand** |
| **git + docs/roadmap.md + docs/** | what the code *is* / the plan *says* | authoritative, **current** | **must be read** |

Rules that keep the lanes disjoint:

- **Don't re-summarize CLAUDE.md or MEMORY.md** — they're in context already.
  Report the *delta* (what changed since last session) and the
  *reconciliation* (does memory still match ground truth?).
- **git = what shipped. ADRs = what was decided. cavemem = what was
  discussed.** Reach into cavemem only for a *why* that neither commits nor
  ADRs carry.
- **orient never writes memory.**

## 1. What shipped — read the commits

```bash
git log --oneline -12
git status --short
```

Read back only until the arc is coherent. Answer three things: last
known-good state, what landed most recently, uncommitted WIP on the floor.
There is no CI yet; when one exists, the newest green run is "last good",
not the newest commit, and a red run leads the bearing.

The jeROMy twist during the rethink: a large uncommitted tree is normal (the
v0.1 stack is being replaced in place). Distinguish "WIP on the frontier
item" from "stale edits from before the rethink" by reading `git diff --stat`
against the roadmap item.

## 2. Where we meant to be — the roadmap

Read `docs/roadmap.md` (**Now** and **Next**). Map shipped commits onto
checked items. The **frontier** = first unchecked item under Now, else Next.
Note carry-ins pinned to upcoming items — those are the traps on the next
task. Then skim `docs/issues.md`: anything there that blocks the frontier
outranks new work.

## 3. Reconcile ground truth against memory

For every remembered claim naming a concrete artifact — a file, symbol,
roadmap item, ADR, or "decision locked" — **verify it against what git /
roadmap / code show now.** Flag drift explicitly rather than trusting memory.
Known drift shapes here: memory says "dsh plugin" while `src/dsh/` does not
exist yet (that is plan, not state); a plan doc section superseded by a later
decision in the same doc.

Then, only for a *why* the commits don't carry (skip cleanly if cavemem MCP
isn't connected):

```
cavemem search "<topic the commit raised>" → get_observations(ids)
```

Query against a **specific question the commits raised** — never dump it.

## 4. Follow the trail into docs (on demand)

Commits and roadmap items point at docs — "ADR-0004", "DIRECTION",
`docs/plans/dsh-migration.md`. Read the specific referenced doc **only when
the next move touches it** (starting the emulator-view page → ADR-0004;
porting a tool group → ADR-0005's boundary and the tool's current test).
Pulled by a question, not read by default.

## 5. The bearing (report)

```
ORIENT — jeROMy @ <branch> <sha>
  shipped     <recent arc in one line>  · last good: <commit>
  wip         <uncommitted files grouped by purpose, or "clean">
  roadmap     frontier → item <N> "<title>"  (done: <range>)  · issues blocking: <n or none>
  drift       <remembered-vs-actual mismatch, or "none">
  next move   <the obvious task> — read <the one doc> first
```

Keep it to that shape — a fast "you are here" that lets work resume in one
turn, not a re-run of project history.
