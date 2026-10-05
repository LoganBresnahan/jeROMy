# Overnight run, 2026-10-05

Unattended development while Logan sleeps. Decisions he made before bed, the
order of work, and the conditions that stop it. Read this first in the
morning, then `git log --oneline` and `scripts/dsh-log.mjs list`.

## Decisions (Logan, 2026-10-05 ~21:55)

- **Commit and push per finished, verified roadmap item** to `origin/main`.
  One item, one commit, `ADR-NNNN` in the subject where one applies.
- **Budget: spend the DeepSeek balance** ($9.00 at start). Model-driven work
  stops only on a provider funds error; code and docs continue.
  `scripts/budget.sh` reports the balance between items.
- **Windows sleep:** Logan disables it himself. If the bridge dies and two
  `scripts/up.sh` attempts fail, live verification stops and the item is
  parked as a carry-in.
- **Item 11 preset:** read-only shell plus `read_image`; drop write, edit
  and fs tools.

## Order

1. **Item 8, delete the v0.1 stack.** `src/web`, `src/db`, `src/server`,
   `src/index.ts`, `src/agent/agent.ts`, `src/agent/providers`,
   `src/agent/provider.ts`; README as an install guide; `docs/README.md` and
   architecture docs; drop the `src/db` tsc clause from `/shipshape`;
   remove `npm run dev`/`dev-deepseek.sh`/`chat.mjs` paths that only served
   the old server. Ship bar: tests twice, tsc clean, trio green.
2. **adr-plan ADR-0010**, then **item 12** (`get_pixel_color`, per-scanline
   scroll capture, two-phase bridge request, picker caveat) and **item 13**
   (hue table, hex guidance). Lua watchdog budget unchanged. Verified by the
   trio plus a replayed click session.
3. **Item 9**, register the two drafted skills with `ctx.skills`, add a
   trio check per skill, extend `/shipshape` with the tool-name grep.
4. **Item 11**, the `jeromy` agent preset per the decision above.
5. **adr-plan ADR-0009**, then item 10 parts a and b (`search_memory`,
   `trace_writes`) if the night allows.

Each item ends with: tests ×2, `npx tsc --noEmit`, `/verify` when the
emulator is touched, `/replay` of every session the item produced, findings
to `docs/issues.md`, roadmap ticked, commit, push.

## Stop conditions

- Provider error naming funds or balance; `scripts/budget.sh` reporting
  `available false`.
- Bridge down after two `scripts/up.sh` attempts (Windows asleep, Mesen
  closed, Lua script stopped).
- Tests or typecheck red after two fix attempts on one item: park, carry-in,
  next item.
- A dsh session where the agent writes outside `hacks/`, `mappings/` or the
  emulator's RAM, or a run whose cost exceeds $1 on its own.
- Anything that would need Logan's judgment on product scope: write it as a
  question at the top of this file and move to the next item.

## Morning report

Appended here when the run ends: items shipped with commit SHAs, items parked
and why, balance spent, sessions worth replaying, open questions.
