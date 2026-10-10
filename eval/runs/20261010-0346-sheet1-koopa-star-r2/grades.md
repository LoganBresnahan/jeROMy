# Grades: 20261010-0346-sheet1-koopa-star-r2

Reference: smbdis (doppelganger), ca65 port by threecreepio. Spec: Super Mario Bros. (World) v21. One row per claim (eval/README.md); `final` is the reference verdict held to the proof step.

| line | claim | at | evidence (proof) | reference | final | grader | image |
|---|---|---|---|---|---|---|---|
| A4.star | Starman (star power-up) — The star power-up (Starman) in World 1-1. PROOF: paused with the star emerging from the used left ? block of the brick r | starman | look, promoted | needs-judge | confirmed | claude | task-1/abefe2bf7017.png: the starman rises out of the block in this screenshot; OAM $8D and $8D(h) (the star's upper point) over $E4 and $E4(h) (its lower half), palette 6 attr $62: rendered from sprite CHR they make the five-pointed star |
| A4.koopa | Koopa Troopa — The one Koopa Troopa in World 1-1. PROOF: played to it with the play-to-reach route (checkpoints below), paused while it | koopa | look, promoted | needs-judge | confirmed | claude | task-1/c6484d0cdd13.png: the green Koopa Troopa by the pipe in this screenshot; OAM $A5 (head) with a $FC filler over $A7/$A6 and $A9/$A8 (shell and feet), all h-flipped: rendered from sprite CHR they are the Koopa facing left, 16x24 |
