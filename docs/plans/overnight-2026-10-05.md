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

## Morning report (running log; the last entry is the state when you read this)

**As of 23:10 (local), balance $8.94 of $9.00.** All pushed to `origin/main`.

Shipped, one commit each unless noted:

- `1e7ecc2` ADR-0011 session replay (`scripts/dsh-log.mjs`, `/replay`),
  session-log upload off, overnight plan, `budget.sh`.
- `dea7cb2` item 8: v0.1 stack deleted; README is an install guide.
- `53622df` bridge liveness: heartbeat, Lua file log (`scripts/lua-log.sh`),
  `trio.sh` fails on tool errors and retries after `mesen-up.sh --restart`,
  `scripts/bridge-call.mjs` (call a Lua handler with no dsh, no model).
- `bb72de6` item 13: 64 hue names in the prompt, hex rule; verified by
  asking the model to restate.
- `21bacc7`, `c48346f`, `7a1ebcc` item 12 / ADR-0010 in four phases:
  `get_pixel_color`; two-phase bridge requests + reconnect while paused;
  scroll capture + scanline reconstruction (SMB fixtures); precise
  `get_tile_at_pixel` shared with the picker; `trio.sh click`.
- `4616330` items 9 and 11: skills registered through `ctx.skills`
  (dsh's `skill` tool loads them); `jeromy` agent preset, default, with
  the read-only sandbox as the fresh-session default.

Findings worth your eye (`scripts/dsh-log.mjs show <id>`):

- The Lua client sometimes never saw a headless run end (sat on a dead
  socket); heartbeat fixed it. Evidence in `docs/issues.md`.
- Mesen's single-instance handoff does not reload a running `bridge.lua`;
  every Lua change needs `scripts/mesen-up.sh --restart`.
- Mesen invokes write hooks *before* the write and exposes the loopy
  registers in `getState`, which is what made the scroll reconstruction
  testable against the emulator's own numbers.
- The "palette override invisible after step" report from the edit check
  did not reproduce through the bridge (visible after one `step_frame`);
  entry dropped.

Human checks for you:

1. Open the dsh web UI, start a session: the preset should be **jeROMy**
   and the permission preset **read-only**. Click a pixel in the sidebar
   view; the context line now ends with the rendered color and the scroll
   source.
2. Type `/identify-click` or ask "what did I click" and watch it use
   `get_pixel_color`.

**Update 23:30, balance $8.9x.** ADR-0009 (item 10) is most of the way:

- `83af8c6` search_memory, reset_emulator, convert_address; build plan.
- `c86b886` hack directory, edit ledger (every PRG/CHR write, old/new
  bytes, reason), discoveries on disk, mapping schema v2 `rom_origins`.
- next commit: IPS/BPS writers with independent appliers, `export_patch`,
  `export_rom`, `undo_edit`. **The exported `.hacked.nes` booted in Mesen
  with red bushes from a clean start** (title screen, the `$29` slot of the
  level palette table at PRG `0xCCC` set to `$16`). Original restored and
  the test ledger emptied; the export artifacts are left in
  `hacks/sha1-33d2.../` for you to look at.
- Finding: after Mesen reloads the ROM the ledger and the emulator's copy
  diverge (`docs/issues.md`); `reapply_edits` is the carry-in, never a
  silent re-apply.
- Remaining on item 10: `trace_writes`, the `persist-edit` skill and its
  trio check.

Open questions: none blocking. Next: trace_writes, persist-edit skill, then
item 7 (bundle).
