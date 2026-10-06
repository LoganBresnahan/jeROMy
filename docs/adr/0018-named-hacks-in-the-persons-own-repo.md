# ADR-0018: A game holds many named hacks, the hacks root is the person's own repository, and one hack is active in the emulator

**Status:** Accepted (2026-10-05; proposed from Logan's Halloween/Christmas Mario question and accepted by him the same night, boot-time apply rule included)
**Date:** 2026-10-05

## Context

Release gate 2 (`docs/DIRECTION.md`) says a hack is a thing you boot and
keep iterating on. Today a game has exactly one ledger
(`hacks/sha1-<sha1>/edits.json`, ADR-0009), one patch file overwritten on
each export, and one hacked ROM overwritten the same way. Logan's case: a
Halloween Mario and a Christmas Mario, worked on across many chat
sessions, with version control. His first guess was one git-initialised
directory per game variant. The hack directory is gitignored inside
jeROMy's checkout (or under `~/.dsh/jeromy/` for an installed copy), so
today it is nobody's repository.

Three facts shape the answer. The mapping describes the original and is
the same for every hack of a game. The emulator shows one game at a time,
so only one hack can be applied in it. Every dsh chat session talks to the
one plugin process, so they share the emulator and whatever is applied in
it.

The second bright line says never write PRG or CHR ROM silently. Booting
a hack means writing its ledger into a freshly loaded ROM with no tool
call in the session.

## Decision

1. **A hack is a named directory under the game:**
   `<hacksRoot>/sha1-<sha1>/<hack-name>/` with `edits.json` (the ledger,
   unchanged format), `hack.json` (name, description, created, active
   version counter, exports list) and the exports `<hack-name>-v<N>.bps`
   (and `.ips` on request), each export recording the ledger length it was
   cut from. Exports are never overwritten. The game-level directory keeps
   what is shared across hacks: `discoveries.json`, `reference/` and
   `reference.json` (ADR-0017). Existing single-ledger directories migrate
   into a hack named `default` on first use.
2. **The hacks root belongs to the person.** `hacksDir` in the plugin
   config points anywhere; the README tells people to point it at a git
   repository of their own (one for all their games, or one per game; the
   sha1 subdirectories separate games either way) and to commit it as they
   like. jeROMy writes files there and never runs git. A `.gitignore` is
   seeded in the root ignoring `*.nes` and `reference/`, so the repository
   can be pushed without ever containing a ROM or a disassembly.
3. **One active hack per game, held by the plugin.** `use_hack <name>`
   (tool and view control) makes a hack active: the emulator reloads the
   clean original and the ledger is replayed; `new_hack <name>` creates
   one; `list_hacks` shows them with their edit counts and last export. The
   prompt section and the view's status line always name the active hack
   and its edit count, so every session, new or old, knows which project it
   is editing. Ledger writes go to the active hack; `export_patch` writes
   the next version of it.
4. **Booting applies the active hack, and says so.** When the bridge
   connects and the loaded ROM is the clean original (sha1 match, ledger
   bytes absent), the plugin replays the active hack's ledger and logs it in
   the view and the prompt ("Christmas Mario applied: 14 edits"). The
   bright line is reworded: **never write PRG or CHR ROM without a
   recorded instruction from the person; the active hack's ledger is one.**
   A ROM that does not match the hack's sha1 is left alone with a warning.

## Consequences

- Halloween and Christmas Mario are two directories, two ledgers, two
  version series, one mapping, one git history of Logan's choosing, and a
  `use_hack` to swap the workbench. No per-variant jeROMy checkout, no
  per-variant repository unless he wants one.
- Two chats cannot edit two hacks of one game at the same moment; the
  second `use_hack` swaps the emulator under the first. The status line
  makes that visible; a lock is not worth it at this scale.
- The migration of today's `edits.json` into `default/` is a one-time
  move the plugin performs and announces.
- The prompt grows by one line (active hack); tools grow by three.

## Alternatives

- **One jeROMy checkout or one git repo per variant** (Logan's first
  guess). Duplicates the mapping, the reference and the setup per variant,
  and makes the plugin's per-ROM directory meaningless. Rejected.
- **Branches of one ledger instead of named hacks.** Git branches would
  do it, but then jeROMy would have to drive git to switch what the
  emulator shows. Rejected; named directories need no git to be correct,
  and git can still hold them.
- **Ask on every boot whether to apply the hack.** Safer by the letter,
  annoying in practice, and the person already recorded every edit with a
  reason. Rejected in favour of applying and announcing; the `default`
  hack with an empty ledger changes nothing.

## Revisit triggers

- Someone wants two hacks applied together (a Halloween skin on top of a
  hard-mode hack); then a hack gains a `base` field and ledgers stack.
- Collaboration on one hack from two machines; then the ledger needs
  merge rules beyond append-only sequence numbers.
