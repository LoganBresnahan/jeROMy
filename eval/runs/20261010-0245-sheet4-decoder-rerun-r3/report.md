# Report: sheet4-decoder-rerun, three repeats (r1-r3)

The re-run of D1.area_format (the area object decoder) after one change:
the `find-routine` skill (ledger F18), named in the task. Runs
`20261010-0228-…-r1`, `0236-…-r2`, `0251-…-r3`; $0.33 for the series; 62,
79, 119 tool calls. Held back as holds: the 1-1 and 1-2 level entries and
the notes naming the parser.

## Distribution

| line | before | r1 | r2 | r3 | decided |
|---|---|---|---|---|---|
| D1.area_format | wrong (`$950A`) | right `$9508` | right `$9508` | not recorded (cap) | 2/3, promoted |

`comparison.md` in r3 says `worse` (a wrong claim outranks none); the
replay explains it: r3 also reached `$9508` and its caller at `$9401`, then
spent the rest of the cap on the proof write to 1-1's layout and was cut off
before recording.

## Did the change work?

Yes. r1's record quotes the callers, `JSR $9508` at `$9401` and `$94D3`,
and follows them up through the task dispatcher's table; r2 records the
same entry. The `lookup_symbol` calls in r1 and r2 tripped the blind check
but were refused (the reference is held back in blind runs), so nothing
leaked.

## Found after r3: a hack left active

r3 hit the cap with its throwaway hack `eval-sheet4-c` active and four
ledgered writes live in Mesen's copy of the ROM. The `default` ledger was
never touched (checksum unchanged). Restored by hand: `default` made
active, the throwaway hack removed, Mesen restarted, and the edited bytes
read back equal to the ROM file. `eval-run.sh` now does this after every
run and says so in `config.md`.

Sheet 4 is complete: 6 of 6.
