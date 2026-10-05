# Issues

Known defects and rough edges, mostly found by real use. This is the
**inbox**, not the plan: `docs/roadmap.md` says what we are building and
`docs/plans/` says how. A finding graduates out of here the moment it earns a
checklist item, an ADR, or a carry-in pinned to the work that will hit it.

Newest first within each section. Delete an entry when it is fixed. The
commit is the record; a file of ticked boxes stops being read.

## Tests

- **`npx tsc --noEmit` fails with 9 errors, all in `src/db/`** (`eventStore.ts`,
  `sessionManager.ts`, `snapshotManager.ts`): the row interfaces passed to
  `stmt.get<T>()` / `stmt.all<T>()` lack the index signature that
  `@signalapp/sqlcipher`'s `Record<string, SqliteValue>` constraint now
  requires. Tests pass because vitest does not typecheck. Not fixed on
  purpose: `src/db` is deleted at roadmap item 8 (ADR-0003). If it must
  compile before then, the fix is `interface EventRow extends Record<string, unknown>`
  or a cast at the nine call sites. Found 2026-10-05. (A stale compiled test under `dist/` failed `npm test` on 2026-10-05; fixed the same day by `vitest.config.ts` scoping the suite to `src/**`. Delete `dist/` if the stale file bothers you; it is gitignored.)

## Bridge

- **`get_tile_at_pixel` resolves the wrong tile on split-scroll frames.**
  The Lua handler reads `ppu.xScroll`/`ppu.yScroll` from `emu.getState()`
  at request time. SMB zeroes the scroll in NMI for the fixed status bar and
  sets the playfield scroll mid-frame after the sprite-0 hit, so the value
  read during vblank or while paused is 0 and the lookup lands on a sky
  tile. Seen 2026-10-05 in Logan's click session: readout said tile $24
  palette 2, the pixel was a pipe rim (palette 0, color $29); the agent
  caught it by sampling the framebuffer. Fix design: (a) `get_pixel_color`
  via `emu.getPixel(x, y)` mapped back to a master-palette index, which is
  ground truth regardless of scroll; (b) a per-scanline scroll capture: a
  write callback on $2000/$2005/$2006 for one frame recording
  `(scanline, value)`, then use the scroll in effect at the clicked
  pixel's scanline. (b) needs a two-phase request in the bridge (install,
  answer next frame). Promoted to ADR-0010 and roadmap item 12. Until fixed, the pixel picker's context line should
  say the tile readout assumes no mid-frame scroll change. Found 2026-10-05.
- **Emulator comes up paused after `scripts/mesen-up.sh` hands the ROM to a
  running Mesen.** `get_emulator_status` reported paused, `screenshot`
  returned an empty PNG, and the first model turn died with a provider 400
  on the empty image. `resume_emulator` fixes it; cause not identified
  (Mesen's PauseWhenInBackground is off). Guard added the same day: the
  screenshot tool now returns an error text naming `resume_emulator`
  instead of an empty image. Carry-in for roadmap item 3: the Mesen service
  should resume (or step one frame) on connect, or the launcher should.
  Found 2026-10-05.
- **`clear_palette_overrides` stops re-applying the override but does not
  restore the original color**; `get_palette` still reads the overridden
  value until the game rewrites that palette entry. Either the tool restores
  `old_color` on clear, or its description says it does not. Decide when
  porting the palette tools (roadmap item 4). Found 2026-10-05.

## Agent / tools

- **Headless runs carried the harness checkout's `AGENTS.md` into the
  agent.** dsh injects the cwd's agent instructions as a USER
  `<agent-instructions>` message; `trio.sh` ran `pnpm dsh` from
  `/home/oof/deepseek-harness`, so every headless turn opened with the
  harness's coding rulebook (thousands of tokens, wrong audience). Seen in
  the first `/replay` of session `0d64843e`, 2026-10-05; fixed the same day by
  running `bin.ts` from `~/.cache/jeromy/headless-cwd` (dsh walks up from
  the cwd, so a directory inside the jeROMy repo picked up our own
  `CLAUDE.md` instead; session `e64df8b5`). `/replay` lists the injected
  kinds under `inputs`; `agent-instructions` there means the cwd is wrong.
  If a `dsh-dev.sh` web session shows it, the workspace picker chose a repo
  with an `AGENTS.md`/`CLAUDE.md`.
- **`$`-prefixed hex collides with Markdown emphasis in the chat.** One
  answer in the 2026-10-05 click session rendered
  "sky-blue / 29lightgreen∗∗/∗∗29lightgreen∗∗/∗∗1A dark green": bold markers
  and `$29` mangled each other. Whether dsh's renderer or the model's
  output is at fault, the cure is on our side: prompt guidance to write hex
  as `0x29` or in code spans (roadmap item 13). Found 2026-10-05.

- **In the web app the agent still has Bash, read_image and the fs tools**
  despite the dev patch disabling `tool-bash`/`tool-fs`: dsh's web bundle
  already disables those base rows and each agent preset mounts its own
  tool rows inside its realm, so only headless runs honored our disables.
  Not simply a bug to fix: in the 2026-10-05 click session the agent used
  Bash (Python) to crop and annotate the screenshot and sample the exact
  pixel color, which is how it caught the tile-readout error above.
  Decision for roadmap item 11: a `jeromy` preset that keeps a read-only
  shell and `read_image` and drops write/edit, versus no shell at all.
  Found 2026-10-05.
- **Unpromoted discoveries die with the process.** `record_mapping` results
  live in memory on the Mesen service until `promote_mappings` writes them.
  A crash or restart between the two loses them; dsh's session log still
  has the tool results, so they are recoverable by hand. Fix: a
  `ctx.storageDomain` ledger keyed by ROM SHA1 (roadmap item 5 carry-in).
  Found 2026-10-05.

- **Model slip on the headless read check (2026-10-05)**: raw values were
  reported correctly, but the summary called NES color 54 ($36, orange) "a
  duplicate of black"; in the click session it again guessed "$29-ish" and
  "$1A-ish" before reading the table (and recovered). Roadmap item 13: a
  master-palette hue table in the prompt section.

- **v0.1 agent streams DeepSeek thinking blocks as raw JSON text**
  (`{"type":"thinking",...}` lines in the reply) when run through the
  Anthropic-compatible endpoint, because Phase 4.5 never landed. Not worth
  fixing: the agent loop is deleted at roadmap item 8 and dsh handles
  thinking. Documented so the model-check transcripts are read correctly.
  Found 2026-10-05.
