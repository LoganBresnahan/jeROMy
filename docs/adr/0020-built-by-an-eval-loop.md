# ADR-0020: jeROMy is built by an eval loop: a spec of "mapped", blind runs graded against a reference and judged from replays, with a holdout game

**Status:** Accepted (2026-10-09, Logan: "very autonomous", "the budget is all of the money", "use your best judgement on the images")
**Date:** 2026-10-09

## Context

Until now jeROMy has been built hands-on: Logan reads Claude's output, decides,
and steers; Claude writes tools and skills; a live trio check and a replay
prove each item. That produced 41 tools, four skills and one proven mapping
procedure (`find-variable`, ADR-0019). The release gate (`docs/DIRECTION.md`)
is Super Mario Bros. mapped end to end, and the point of mapping SMB is the
skills that map any game Mesen loads, most of which have no disassembly.

Three facts make a different process possible:

- **There is an answer key.** The imported SMB reference (ADR-0017) holds
  2527 symbols with addresses and sizes: RAM equates, PRG tables, level data
  labels, routine labels. It can grade addresses, origins, level ranges and
  routines. It cannot name pictures (which tile is Mario's hat).
- **There is a cheap worker and a better judge.** `deepseek-flash` runs the
  mapping sessions headless for cents; Claude reads the session log (`/replay`,
  ADR-0011), including the screenshots, and can see why a run missed.
- **One turn of the loop has already run.** 2026-10-06: a blind session found
  lives at `$075A`, `scripts/score-mapping.mjs` said the reference agrees,
  and the replay showed the method worked as written.

Logan's prior eval harness (`~/coinflow-case-study`) supplies the lessons:
falsify the grader before trusting it; verdicts are predicates over captured
evidence, with the one place an LLM judges named as such; keep a held-out
measure that tuning never sees; report the distribution of where runs fail,
not a scalar; record every experiment with its config snapshot; the harness
(step caps, timeouts) is part of the measured system.

## Decision

1. **"Mapped" is a spec, written as data.** `eval/spec/attributes.md` defines
   the attribute classes of an NES game a hacker can change (graphics, ROM
   data origins, RAM state, level data, code), each with how it is recorded
   in the mapping file and how it is graded. Per game, `eval/spec/<game>.json`
   lists the instances (SMB: every scene, every HUD field, every enemy...),
   each line carrying its grading method. The SMB coverage checklist in
   `docs/plans/smb-map-coverage.md` moves into that file; the markdown is
   retired once the JSON exists.
2. **A run is a blind DeepSeek session with a task and a budget.** Launched
   through `scripts/trio.sh --blind --task "<sheet task>"` (or a thin runner
   over it), `JEROMY_BLIND=1`, a cost cap per run, the task text naming the
   sheet and the game, never the answers. The reference never reaches a run.
3. **Two graders, and every verdict says which.** (a) `scripts/score-mapping.mjs`,
   extended beyond addresses: an origin claim is graded by whether its ROM
   offset falls inside a reference label of a matching name; a level claim by
   its range against the level data labels; a routine by its entry PC against
   routine labels. Deterministic, over the mapping file. (b) Claude, reading
   the run's screenshots and `read_tile`/`get_region` outputs, for picture
   attributes the reference cannot name. A judged verdict names the image it
   was made from, which is saved beside the grade. The judge is in the score
   only for picture attributes; everywhere the reference can answer, it does.
4. **Every run is recorded and committed** under `eval/runs/<yyyymmdd-hhmm>-<slug>/`:
   the config snapshot (commit, game, spec version, task text, blind, budget),
   the session ids with their replay commands, the grades (one row per claim:
   claim, evidence, verdict, grader), the judged images, and a report with
   the run's failure distribution (lines attempted / reached proof / recorded /
   promoted / graded right) and what changed because of it. The record is the
   deliverable of a run; the mapping file is the deliverable of the campaign.
5. **A holdout game, never tuned against.** Logan brings a second game with a
   full disassembly or RAM map. Its spec is written before SMB tuning
   continues. Tools, skills, prompts and schema are changed only from SMB
   evidence; the holdout is run at milestones (a new skill, a schema change)
   to show the change generalises. A gain on SMB that does not show on the
   holdout is an SMB fix, and the record says so.
6. **The loop.** spec → run → grade → diagnose from the replay → change one
   thing (tool, skill, prompt, schema; with its ADR when it is a decision) →
   re-run → holdout at milestones. What counts as a gain is movement in the
   distribution (more lines reaching proof, fewer wrong records), never a
   scalar alone; a regression stops the loop until it is understood.
7. **Falsify the grader first.** Before any grade is trusted, seed the
   mapping with claims known to be wrong (an address off by one, an origin
   in the wrong table, a tile named for the wrong picture) and show each
   verdict comes back wrong. A grader that passes everything is not a grader.
8. **Autonomy.** Claude runs this unattended. It commits and pushes to
   `origin/main` whenever a change is verified (tests twice, typecheck,
   `/verify` where the emulator is touched, the run's record written); this
   stands as a standing rule for eval-loop work, not only for a run Logan
   starts by hand. It spends the DeepSeek balance; Logan tops it up. It
   stops on: a provider funds error, the bridge down after two `up.sh`
   attempts, a regression it cannot explain, a session that writes outside
   `hacks/`, `mappings/` and the emulator's RAM, or a product-scope question
   (written at the top of the current run's report, then the next line).
   Logan reviews the records and the judged images after the fact and can
   overturn a verdict; an overturned verdict is itself recorded.

## Consequences

- The development loop no longer needs Logan in the chair. His time goes to
  reading `eval/runs/*/report.md` and the git log, and to overturning judge
  calls he disagrees with.
- The spec forces the mapping schema to grow: a run cannot record a scene, a
  metasprite layout, a level range or a routine today, so the first changes
  the loop produces are schema changes (a `note` type, a stable tile key,
  `scene`, `level` and `routine` entries), each with an ADR.
- `score-mapping.mjs` becomes the central piece of test infrastructure and
  gets its own falsification fixtures and unit tests.
- Judged verdicts are an LLM opinion, and the record says so on every row.
  The screenshot beside each one is what lets Logan check the opinion.
- Costs: a blind sheet-3 run is ~2 minutes and a few cents; a sheet-1 pass
  over SMB's scenes will be hundreds of calls. Per-run caps keep a bad run
  from spending the balance; the balance is the campaign budget.
- The holdout doubles the reference-import work and needs a second ROM Logan
  owns. Nothing is fetched (ADR-0017).
- The coverage checklist stops being a hand-ticked markdown file. The human
  view of it is generated from the JSON when wanted, not maintained twice.

## Alternatives

- **Keep building hands-on.** Known to work; limited by Logan's reading
  time, and it never tests whether a skill works without a person steering.
- **An LLM judge for everything.** Simpler; but the reference exists and is
  exact where it applies, and the coinflow lesson is that judge-only scores
  pass broken work. The judge is confined to pictures.
- **Tune on SMB alone, no holdout.** Cheaper; produces an SMB mapper, which
  is the one thing ADR-0019 says not to build.
- **Records outside git** (dsh's session store only). The sessions are
  there already, but a grade, its image and the config that produced it are
  the evidence of a decision and belong next to the ADR that cites them.

## Revisit triggers

- Logan overturns judged verdicts at a rate that makes picture grades
  untrustworthy: then pictures need a labelled gold set from the view
  (label-from-the-view, roadmap item 16 carry-in) before judge grading.
- The holdout stops improving while SMB does across two milestones: the
  skills are overfitting and the spec or the skill shape needs rethinking.
- A game with no reference and no clear pictures (text-heavy, or procedural
  graphics): the grading methods here do not cover it.
- The cost per graded line rises past what the balance supports for a full
  game: the run shape (one sheet per run) needs splitting or caching.
- dsh gains a native eval or batch facility that replaces the runner.
