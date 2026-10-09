# Falsifying the graders (ADR-0020 §7)

A grader that passes everything is not a grader. Before any run's grade is
trusted, claims known to be wrong are put through both graders and must come
back wrong.

## The reference grader: `smb-claims.json`

`record_mapping` inputs for Super Mario Bros. (World), each with the verdict
`scripts/score-mapping.mjs` must give under `eval/spec/smb.json`. Run by
`scripts/score-mapping.test.mjs` whenever the SMB reference is imported
(`hacks/sha1-33d23c2f.../reference.json`, smbdis via threecreepio's ca65
port; it is never vendored, ADR-0017, so on a machine without it only the
synthetic cases in the same test run).

The wrong claims cover the four shapes ADR-0020 names: an address one off
(coins at `$075F`, player y at `$CF`, a routine one byte past its entry), an
origin in the neighbouring table (the ground palette claimed at PRG `0xCEC`,
which is `UndergroundPaletteData`), a level range that spans two levels
(`0x26E0`+48 runs from `L_GroundArea6` into `L_GroundArea7`), and a right
location under the wrong name (the high score's digits claimed as the
player's score, `AreaNumber` claimed as the level). Two are there because the
pre-spec scorer passed them: player y at `$CF` shares the word "position"
with `Enemy_Y_Position`, so the loose name match agreed; the test keeps that
case to show why claims are graded by spec line.

Checked by Claude, 2026-10-09: every expected verdict was set from the
reference's symbol table (address, kind, size or the next label) before the
scorer was run, and the PRG offsets were converted by hand (NROM-256,
CPU `$8000` = PRG `0x0000`).

## The image judge

The judge is Claude reading a saved screenshot. Its falsification is a claim
about a picture that the picture contradicts, judged the same way a run's
picture claims are, with the verdict written before the reasoning is
checked against the reference or the mapping.

Images are from the blind lives session `b3d6d3a5` (2026-10-06), extracted
with `scripts/dsh-log.mjs show b3d6d3a5 --images`.

| claim | image | verdict | what the image shows |
|---|---|---|---|
| A3.question: "the 16x16 blocks filling the bottom two rows (y 208-239) are ? blocks" | `images/smb-title-b3d6d3a5.png` | rejected | brown ground blocks with dark crack lines, no orange face and no ? glyph; the only orange-brown panel is the logo board |
| A3.hill: "the green mound at the left edge (x 0-80, y 170-208) is a hill" | `images/smb-1-1-start-b3d6d3a5.png` | confirmed | a green rounded mound with dark spots standing on the ground row, left of Mario |
| A3.cloud: "the white shape near (150, 60) is a bush" | `images/smb-1-1-start-b3d6d3a5.png` | rejected | a white cloud with a black outline in the sky, far above the ground; the bushes are the green shapes on the ground at the right |
| A6.hud: "the top row reads MARIO, a score, a coin count, WORLD 1-1 and TIME" | `images/smb-1-1-start-b3d6d3a5.png` | confirmed | "MARIO 000000", a coin icon "x00", "WORLD 1-1", "TIME 396" in white on the sky |

Judged by Claude, 2026-10-09. Logan can overturn a row (eval/README.md).
