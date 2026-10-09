# Report: sheet3-worldlevel-rerun, three repeats (r1-r3)

A re-run of `20261009-1135-sheet3-hud-position`'s world and level lines
after `find-variable` gained "When play cannot change the value" (ledger
F2). Task text: 1135 task 2 narrowed to world and level only (ledger F5,
noted in each config). Each repeat started without `$075F` and `$075C`
(ADR-0022). Runs: `20261009-1317-…-r1`, `20261009-1318-…-r2`,
`20261009-1321-…-r3`.

## Against 20261009-1135

| line | before | r1 | r2 | r3 | series |
|---|---|---|---|---|---|
| C1.world | agrees (not derived) | not recorded | agrees (not derived) | not recorded | no majority |
| C1.level | agrees (not derived) | not recorded | agrees (not derived) | not recorded | no majority |

`comparison.md` marks r1 and r3 `worse`. **The replay explains it, so the
loop does not stop:** both ended on DeepSeek `MALFORMED_RESPONSE` (a tool
call streamed as invalid JSON), and the single resume failed too: r1's
resume in four seconds, r3's after 15 more calls. Neither recorded
anything; nothing about the method was measured in them.

## Ledger checks

- **F2 (values play cannot change): not measurable on SMB.** The one
  completed repeat (r2) took one `unchanged` diff, then read `$0750`-`$076F`
  (the block the model remembers) and wrote candidates there: right, not
  derived, the new route unused. With recall available the skill step is
  skipped (F4). F2 stays `changed`; its test moves to the holdout, where no
  memory short-circuits it.
- **F1 (provider error): reopened.** Two of three repeats lost; one resume
  was not enough either time. The error is not deterministic (a later
  manual resume of r3's session, outside this record, completed), so the
  runner now resumes up to three times.

## Promoted

Nothing (`eval-promote`: no majority). The mapping keeps 1135's entries for
both lines, which are right.

## The change this run argues for

Runner: up to three resumes per task (F1). Cost of the series: see each
`sessions.md`.
