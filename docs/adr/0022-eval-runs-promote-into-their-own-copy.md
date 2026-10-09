# ADR-0022: An eval run promotes into its own copy; the campaign mapping takes a line only from a run that graded it right

**Status:** Accepted
**Date:** 2026-10-09

## Context

ADR-0020 makes the mapping file the deliverable of the campaign and the run
record the deliverable of a run. Until now a run's `promote_mappings` wrote
straight into `mappings/sha1-<sha1>.json`, and two problems followed within
a day (`eval/failures.md`):

- **F10.** The mapping is in every session's prompt (Known Addresses). A
  re-run of C1.score would start from the wrong `$07DE` claim it is meant to
  rediscover; a right line would pass by reading its own answer. With three
  repeats per re-run (Logan, 2026-10-09) the second and third repeats would
  read the first's.
- **F8.** The merge never overwrites (ADR-0009, ADR-0021), so the wrong
  sentence "no separate player page byte" from run `20261009-1135` stays in
  the file beside the note that corrects it, and the wrong score range will
  stay after a re-run gets it right.

## Decision

1. **A run starts from the mapping minus its lines.** `eval-run.sh` writes
   `<run>/mapping-in/` with `scripts/eval-mapping-in.mjs`: the committed
   mapping without the entries the in-scope spec lines name (`entry`). The
   headless plugin's `mappingsDir` points there for the run (a per-run
   copy of the dev patch, `TRIO_PATCH`), so the run also promotes there.
   `mappings/` is not written by a run.
2. **The campaign mapping takes a line from a graded run.**
   `scripts/eval-promote.mjs <run>` (run by Claude after grading, before the
   commit), for each line in scope: when the run's best claim is graded
   right (`agrees` or `confirmed`) and proven, the run's promoted entry
   replaces the mapping's entry for that line (the key the spec line names
   and the claim's key), and the spec line's `entry` is set to it. When the
   run's best claim is graded wrong, the mapping's entry for that line, if
   it is the same wrong claim, is removed. Unproven and ungraded claims
   change nothing. For a series of three repeats, the series' majority
   decides, and the entry comes from a repeat that graded it right.
3. **Entries outside the spec's lines** (a run's side discoveries: `$03AD`,
   `$071C`) are promoted the old way, filling gaps, never replacing.

## Consequences

- Repeats are independent samples; a re-run measures the change, not the
  file.
- The mapping can lose a wrong entry and gain a corrected one, which the
  "never overwrite" merge could not do. Only the eval loop can do this, and
  only on a reference grade or a judged image; a person's session promotes
  the old way.
- The reference now decides what leaves the campaign mapping, which ADR-0017
  never allowed for what enters it. Entering still needs a session's proof;
  the reference only vetoes a claim it grades wrong.
- A run record holds its own `mapping-in/` and promoted copy, a few KB each.

## Alternatives

- **Strip the prompt instead of the file** (a plugin flag hiding named
  entries). Narrower, but the session's own promote would still write the
  committed file, and F8 stays.
- **Let a later proven claim always replace an earlier one** (a merge
  change for everyone). Fixes F8 generally, but a person's later session
  could replace a right entry with a wrong one; in the eval loop a grade
  stands behind the replacement.
- **Fresh mapping for every run.** Clean, but sheet 5 builds on sheet 3's
  addresses by design; holding back only the in-scope lines keeps that.

## Revisit triggers

- A person's sessions start correcting entries by hand (the F8 shape outside
  the eval loop): the merge rule itself needs a replace path.
- The holdout game's mapping needs the same handling (its lines' `entry`
  fields are already set by runs).
- A run's side discoveries turn out wrong and have no line to grade them.
