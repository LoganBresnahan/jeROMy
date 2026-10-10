# Grades: 20261010-0334-sheet1-koopa-star-r1

Reference: smbdis (doppelganger), ca65 port by threecreepio. Spec: Super Mario Bros. (World) v21. One row per claim (eval/README.md); `final` is the reference verdict held to the proof step.

| line | claim | at | evidence (proof) | reference | final | grader | image |
|---|---|---|---|---|---|---|---|
| A4.koopa | Koopa Troopa (green shell, World 1-1) — World 1-1's one Koopa Troopa, paused while walking left toward Mario (game_mode $0770=1). list_sprites decodes a 6-entry | koopa | look, promoted | needs-judge | confirmed | claude | task-1/8abccc39c41d.png: the green Koopa Troopa at the screen's right edge in this screenshot; OAM $A5 (head) with a $FC filler over $A7/$A6 and $A9/$A8 (shell and feet), all h-flipped: rendered from sprite CHR they are the Koopa facing left, 16x24 |
| A4.star | Starman (star / invincibility power-up) — World 1-1 starman, forced and paused sitting on the used ? block at level x≈336 (screen origin (186,130)), game_mode $07 | starman | look, promoted | needs-judge | confirmed | claude | task-1/7eecd9cce5af.png: the starman rises out of the block in this screenshot; OAM $8D and $8D(h) (the star's upper point) over $E4 and $E4(h) (its lower half), palette 6 attr $63: rendered from sprite CHR they make the five-pointed star |
