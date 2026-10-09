# Report: 20261009-1209-holdout-sheet3 (holdout)

The first holdout run (ADR-0020 §5, eval/README.md step 9), due after the
schema change (ADR-0021) and the `find-variable` extent step: sheet 3 on
The Legend of Zelda (USA, Rev 0), first overworld screen, the same two task
shapes as the SMB runs (HUD counters; position and location). Blind,
deepseek-flash. Nothing is tuned from these grades; this report says only
whether what worked on SMB carried.

## Distribution

| Stage | Count |
|---|---|
| lines in scope | 7 (rupees, bombs, keys, hearts, map location, Link x, Link y) |
| attempted (from the replay) | 5: hearts (damage diffs), rupees/bombs/keys (named, no action changed them), location, x, y |
| reached proof | 3 |
| recorded | 3 |
| derived (in a diff before it was recorded) | 3 |
| promoted | 3 |
| graded right | 3: Link x `$0070`, Link y `$0084`, map location `$00EB` |
| graded wrong | 0 |
| unproven | 0 |
| cost (USD), tool calls, wall time | 0.12 by the balance (dsh's list-price estimate for task 1 alone was $0.51), 262, about 1290 s |

## Did the SMB gains carry?

- **Position and location: yes.** The SMB runs found x and y by diff and
  proved them by writing; on Zelda the same shape found x, y and the map
  location by diff (30, 31 survivors; one narrowing round each) and proved
  them by writing (x and y moved Link; `$00EB` written to the screen north
  of the start, then a walk north arrived one screen further, 103 − 16 =
  87, so the transition read the written value). All three derived, none
  recalled.
- **HUD counters: no.** Task 1 hit the 900 s trio timeout after 173 calls
  with nothing recorded. From the replay: name registration took dozens of
  calls (the cursor and the Select/Start sequence); Octoroks killed Link
  twice during long idle waits; rupees, bombs and keys start at zero and no
  action on the first screens changes them, so there was nothing to diff,
  and the skill offers no other route; the hearts work (damage, then diff)
  produced candidates (`$0615`, `$061C`) whose writes showed nothing. On
  SMB every HUD value could be changed in place within seconds (a coin, a
  timer tick, a stomp); the holdout shows that is an SMB property, not the
  method's.

This is the first holdout run, so it is a baseline. The SMB-side gain from
the extent step (`find-variable`, 20261009-1144) cannot show here: no
multi-digit number was reached.

## Observations for SMB runs (not changes)

- The time cap is part of the measured system (ADR-0020): 900 s was enough
  for every SMB task and not for this one.
- A value that play cannot change quickly is a different problem from one
  that changes noisily. The SMB spec has such lines too (world and level
  were found by recall on SMB, run 20261009-1135); the next SMB run on a
  line like that is where a skill route for it gets built and measured.
