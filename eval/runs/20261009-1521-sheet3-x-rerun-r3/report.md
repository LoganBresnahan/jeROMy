# Report: sheet3-x-rerun, three repeats (r1-r3)

A re-run of `20261009-1135-sheet3-hud-position`'s horizontal-position
lines (ledger F8: that run promoted `$0086` with the wrong sentence "no
separate player page byte was found"). Task text: 1135 task 2 narrowed to
the horizontal position (ledger F5). Each repeat started from the mapping
without `$0086`, `$006D`, and every entry or note naming them (`$03AD`,
`$071C`, one note: the broader hold-back, ledger F10). Runs
`20261009-1505-…-r1`, `20261009-1512-…-r2`, `20261009-1521-…-r3`; $0.05,
$0.10, $0.03.

## Against 20261009-1135

| line | before | r1 | r2 | r3 | series |
|---|---|---|---|---|---|
| C2.player_x | agrees, derived | agrees, derived | agrees, derived | agrees, derived | same (3/3) |
| C2.player_x_page | not recorded | agrees, derived | agrees | agrees, derived | **new (3/3)** |

## Ledger checks

- **F8 (a wrong promoted sentence cannot be taken back): passed.**
  `eval-promote` replaced `$0086`'s entry with r1's (3/3 right): the
  sentence is gone, the entry states the 16-bit pair (`$006D` page,
  `$0086` within the page). Residue: the note from `20261009-1144` that
  corrected the old sentence still refers to it; ADR-0022 replaces entries,
  not notes.
- **F10 (start from its own answer): passed.** Each `config.md` lists the
  held-back entries, including the two that named the answers.
- **F1:** no provider error in three tasks.

## The change this run argues for

None.
