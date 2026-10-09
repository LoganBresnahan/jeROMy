# Grades: 20261009-1312-sheet3-hud-rerun2-r3

Reference: smbdis (doppelganger), ca65 port by threecreepio. Spec: Super Mario Bros. (World) v3. One row per claim (eval/README.md); `final` is the reference verdict held to the proof step.

| line | claim | at | evidence (proof) | reference | final | grader | image |
|---|---|---|---|---|---|---|---|
| C1.coins | hud_coin_count (displayed two-digit coin counter) — The two digits drawn in the HUD as "xNN" (tile column 13 tens, 14 ones). Found by differential search with no reference: | $07ED-$07EE | write+look, derived by diff, promoted | agrees (expected DisplayDigits+0x16:2 $07ED+2 \| CoinTally $075E; here: none) | agrees | reference | |
| C1.timer | level_timer (HUD TIME, counts down) — The three digits shown after TIME, counting down from 400 (one per ~24 frames via the $0787 divider; the game's tick hel | $07F8-$07FA | write+look, derived by diff, promoted | agrees (expected GameTimerDisplay $07F8+3; here: GameTimerDisplay) | agrees | reference | |
| C1.score | score (HUD MARIO score digits) — Six BCD bytes $07DD-$07E2 = the displayed score divided by 10 (millions..tens of RAM, MSB at $07DD); the ones digit is a | $07DD-$07E2 | write+look, derived by diff, promoted | agrees (expected PlayerScoreDisplay $07DD+6; here: PlayerScoreDisplay \| ScoreAndCoinDisplay) | agrees | reference | |
| C1.coins | coin_count_binary (per-level, 0-99, 100 = 1-UP) — Binary coin counter fed by the coin routine $BBFE (INC $075E) which also grants a 1-UP at 100. Found again by differenti | $075E | write+look, derived by diff, promoted | agrees (expected DisplayDigits+0x16:2 $07ED+2 \| CoinTally $075E; here: CoinTally) | agrees | reference | |
