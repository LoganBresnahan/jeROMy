---
name: find-variable
description: Find the RAM address of a game variable (lives, coins, timer, score, position, power state) with no disassembly or RAM map, by differential search: snapshot RAM, make the value change by playing, snapshot again, keep the addresses that moved the way the action predicts, repeat, then prove the survivor by writing it and looking. Use when the user asks where a value lives, wants infinite lives or a changed counter, or asks you to map a game nobody has documented.
whenToUse: The user asks which address holds a game value, asks for a cheat or a counter change, or asks you to discover a game's variables; also the first step before a persistent edit of any counter.
user-invocable: true
---

# Find a variable by differential search

Most games have no reference. This procedure needs only the running game:
`snapshot_memory`, `play_input`, `diff_memory`, then `write_memory` and a
screenshot for the proof (ADR-0019). Written from the blind session of
2026-10-06 on Super Mario Bros. (World) that found the lives counter at
`$075A` in two rounds, with `lookup_symbol` held back; the reference agreed
afterwards (`NumberofLives`).

## Steps

1. **Get the game into a state where the value exists.** Take a screenshot
   first. On SMB the title screen needs Start, but Start during the attract
   demo only returns to the title, so press Start, wait a second, press
   Start again, and screenshot to confirm a game began. `play_input` runs a
   script of button holds; each call is at most 600 frames, so chain calls.
2. **Snapshot before.** `snapshot_memory` with a name (`s_start`). The
   default range is the NES's 2 KiB of internal RAM; a game with battery
   SRAM needs a second snapshot at `0x6000`, length `0x2000`.
3. **Make exactly one thing happen, then snapshot after.** Play the action
   that changes the value and nothing else you can avoid: to lose a life
   on SMB, hold Right about four seconds from the start of 1-1 and wait
   about three more for the "WORLD 1-1 x N" card. Screenshot to confirm the
   event happened, then `snapshot_memory` (`s_after1`).
4. **Diff with the filter the action predicts.** `diff_memory` a=`s_start`
   b=`s_after1` filter=`decreased` (a life lost), `increased` (a coin
   taken), or `equals` with `value` when you know the new number. Give the
   diff a `name` (`d1`). Expect dozens of survivors the first time: timers,
   positions, the frame counter all move too (SMB: 29).
5. **Repeat the action and narrow.** Cause the same change again, snapshot
   (`s_after2`), and diff with `from: "d1"` and a new `name` (`d2`). Only
   the survivors of the first round are considered, so the list collapses
   (SMB: 3). Two rounds usually suffice; a third if timers still survive.
6. **Choose by the step pattern.** Among the last few, the real counter
   moves by exactly the amount the action implies each time (`2 → 1 → 0`
   for three lives). Irregular steps are timers or random seeds. Note the
   encoding: SMB stores lives minus one; coins and timers are often BCD, one
   digit per byte.
7. **Prove it by writing.** `save_state` first. `write_memory` a different
   value to the candidate (RAM, not ROM: no `mem_type: prgRom`), cause the
   display to refresh (lose a life, grab a coin), and screenshot the number.
   The display must follow your value; a `read_memory` afterwards shows the
   game's own next step from it. If the display did not change, the
   address is a mirror or a copy: try the other survivors.
   **A number drawn as several digits needs its extent proven too.** Write
   a different digit to every byte of the range you suspect and to one byte
   past each end (`1,2,3,4,5,6,7,8`), make the display redraw, and claim
   only the bytes whose digits appeared, in the order they appeared. A
   digit that never changes may be a fixed tile and a zero may be blanked:
   SMB's score is `$07DD`-`$07E2` (millions to tens), its ones place is a
   fixed `0`, and a proof that wrote `0,0,1,2,3,0` could not tell it from
   `$07DE`-`$07E3` (eval/runs/20261009-1144-sheet3-hud-rerun).
8. **Record it.** `record_mapping` with `mapping_type: "address"`, `id` as
   the hex address, a plain name, `category`, notes giving the encoding and
   how it was proven, and `source: "differential search"`. Only then, if a
   reference is imported, `lookup_symbol` the address to name or dispute
   it; a disagreement is worth a sentence in the notes. `promote_mappings`
   when the user wants it shared.

## When play cannot change the value

Some values do not move in a minute of play: the world and level, a count
that starts at zero with nothing nearby to collect, a power state you have
not earned. Do not guess a block of RAM from what games usually do; search
by the value you can see, then let the screen pick the byte.

1. **Narrow by the shown value.** Note what the screen shows (`WORLD 1-1`,
   `x0`). Snapshot twice across some unrelated play (walk, wait) and diff
   with `filter: "unchanged"`, then `filter: "equals"` with the value the
   byte most likely holds; try the shown number and the shown number minus
   one (games often count from zero). Name each diff and narrow with `from`,
   adding `unchanged` rounds across more varied play (walk, jump, lose a
   life), until `diff_memory` lists every survivor (64 or fewer): bisect only
   what you can see.
2. **Make the display redraw on demand.** Find an event that redraws the
   number from RAM: a lost life (the WORLD card), a screen change, a pause
   menu. You will cause it once per test.
3. **Bisect with save states.** `save_state` first. Write a distinctive
   value (one the screen can show, e.g. 4 for a world) to half of the
   survivors at once (`write_memory` writes one run of bytes, so each
   scattered survivor is its own call; neighbours share one), cause the
   redraw, screenshot, `load_state`. If the
   number changed, the byte is in that half; otherwise in the other half.
   Halve again until one byte is left; about six rounds for 64
   survivors. If the game misbehaves after a write (a crash, a strange
   screen), `load_state` and split that half smaller: some of those bytes
   are not safe to write together.
4. **Prove the last byte alone**: write it on its own, redraw, screenshot
   the number; then record it as usual. A byte found this way came out of
   your own search, so say so in the notes ("equals 0 across play, then
   bisected with writes"). Written from eval/runs/20261009-1135 (world and
   level found by guessing a block) and eval/runs/20261009-1209 (Zelda
   counts that start at zero; ledger F2).

## Report shape

Say the address, the encoding ("stores lives minus one"), how many
survivors each round left, and what the proof screenshot showed. Quote the
raw `diff_memory` results for the last round. Say what you wrote and what
the game displayed, so the user can check the claim against the view.

## When it fails

- Nothing survives `decreased`: the value may be stored inverted or BCD;
  diff `changed` on the same pair and read the candidates' old and new
  bytes.
- Too many survive after three rounds: the action also changes a lot of
  state (a level reload). Make the change in place instead (a coin, a
  single enemy) or `watch` the survivors through a `play_input` run and
  keep the one whose trace matches the action's timing.
- The display never follows the write: the HUD may be redrawn only on an
  event, or the byte is a copy; write before the event that redraws it.
