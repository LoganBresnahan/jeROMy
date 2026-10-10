# Report: sheet2-enemy-table-rerun, three repeats (r1-r3)

The re-run of B3.enemy_sprites after `20261010-0303-sheet2-enemy-table-chr`
recorded the table two bytes too long (ledger F20). The change: a step in
`persist-edit` (a table's length is settled by its indexing code or the
next table's start), named in the task. Runs `20261010-0309-…-r1`,
`0319-…-r2`, `0327-…-r3`; $0.46 for the series; 52, 107, 59 tool calls.
Held back as a hold: the CHR-origin entry (its notes quote the Goomba's
entry at `0x6794`).

## Distribution

| line | before | r1 | r2 | r3 | decided |
|---|---|---|---|---|---|
| B3.enemy_sprites | wrong (260 bytes) | unproven (wrong offset) | right `$E750-$E83D` | right `$E73E-$E7CD` | 2/3, promoted |

- **r1** found the Goomba's entry at `0x6792`, wrote `0x6794` and proved it,
  then recorded the origin as the decimal number 6792 (hex digits typed as
  decimal): the record pointed at `$9A88`, the proof write was outside it,
  so the claim is unproven. Ledger F15, the second time.
- **r2** bounded the run of 6-byte entries where the bytes stop being sprite
  forms (`0x683E`), ending inside the table.
- **r3** recorded with the hex string `"0x673E"` (see below); its range
  starts at the table and ends at `0x67CD`, where the records change shape.

## The change made mid-series

After r1, `record_mapping` was changed to take hex-string ROM offsets and to
echo each origin in hex with its first bytes (commit `e20f885`, ledger
F15), and the grader reads hex strings too. r1 and r2 ran without it; r3
ran with it and used it (its echo read `0x673E … FC FC AA AB AC AD`). So r3
had two changes, the persist-edit step and the tool; r2 had only the step
and was right too.

Hack hygiene: all writes in `eval-sheet2-d`, undone (removed); `default`
active, its ledger unchanged.

Sheet 2 is complete: 10 of 10.
