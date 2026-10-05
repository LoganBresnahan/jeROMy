# ADR-0008: Ship curated ROM-hacking skills with the plugin, one per procedure

**Status:** Proposed (scheduled after roadmap items 7 and 8)
**Date:** 2026-10-05

## Context

The plugin gives the model 24 tools and a system prompt with the NES
reference. What it does not give is *procedure*: the order of operations an
experienced ROM hacker follows for a given kind of change, the checks that
catch the classic mistakes (a palette shared by two objects, a CHR ROM write
that cannot be undone, a memory address that only looked like the lives
counter), and when to record a discovery versus keep it a hypothesis. Tonight's
edit check showed the model inventing a sound procedure on its own (pause,
toggle, single-step, compare) at a cost of 21 steps and 180k tokens. Written
down once, that procedure is a few hundred tokens loaded on demand.

dsh has a skill system built for exactly this. A skill is a directory bundle
`<name>/SKILL.md` with YAML frontmatter (`name`, `description`, optional
`whenToUse`, `disable-model-invocation`, `user-invocable`) and a Markdown
body; `dsh-skill` keeps one merged catalog from any provider; `dsh-tool-skill`
lets the model list and load skills on demand; the invocation policy decides
whether a skill is also a `/command` for the person. Providers are the local
filesystem (`dsh-skill-filesystem`, with `customSkillDirs`) or in-memory
registration through `ctx.skills.register(...)` from a plugin. dsh's own
agent preset ships four skills this way. Separately, `dsh-workflow` runs
model-written JavaScript that fans work out to subagents.

## Decision

1. **jeROMy ships a `skills/` directory in the plugin package, one skill per
   ROM-hacking procedure.** The plugin registers them itself through
   `ctx.skills` at load, so installing the bundle needs no patch edits and the
   catalog cannot drift from the installed version. (`customSkillDirs` is the
   fallback if the registry API proves awkward; a profile patch replaces a
   row's config wholesale, which makes that path fragile for users.)
2. **Each skill is a procedure, not a reference.** Shape: when to use it; the
   steps in order naming the exact tools; the checks that catch the known
   traps; the verification step, always a screenshot before and after
   (DIRECTION: verify by looking); and what to `record_mapping`, at what
   confidence, and when to call `promote_mappings`. Reference material
   (hardware facts, palette tables) stays in the system prompt section.
3. **Skills map to the stages of a hack.** The initial set:
   - `rom-orient`: identify the ROM, check for a mapping, survey the screen,
     list palettes, name the obvious tiles. Stage 0 of every session.
   - `palette-swap`: recolor one object without recoloring its neighbors
     (shared-palette check, write, verify, record).
   - `tile-redraw`: edit an 8x8 CHR tile from an ASCII design (CHR RAM vs
     CHR ROM, unused-slot search, verify).
   - `sprite-swap`: replace a multi-tile sprite (`find_unused_tiles`,
     `write_sprite`, OAM facts).
   - `find-variable`: locate a game variable in RAM by changing state and
     diffing reads; record as an address with honest confidence.
   - `layout-edit`: place or move background tiles in the nametable.
   - `promote-and-share`: review the session's discoveries, promote, and
     where the mapping file goes.
   Later, when the tools exist: `patch-export` (IPS/BPS) and `routine-map`
   (disassembly-guided).
4. **Both surfaces.** Skills are model-invocable (the model loads
   `palette-swap` when the user asks for a recolor) and user-invocable
   (`/palette-swap` as a command for the person who knows what they want).
5. **Workflows only for genuinely parallel work.** A `dsh-workflow` script
   is reserved for tasks that fan out, such as surveying every CHR tile of a
   bank in parallel or diffing RAM across many save states; sequential
   procedures are skills. No workflow ships in the first set.
6. **Every shipped skill has a scripted check.** `scripts/trio.sh` grows a
   check per skill (a task that should cause the skill to load and follow
   the procedure), and `/shipshape` gains a grep that every tool name a
   skill mentions exists in the core registry.

## Consequences

- Procedures become reviewable text with a test, instead of behavior that
  depends on the model rediscovering them. Token cost per hack drops; the
  load is on demand, not in every prompt.
- Skills are versioned with the tools and the mapping format; a renamed
  tool breaks a skill, which the grep catches.
- The skill files are also the user documentation for how to do each kind
  of hack, which the README can link to rather than restate.
- Writing good procedures requires doing the hacks; the first versions
  come out of real sessions on SMB, not from imagination.

## Alternatives

- **Put the procedures in the system prompt.** Simple, but every turn pays
  for every procedure, and the prompt is already the NES reference.
  Rejected.
- **Claude Code skills in `.claude/skills/`.** Those are for developing
  jeROMy, not for using it; a dsh user never sees them. Rejected for this
  purpose (they stay for the dev flow, ADR-0006).
- **Workflows for everything.** Multi-agent orchestration for a
  seven-step sequential procedure is overhead with no parallelism to
  exploit. Rejected except as decision 5 allows.
- **One big "rom hacking" skill.** Loads everything for any task; the
  catalog exists so the model can pick the one it needs. Rejected.

## Revisit triggers

- dsh changes the skill frontmatter or registration API.
- The set passes about ten skills; then add a category index skill or
  split by console.
- A skill keeps needing code (loops, arithmetic, state); that is a tool,
  not a skill, and goes into core.
