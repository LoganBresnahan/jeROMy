# Report: 20261009-1135-sheet3-hud-position

The first graded run of the eval loop (roadmap item 23 (e), ADR-0020): sheet 3
on SMB, World 1-1, in two blind tasks (HUD counters; world/level and
position). deepseek-flash, $0.04, 97 tool calls, 410 s.

## Question for Logan (methodology, not blocking)

**Answered 2026-10-09: leave as is.** SMB lines count when `agrees` and
proven; `derived` stays a reported column (eval/failures.md F4).

**deepseek-flash knows SMB's RAM map from training.** Task 1's reasoning
says, before any search: "In SMB, TIME is stored as three separate digits
at $07F8-$07FA... But I should find without reference". Task 2 found world
and level by reading "the likely header block" around `$0750` and
testing the two zero bytes there, not by a diff. So on SMB, `blind` means
blind to *our* reference, not to the worker's memory, and an `agrees` there
measures method plus recall. What I did about it: the grader now marks each
claim `derived` (its address came out of the session's own `diff_memory`
before it was recorded) and the distribution counts it; the proof step is
still required either way. What I propose: on SMB, read `derived` as the
method's number and `agrees` as the mapping's; the holdout carries the
claim that the method generalises (Zelda is also well known, so the same
column matters there). If you'd rather SMB lines count only when derived,
that is a one-line change to `eval-grade.mjs`'s `finalVerdict`.

## Distribution

| Stage | Count |
|---|---|
| lines in scope | 8 (coins, timer, score, world, level, player x, x page, y) |
| attempted (from the replay) | 6: timer (one diff round, then the provider error), world, level, x, x page (named as next, then dropped), y |
| reached proof | 4 |
| recorded | 4 |
| derived (in a diff before it was recorded) | 2 (x, y); world and level were read from a block the model went to by recall |
| promoted | 4 |
| graded right (`agrees`) | 4: world `$075F`, level `$075C`, player x `$0086`, player y `$00CE` |
| graded wrong | 0 |
| unproven | 0 |
| cost (USD), tool calls, wall time | 0.04, 97, 410 s |

Two more claims outside the lines in scope, both right: `$03AD` (player
screen x, `Player_Rel_XPos`) and `$071C` (scroll, `ScreenLeft_X_Pos`), found
on the way to x. Grades: `grades.md`; per-line table: `distribution.md`.

Proof images checked by Claude (no picture claims in this run, so no
`claude` rows; these back the `write+look` the grader detected):
`images/task-2/4d734c558b7e.png` shows the card "WORLD 5-3" after `$075F=4`,
`$075C=2` and a lost life; `74017e0edfac.png` shows Mario drawn at about
x=205 after `$0086=200` (the screenshot one frame after the write,
`798a4b07ba69.png`, still showed him at x=45: OAM is built a frame later);
`b9903891669c.png` shows Mario in the air after `$00CE=120`.

## Why lines failed where they did

- **Coins, timer, score: never recorded.** Task 1 ended after 11 calls on a
  provider error, `MALFORMED_RESPONSE: tool input is invalid JSON`: DeepSeek
  streamed a malformed tool call and dsh ended the turn. It had one diff
  round on the timer (22 survivors) and was on track. Not a method failure;
  the runner had no way to continue the session.
- **x page: attempted, dropped.** After proving x and y the model wrote
  "Now the page byte for x" and moved to world/level without coming back.
  The task asked for five values in one session; this one fell off the end.
- **`disassemble` failed twice** (`cs_open failed for arch=6502: error code
  2`) while the model traced `$03AD`'s writer. It worked around it by
  reading the PRG bytes with `read_memory` and decoding them by hand,
  correctly (`LDA $86,X / SEC / SBC $071C / STA $03AD,Y`). The tool had
  never worked for the NES: three bugs (`CS_ARCH_MOS65XX` was 14, which is
  BPF in this Capstone; `HEAPU8`/`UTF8ToString` are not exported by the
  build; the 64-bit address needs a BigInt).

- **What was promoted that is not right.** `$0086`'s description says "No
  separate player page byte was found": SMB has one (`Player_PageLoc`
  `$006D`); the session stopped looking, it did not search and fail. World
  and level are credited `source: "differential search"` though no diff
  found them (see the question above). Mapping entries come only from
  sessions, so these stand until a session overturns them; the x-page line
  of the next run is the place.

## The change this run argues for

**`disassemble` works** (`src/agent/disassembler.ts`, with a test against
the real WASM on SMB's reset bytes). Sheet 5 (routines) cannot be mapped
without it, and this run shows the model reaching for it unprompted.

Eval infrastructure, alongside (not a change to what the worker sees):
`eval-run.sh` resumes a task's session once (`--session-id`, "continue")
when its turn ends on a provider error, and the grader joins a task's
streams so a proof before the error still counts. The grader's line
assignment now lets the head of a claim's name decide over its
parenthetical (`screen_scroll_x (level's left edge)` had landed on the
level line); grades above are after that fix.

## Next

Re-run task 1 (coins, timer, score, x page) as its own run; then the
holdout on the same sheet (the schema change, ADR-0021, is a milestone).
