# ADR-0024: "Map this game" is a driven campaign: a coverage file, short blind worker sessions, proof as the gate, a person or a second model as judge

**Status:** Proposed (Logan's call: the default worker, the default judge,
and whether Zelda stays a holdout, under "Open")
**Date:** 2026-10-10

## Context

The eval loop (ADR-0020) mapped Super Mario Bros. end to end: 89 spec
lines promoted across 62 recorded runs, about $4.90 of `deepseek-flash`,
re-runs included (`eval/runs/`, `eval/spec/smb.json` v21). It did so with
Claude in the chair for everything but the search: Claude wrote each task
(three or four lines each, the facts the worker was given, the proof to
use, the leaks to hold back), the reference graded every non-picture
line, Claude judged every picture from the saved images, and
`eval-promote.mjs` moved majority-right lines into the mapping.

Logan's question (2026-10-10): a person boots another NES game and tells
the agent to map the whole thing. Today that does not work, for reasons
that are structural rather than about the worker's ability:

- **No definition of done in the product.** "Mapped" lives in
  `eval/spec/attributes.md` and the five sheets; none of it reaches the
  plugin's prompt, so an agent decides for itself what "whole" means.
- **One session is far too small.** SMB took about sixty sessions. A task
  with more than three or four lines drops the last one (`eval/failures.md`
  F5), and a conversation's context fills long before a game is covered.
- **Nothing checks.** A new game has no reference (ADR-0019: most games
  never will), so a wrong claim would go straight into the mapping, no one
  judges the pictures, and a tool slip (F15, a hex offset read as decimal)
  goes unnoticed.
- **The worker holds its records.** On the holdout, in five of six counter
  repeats, the worker had written and seen the HUD follow a right byte and
  recorded nothing before the cap, spending the time on the next value
  (F13). Everything it knew was lost with the session.

Two facts from the holdout bound the design. Where play changes a value,
the method transfers: `20261010-0930-holdout-engine` got four of five
Zelda lines right at the first attempt, all but one by the worker's own
search. And a proof can look right for the wrong byte: writing Zelda's
"rupees to add" byte makes the HUD count up (`holdout-hud-start2`), so a
grade with no reference needs more than "the HUD changed".

Logan also asked whether a single long session of a stronger model
(Claude) would be faster than the two-role process, and whether two models
would do better than one. No run has measured it; the design has to
survive either answer.

## Decision

1. **A campaign is a coverage file worked line by line.** "Map this game"
   starts a campaign under `hacks/sha1-<sha1>/campaign/` (per-person state,
   like the ledger, ADR-0009): `spec.json` in the `eval/spec/<game>.json`
   shape (one line per thing, with class, name, proof, status, verdict,
   entry), `runs/<id>/` per session (config, stream, images, grades, as
   `eval/runs/` holds them now) and `judged.json`. The mapping file stays
   the deliverable; the campaign is how it gets filled.
2. **The coverage file is generated, then confirmed.** The attribute
   classes (`eval/spec/attributes.md` A–E) are the template; a first
   look-around session fills in the game's instances: the scenes it reaches
   from boot and from the person's save state, the HUD fields it shows, the
   objects on screen in each scene, with a screenshot per scene. The person
   sees that list before the campaign spends money on it, and adds or
   removes lines. Classes a look-around cannot see (level data, routines)
   get their standard lines (the loader, the NMI, where each level lives).
3. **A driver runs short blind sessions.** A line or a batch of at most
   three related lines per session (F5), a fresh context each time, a cost
   and time cap per session, the campaign's mapping-so-far in context
   except the batch's own lines and any earlier attempt at them (ADR-0022's
   holdback, so a repeat is independent). The task is built from the line's
   class template, the proof that class requires, the facts the look-around
   recorded, and the person's save state as the start (ADR-0023). The task
   says **record each line as soon as its proof is taken** (F13); a session
   that proves and does not record counts as a miss on the record, not on
   the search. The driver is the generalisation of `eval-run.sh`,
   `eval-grade.mjs` and `eval-promote.mjs`, moved into the plugin; it needs
   dsh to run a session headless from a plugin, which is a seam to extend
   if dsh lacks it (`docs/DIRECTION.md`, bright lines), never a second
   harness.
4. **Proof is the gate, checked without a reference, in three tiers.**
   Every verdict names its tier (ADR-0020 §3's rule, one tier added).
   - *Mechanical, from the session's own events:* the proof sequence the
     class requires happened (a write, then a look; a write, a reset, then
     a look; a trace; a watch across a known action), the written value
     differed from the one before it, the record cites it. A routine's
     entry is checked by scanning PRG for a `JSR`/`JMP`/vector to it
     (`find-routine` step 4, made a grader). An origin's bytes at the
     recorded offset equal what the RAM or palette showed before the write.
     A table's length is checked against the code that indexes it where a
     routine for it is recorded.
   - *Replayed:* the driver repeats the proof itself after the session, in
     a throwaway hack that is undone (`eval-run.sh`'s F19 rule): load the
     recorded `reach`, write the recorded address or origin, screenshot
     before and after. The pair is the evidence; the worker's narration
     is not.
   - *Judged:* the replayed pair, the claim and the worker's one line go to
     the judge for a right / wrong / can't tell. Pictures (tiles, sprites,
     palettes, scenes) are judged only; addresses and origins are judged
     when the mechanical tier passed, so the judge sees only claims that
     already have a proof. A verdict names its image (`judged.json`, as
     now) and can be overturned later by the person; the overturn is
     recorded.
5. **The judge is a person or a second model, never the worker's session.**
   One interface, a queue of (claim, before, after, one line) with three
   answers; the emulator view (ADR-0015's click queue is the shape) shows
   it to the person, and a model judge answers the same queue through dsh
   with a different model from the worker. The judge never sees the
   worker's reasoning, only the evidence: that is what kept tonight's
   picture grades honest (`/replay`: judge the trace and the images, not
   the text). A line passes on a judge's right; a wrong or a can't-tell
   sends it to a repeat.
6. **Repeats decide by majority, failures stay visible.** A line that is
   unproven or judged wrong is re-run up to three times with its earlier
   claims held back; `eval-promote`'s majority rule promotes it, and a
   contested picture (two judges disagree, or the person overturns) is
   left for the person. A line that fails all repeats stays `open` in the
   coverage file with its failure named in the campaign's report, which is
   ADR-0020 §4's distribution (attempted / proved / recorded / promoted /
   right), per class, so the person sees where the game resists.
7. **The worker and the judge are settings, the structure is not.** The
   worker is whatever model the dsh profile names (ADR-0002); the default
   stays `deepseek-flash` until a measured comparison on the same lines
   says a stronger model is cheaper per right line (cost × repeats). A
   stronger worker does not remove the driver (short sessions, the gate,
   the judge): the gate is there for independence, not for weakness. A
   long single session is rejected as the architecture whichever model
   runs it (Alternatives).
8. **The person starts it, bounds it, and can leave.** "Map this game"
   takes a budget in dollars and stops on it, on the stop conditions of
   ADR-0020 §8 (funds, the bridge down, a write outside `hacks/`,
   `mappings/` and RAM), or when the person stops it; the campaign resumes
   from `spec.json`. The judge queue waits; a campaign with an unjudged
   queue is paused at the gate, not failed. Promotion into
   `mappings/sha1-<sha1>.json` is the person's `promote_mappings` call or
   an explicit "promote as you go" at the start, since the mapping is the
   shared artifact (CLAUDE.md: discoveries promote from session events,
   never the other way round).
9. **The eval loop stays how jeROMy is built; the driver is what ships.**
   The driver's acceptance test is the loop itself: run the campaign on
   SMB with no reference in context and grade the result with
   `score-mapping.mjs` against the reference afterwards; its holdout is a
   game the driver was not tuned on (Open, below).

## Consequences

- The reference-free gate lets through a proof that looks right for the
  wrong byte (the RupeesToAdd trap). A replayed pair and a judge catch
  some of these (the HUD counts up instead of jumping to the written
  value); the rest enter the mapping with their proof image attached, so
  the person who later finds the edit misbehaving can see why it was
  believed and overturn it. A campaign mapping is therefore a weaker
  artifact than an SMB line graded by the reference, and its entries say
  so (`source`, the campaign run id, the judge).
- Zelda's counters stop being a clean holdout for F13. "Record as soon as
  proven" is adopted from holdout evidence alone, which ADR-0020 §5
  forbids for skills and prompts; it is declared here as the one
  exception, placed in the driver's task template rather than in a skill,
  and the driver's own holdout is a third game (Open).
- The emulator view grows a judge queue beside the click queue; the person
  judging SMB's pictures would have answered about ninety items (66 tiles,
  10 sprites, 8 palettes, 7 scenes). A model judge costs a vision call per
  item on the judge's price, which is where a stronger model's cost goes
  instead of into every search screenshot.
- Cost of a campaign at SMB's size: about $5 of worker on `deepseek-flash`
  plus the judge, plus repeats on the lines the game resists. The budget
  is the cap, as the balance was for the eval loop.
- The scripts under `scripts/eval-*` become the reference implementation
  of the driver and are kept for the loop; the product driver is
  TypeScript under `src/` with the same record shape, so `eval/runs/` and
  a campaign's `runs/` read with the same tools (`/replay`, `eval-grade`).
- A game whose scenes a look-around cannot reach (a password, a long
  intro) gets a thin coverage file; the person's save state (ADR-0023) is
  the way in, and the look-around says which scenes it did not see.

## Alternatives

- **One long session of the strongest model ("just ask Claude").** Rejected
  as the architecture, independent of the model: a context holds a few
  tasks' worth of a sixty-session job (F5 at three lines, not sixty); the
  session grades its own work, which the coinflow lesson in ADR-0020 says
  passes broken work; and vision cost is per screenshot, of which a
  campaign takes hundreds. Whether Claude is the better *worker inside the
  driver* is a measurement, not a decision (Revisit triggers).
- **Worker and critic in the same context, debating.** The critic reads
  the worker's reasoning and anchors on it; tonight's picture judgments
  were right because they were made from images with the text ignored.
  Separate sessions, evidence only.
- **A model judge for everything, no mechanical tier.** ADR-0020's
  alternative, rejected for the same reason: where an event log or a byte
  comparison answers, an opinion is a worse grader and costs more.
- **Require a reference.** Rejected by ADR-0019; the reference, where one
  exists, grades a campaign after the fact (decision 9) and is never in
  the worker's context.
- **Ship the eval scripts as they are.** They need Claude writing the
  tasks and judging; the tasks were hand-written per line with the leaks
  held back by hand. The driver is what replaces that hand.
- **Promote as the campaign goes, always.** Simpler, but the mapping is
  shared and a campaign's grades are weaker; the person says when.

## Open (for Logan)

1. **The default worker.** `deepseek-flash` by the evidence so far. A
   comparison on the same Zelda counter lines (three repeats each,
   Claude as worker through a dsh profile, about $1) would settle it with
   numbers; it has not been run.
2. **The default judge.** A person in the view, with a model judge as a
   setting; or the reverse, with the person overturning. The person is
   proposed as the default since the judge's verdicts are what the mapping
   is worth.
3. **The driver's holdout.** Zelda carries the F13 lesson into the driver,
   so a third game Logan owns, with a RAM map, is needed to measure the
   driver the way Zelda measured the skills.

## Revisit triggers

- The worker comparison (Open 1) shows a stronger model cheaper per right
  line: change the profile's default, keep the driver.
- The person overturns a model judge's verdicts at a rate that makes them
  worthless: pictures go person-only, the model judge keeps addresses.
- A third-game campaign proves fewer than half its counter and object
  lines: the look-around or the batch shape is wrong, not the worker.
- dsh gains sub-agents, a batch runner or a headless session API: the
  driver moves onto it and the seam closes.
- A reference-free proof enters a mapping wrong and misleads a later edit
  more than once (the RupeesToAdd shape): the mechanical tier needs a
  "written value is the shown value" check, not only "the display changed".
