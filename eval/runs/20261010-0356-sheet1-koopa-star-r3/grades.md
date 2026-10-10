# Grades: 20261010-0356-sheet1-koopa-star-r3

Reference: smbdis (doppelganger), ca65 port by threecreepio. Spec: Super Mario Bros. (World) v21. One row per claim (eval/README.md); `final` is the reference verdict held to the proof step.

| line | claim | at | evidence (proof) | reference | final | grader | image |
|---|---|---|---|---|---|---|---|
| A4.koopa | Koopa Troopa (green, walking left) — World 1-1's single Koopa Troopa, the green-shelled turtle, paused while walking left on the ground at level x≈1695 (came | koopa | look | needs-judge | confirmed | claude | task-1/fb918c80e5e1.png: the green Koopa Troopa at the right of this screenshot; OAM $A0 (head) with a $FC filler over $A2/$A1 and $A4/$A3, all h-flipped, palette 5: rendered from sprite CHR they are the Koopa's other walking frame (the same shell, the feet in the other step; r1 and r2 caught $A5-$A9) |
