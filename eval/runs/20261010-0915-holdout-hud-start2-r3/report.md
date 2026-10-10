# Report: holdout-hud-start2, three repeats (r1-r3), holdout

The holdout check due after the SMB milestone (two new skills,
`play-to-reach` and `find-routine`; the `persist-edit` length step; hex
offsets in `record_mapping`; web tools off in blind runs). Same task text as
`20261009-2224-holdout-hud-start` (rupees, bombs, keys, hearts from Logan's
start state); nothing tuned from holdout grades. Runs
`20261010-0848-…-r1`, `0903-…-r2`, `0916-…-r3`; $0.33; 261, 160, 195 tool
calls; no `web_` call.

## Distribution

| line | before (hud-start r1-r3) | r1 | r2 | r3 |
|---|---|---|---|---|
| C1.rupees | not recorded | not recorded | wrong `$067D` (RupeesToAdd) | not recorded |
| C1.bombs | not recorded | not recorded | right `$0658` | not recorded |
| C1.keys | not recorded | not recorded | right `$066E` | not recorded |
| C1.hearts | not recorded | not recorded | right `$066F`, derived | not recorded |
| (C1.partial_heart, out of scope) | | | right `$0670`, derived | |

No line has a majority, so none of the four is promoted; `$0670` (the
partial heart, a line not in scope) entered as a side discovery.

## Did the SMB gain carry?

Partly. For the first time a holdout repeat recorded its lines, and four of
five were right with write-and-look proofs: r2 finished in 706 s with every
value recorded. But r1 and r3 still ran out the 900 s cap with nothing
recorded, spending their calls on the hearts' two bytes (r1: 109 and 91
mentions of `$066F`/`$0670`), as before (ledger F13). r2's rupee claim is a
real trap of the game: writing RupeesToAdd makes the HUD count up, so the
look "proved" the wrong byte.

None of tonight's SMB changes targets F13, so this measures variance as
much as transfer; the holdout says the method can do these lines and does
not do them reliably.
