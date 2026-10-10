# ADR-0023: Holdout runs start from a save state the person made by hand; load_state reads Mesen's SaveStates folder

**Status:** Accepted
**Date:** 2026-10-09

## Context

The holdout (ADR-0020 §5) is the only measure of whether a method carries to
a game the worker does not lean on recall for. Its F2 check (the
`find-variable` route for values play does not change) was never reached:
three repeats of `20261009-1327…1358-holdout-hud-f2` hit the 900 s cap
before recording anything, the time spent on Zelda's name registration,
idle deaths and setup, not on the search (`eval/failures.md` F6). Changing
the cap or the task because of holdout grades is tuning against the
holdout, so the choice went to Logan, who picked the start state (option b
in that report). The agent's `save_state`/`load_state` slots live inside the
running `bridge.lua` and vanish when it reloads, so a state made once could
not be reused across runs.

## Decision

1. `load_state` takes `file`: a bare file name in Mesen's own `SaveStates`
   folder (where Mesen's Shift+F1 writes `<rom>_1.mss`). `bridge.lua` reads
   it with `io.open` and passes the bytes to `emu.loadSavestate`; Mesen's
   file format is what the Lua API accepts (verified 2026-10-09: a fresh
   boot, then the file, showed Link on the first screen). A name with a path
   separator or `..` is refused, so no request reads outside that folder.
2. Every holdout run on Zelda begins with one fixed task fact: load
   `Legend of Zelda, The (USA)_1.mss` (file A, three hearts, Link on the
   first overworld screen, made by Logan in Mesen 2026-10-09). The same
   fact for every holdout run from now on; it removes setup, not search.
3. SMB runs keep starting from boot: the setup there is two presses and is
   part of what earlier runs measured.

## Consequences

- Holdout runs spend their cap on the lines. Earlier holdout runs are not
  comparable on time; the grades are (the lines and proof are unchanged).
- The state file lives on Logan's Windows side, not in the repo (it holds a
  RAM image of a commercial game, like a ROM: ADR-0017's never-vendor rule).
  A missing file fails the first call with the path it looked for.
- `load_state` can now read any `.mss` the person keeps; it never writes one.

## Alternatives

- **A longer cap for every run (1800 s).** Doubles the cost of a stuck run
  everywhere to pay for setup on one game.
- **The agent records its own start state.** Needs a TypeScript-side blob
  store and a setup run per bring-up; a hand-made file is one keypress.
- **Leave F2 unmeasured.** The holdout would never test the route it exists
  to test.

## Revisit triggers

- A second holdout game: it gets its own hand-made start file, named in its
  spec.
- A holdout line that needs setup to be measured (name entry, the file
  screen): that run boots instead.
