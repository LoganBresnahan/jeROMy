# Report: sheet1-koopa-star, three repeats (r1-r3)

The last two SMB lines: the Koopa Troopa (a re-run of
`sheet1-koopa-flag-rerun`, where only r1 of three reached it) and the
starman (first run). One task; its facts added where an earlier repeat
found the Koopa (level x about 1650) and that the item a ? block gives is
kept in RAM while it emerges. Runs `20261010-0334-…-r1`, `0346-…-r2`,
`0356-…-r3`; $0.52 for the series; 186, 206, 231 tool calls; web tools off.

## Distribution

| line | before | r1 | r2 | r3 | decided |
|---|---|---|---|---|---|
| A4.koopa | 1/3 right | right | right | right (the other walk frame) | 3/3, promoted |
| A4.star | not run | right | right | not recorded (cap) | 2/3, promoted |

Judged from the screenshots and the sprite CHR:

- **Koopa:** r1 and r2 caught `$A5` (head) with a `$FC` filler over
  `$A7 $A6 / $A9 $A8`, all h-flipped; r3 caught the other step,
  `$A0 / $A2 $A1 / $A4 $A3`. Both render as the green Koopa facing left
  (`task-1/8abccc39c41d.png` in r1, `c6484d0cdd13.png` in r2,
  `fb918c80e5e1.png` in r3).
- **Starman:** `$8D $8D(h)` over `$E4 $E4(h)`, palette 6, rising out of the
  block (`task-1/7eecd9cce5af.png` in r1, `abefe2bf7017.png` in r2). Both
  repeats made it appear by finding the emerging item's type byte (`$0039`)
  and changing it before the item came out.

## SMB

With these two, every line of `eval/spec/smb.json` (v21) is promoted:
sheet 1 31/31, sheet 2 10/10, sheet 3 30/30, sheet 4 6/6, sheet 5 12/12.
