---
name: shipshape
description: Verify jeROMy is shipshape — vitest green twice and typecheck clean, docs (DIRECTION / roadmap / ADRs / plans / CLAUDE.md commands) match the code, and the conventions hold (uniform ADR-NNNN citations, no escaped TODOs, every tool has a test, an adapter method exactly where TypeScript calls a Lua handler, the Lua watchdog budget, no dsh imports outside src/dsh). Use after substantive changes, before commits, or when asked whether the project is in order.
---

# /shipshape — repo verification pass

Three gates: **Tests**, **Docs**, **Conventions**. Check all three even if one
fails early — the deliverable is the full report, not the first failure.
Propose fixes; do **not** apply them unless the user asks.

## 0. Scope the audit

```bash
git status --short && git diff HEAD --stat
```

Uncommitted work is the primary audit surface; spot-check the rest. Full
audit only when asked.

## 1. Tests gate

Green **twice in a row** (the flaky bar — the TCP connection and streaming
tests must survive a loaded machine), then typecheck:

```bash
npm test
npm test
npx tsc --noEmit
```

Typecheck has no allowed residual: one error anywhere is a ✗. (Harness
types come through `scripts/link-dsh.sh` symlinks; `npm install` removes
them, so a sudden flood of `@deepseek-ai/*` errors means re-run the link.)

Coverage is judged by **behavior mapping**, not a percentage. Enumerate the
public surface in scope and name the test that pins each behavior. Standing
surfaces:

- **Tools** (`src/agent/tools.ts`, later `src/core/tools/`): every tool name
  appears in a test (mechanical check in the Conventions gate); image-returning
  tools return an image block; write tools warn on CHR ROM; grid tools reject
  bad dimensions.
- **Protocol framing** (`connection.test.ts`, `protocol.test.ts`):
  newline-delimited JSON, request ids matched, error responses surfaced.
- **Adapter** (`adapter.test.ts`): each method sends the matching Lua handler
  name with the right params; every method has a caller outside tests (the
  `NO CALLER` check below).
- **Prompt assembly** (`prompts.test.ts`): emulator status, mapping context,
  CHR guide present when expected.
- **Mapping loader** (`loader.test.ts`): SHA1 keying, missing file is not an
  error, prompt formatting.
- **dsh layer** (once `src/dsh/` exists): each core tool is registered;
  screenshot produces an attachment; a pixel click injects a logged event.

A new or changed public behavior with no test naming it = **gap**. A live
Mesen check is `/verify`'s job; a green suite here does not discharge it.

## 2. Docs gate

**ADRs** (`docs/adr/NNNN-slug.md`). Any **decision** in scope — new
dependency, changed contract or algorithm, pattern adopted or rejected —
needs an ADR or a dated amendment. Implementation detail is not a decision.
Check revisit triggers on ADRs the change touches: a trigger the change fires
must be acted on or explicitly deferred. The index table in
`docs/adr/README.md` lists every file in the directory:

```bash
for f in docs/adr/[0-9]*.md; do grep -q "$(basename $f)" docs/adr/README.md || echo "UNINDEXED: $f"; done
```

**Roadmap** (`docs/roadmap.md`): shipped work checked off; frontier matches
reality; deferred sub-tasks pinned as carry-ins, not dropped.

**DIRECTION.md**: still describes what the product is — loop, shape, bright
lines, non-goals. Scope changes land here, not just in code.

**Plans** (`docs/plans/`): a plan whose work has shipped is marked so at the
top; a plan the change diverged from is amended, not silently contradicted.

**CLAUDE.md Commands**: every listed command still exists and runs.

**Reference docs** (`docs/architecture/overview.md`, `docs/bridge.md`,
`docs/guides/testing.md`, `README.md`): rewritten for the plugin at item 8;
they are held to the same drift check as everything else. A change to the
Lua protocol updates `docs/bridge.md` in the same commit.

Drift check, per doc that names code artifacts:

```bash
git log -1 --format='%ct %h' -- docs/<doc>.md
git log -1 --format='%ct %h' -- <files it describes>
```

If a source is newer than the doc, read the diff since the doc's commit and
either confirm the doc still matches or name the exact stale claim.

## 3. Conventions gate

Everything flagged is a violation unless listed as an allowed escape.

**Tool↔test parity** — every tool name appears in the tool test file:

```bash
T=src/agent/tools.ts; TT=src/agent/tools.test.ts
[ -d src/core/tools ] && T=$(ls src/core/tools/*.ts | grep -v test) && TT=$(ls src/core/tools/*.test.ts)
for t in $(grep -ohE '^\s+name: "[a-z_]+"' $T | grep -oE '[a-z_]+"' | tr -d '"'); do
  grep -q "$t" $TT || echo "UNTESTED: $t"; done
# expect: no output
```

**Lua handler↔adapter parity** — an adapter method exists only because
TypeScript calls it, and every handler TypeScript calls exists in
`bridge.lua`. Handlers no TypeScript code calls are Lua-only probes, reached
from WSL through `scripts/bridge-call.mjs`, and must be on the escape list
below so a new handler without a caller is noticed:

```bash
# Only existing dirs: a missing path makes some greps (ugrep) exit non-zero even on a match.
LUA_ONLY="ping get_lua_logs wait_frames convert_address debug_state debug_step_types"
for h in $(grep -oE '^function handlers\.[a-z_]+' mesen/bridge.lua | sed 's/function handlers\.//'); do
  grep -rq --exclude='*.test.ts' "\"$h\"" src/bridge/mesen/ || echo " $LUA_ONLY " | grep -q " $h " || echo "NO ADAPTER: $h"; done
for m in $(grep -rohE --exclude='*.test.ts' 'request(<[A-Za-z]+>)?\("[a-z_]+"' src/bridge/mesen/ | grep -oE '[a-z_]+"$' | tr -d '"' | sort -u); do
  grep -q "^function handlers\.$m" mesen/bridge.lua || echo "NO HANDLER: $m"; done
for m in $(grep -oE '^  async [a-zA-Z]+' src/bridge/mesen/adapter.ts | awk '{print $2}'); do
  grep -rq --exclude='*.test.ts' --exclude=adapter.ts "\.$m(" src scripts || echo "NO CALLER: $m"; done
# expect: no output
```

`NO ADAPTER` on a handler meant for people: add it to `LUA_ONLY`. On a
handler a tool should use: write the adapter method with its caller.
`NO CALLER`: delete the method and its test (the handler stays, reachable
through `bridge-call.mjs`, and joins `LUA_ONLY`). A method with only a test
pins a name, not a behavior.

**Watchdog budget** — the blocking poll inside `codeBreak` stays under
Mesen's 1-second Lua watchdog:

```bash
awk '/^local POLL_TIMEOUT/{t=$4} /^local POLL_ROUNDS/{r=$4} END{b=t*r; print "budget " b "s"; if (b>=0.9) print "VIOLATION: watchdog budget >= 0.9s"}' mesen/bridge.lua
# expect: budget 0.6s
```

**Every source file is tracked** — an ignore pattern can swallow a source
directory without anyone noticing (`hacks/` matched `src/hacks/` for a day
on 2026-10-05, so ADR-0009's code was never committed):

```bash
comm -23 <(find src scripts mesen skills docs -type f | sort) <(git ls-files src scripts mesen skills docs | sort)
```

Anything printed is either new work to add or a pattern in `.gitignore` to
anchor with a leading `/`.

**dsh import boundary** (ADR-0005) — no harness import outside the adapter
layer:

```bash
grep -rln "@deepseek-ai" src --include='*.ts' | grep -v '^src/dsh/'
# expect: no output
```

**Malformed ADR citations** — `ADR-NNNN` is only a grep target if uniform:

```bash
grep -rniE "adr[ _-]?[0-9]" src docs .claude CLAUDE.md --include='*.ts' --include='*.md' --include='*.js' \
  | grep -v "ADR-[0-9][0-9][0-9][0-9]" | grep -vE "adr-[0-9]{4}-" \
  | grep -v "shipshape/SKILL.md"
# expect: no hits. The hyphen in the first class is load-bearing; the
# trailing-hyphen filter spares lowercase filenames (docs/plans/adr-0005-...).
```

**Escaped carry-ins** — deferred work belongs in `docs/roadmap.md`:

```bash
grep -rn "TODO\|FIXME\|XXX\|HACK" src mesen --include='*.ts' --include='*.lua'
# expect: no hits
```

**Change narration** — comments written to the reviewer, noise after merge:

```bash
grep -rniE "^[[:space:]]*(//|\*|--).*\b(no longer|used to|updated to|changed to|we now|now also|renamed|previously)\b" \
  src mesen --include='*.ts' --include='*.lua'
# review each hit: standing invariant, or narration of a past edit?
```

**Fixture provenance** — golden fixtures (tile bytes, palette tables,
nametable dumps) name the ROM and who hand-checked them. Judgment call by
reading until a `tests/fixtures/README.md` exists; then a row per file.

Judgment calls the greps can't make: an invariant stated without its
`(ADR-NNNN)`; a comment restating an ADR's reasoning instead of citing it; a
rule in a file header rather than at the line where it would be violated; a
prompt-string edit that leaks an editorial aside to the model.

## 4. Report

```
SHIPSHAPE REPORT
  tests        ✓|✗   <n>/<n> twice · typecheck clean · gaps: <behavior lacking a test, or none>
  docs         ✓|✗   ADRs current+indexed · roadmap frontier true · drift: <doc: stale claim, or none>
  conventions  ✓|✗   violations: <file:line, or none>
```

For every ✗, list the concrete fix (file:line, what to change). All green →
the ship is shipshape. 🕹️
