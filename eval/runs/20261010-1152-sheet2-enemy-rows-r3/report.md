# Report: 20261010-1129 / -1141 / -1152-sheet2-enemy-rows r1-r3

**Product-scope question for Logan.** Naming pixel-art enemies from their
tiles is beyond `deepseek-flash`'s eye: all three repeats assembled the right
rows into the right pictures (`view_tiles`, byte-identical to a render from
the ROM file) and named about a quarter of them. Bowser was called Bullet
Bill, a Piranha Plant head, and "a curved-shell creature". Either naming
pictures goes to a stronger vision model (the worker setting in ADR-0024,
Open 1), or picture naming gets a second signal: where the object appears
in play, which the worker can reach with `play-to-reach`. This is the same
question as ADR-0024's default worker, measured on pictures this time.

One new SMB line, `B3.enemy_rows` (spec v22): name what every row of the
enemy sprite layout table draws, with the table's first and last row. It
came from Logan's session `ff5f8d4d`, where the model played to 1-4 for
Bowser's tiles that the promoted table note already held, unnamed (ADR-0025).
Three blind repeats, `deepseek-flash`, $0.49 in all ($0.11, $0.16, $0.22),
101 / 120 / 80 tool calls, 44-56 `view_tiles` calls each; no `web_` call, no
left hack.

## Distribution

| repeat | bounds (first / last row) | rows right (of 43) | Bowser's 4 rows | proof | verdict |
|---|---|---|---|---|---|
| r1 | `0x673E` / `0x683A`, right | 10 | "Bullet Bill" | Koopa row over the Goomba's, reset, 1-1, Goomba drawn as Koopa | wrong |
| r2 | right; also found and decoded the offsets table at `0x6840` | 11 | "Piranha Plant head" | same | wrong |
| r3 | right | 12 | "curved-shell creature, frames 1-4" | same | wrong |

Judged by Claude against the disassembly's row comments
(`EnemyGraphicsTable`, 43 rows); each verdict names its image in
`judged.json` (the repeat's `view_tiles` picture of Bowser's front row,
`0x6810`). The line's bar was the bounds, Bowser's four rows, and 80% of
the rows; every repeat cleared the first and none the others. Nothing
promoted for the line.

What every repeat got right: the Koopa Troopa (4 rows), the Goomba, the
defeated Goomba. What most got wrong: the Koopa and Buzzy Beetle shells
(read as Goomba frames, Blooper, Spiny), the Princess and the mushroom
retainer (read as Lakitu, Cheep Cheep, Piranha), Bowser. r3 described what
it could not name ("small walker", "two-part creature") instead of
guessing, which is the honest failure; r1 and r2 named confidently and
wrongly.

## What did transfer: the table's true bounds

All three found the table at `prgRom 0x673E-0x683F` (43 rows) by reading
past the note's bounds as the task asked, and each recorded it as an origin
the reference grades **agrees**. The promoted note said `0x6744-0x683D`, one
row late and two bytes short, and called the table's own reader
(`LDA $E73E,X` at `0x6BAA`) "a different pointer table". The reference's
grade of the original line could not see this: an origin agrees when its
offset falls inside the label, whatever its bounds (ledger F22). On 3 of 3
repeats with the reference agreeing, the note in
`mappings/sha1-33d23c2f…json` gains a dated correction: the true bounds,
the reader, the 27-byte offsets table at `0x6840` (r2's finding, checked
against the ROM), and the two proven rows. No row names go in.

## Changed because of it

- `eval/failures.md` F21 (naming pictures from tiles) and F22 (the origin
  grader passes wrong bounds).
- The mapping note's correction above.
- Nothing in the tools or skills: the picture was right, and a model's eye
  is not a tool fix (ADR-0025, Revisit triggers).

## A re-run checks

With a stronger vision worker, or with a play step that sees each enemy in
the game, Bowser's rows are named and at least 35 of 43 rows are right.
