# Grades: 20261009-1656-sheet3-hud-rerun3-r3

Reference: smbdis (doppelganger), ca65 port by threecreepio. Spec: Super Mario Bros. (World) v6. One row per claim (eval/README.md); `final` is the reference verdict held to the proof step.

| line | claim | at | evidence (proof) | reference | final | grader | image |
|---|---|---|---|---|---|---|---|
| C1.coins | coin_count — HUD coin counter behind the "x" in the status bar. Found with no reference by differential search on the two ?-block coi | $07ED-$07EE | write+look, derived by diff, promoted | agrees (expected DisplayDigits+0x16:2 $07ED+2 \| CoinTally $075E; here: none) | agrees | reference | |
| C1.timer | level_timer — The TIME counter. Found with no reference by differential search: an idle interval (no input) diffed 'decreased' left 19 | $07F8-$07FA | write+look, derived by diff, promoted | agrees (expected GameTimerDisplay $07F8+3; here: GameTimerDisplay) | agrees | reference | |
| C1.score | score — MARIO's score. Found with no reference by differential search on two ?-block coins (each +200): diff 'increased' over th | $07DD-$07E2 | write+look, derived by diff, promoted | agrees (expected PlayerScoreDisplay $07DD+6; here: PlayerScoreDisplay \| ScoreAndCoinDisplay) | agrees | reference | |
