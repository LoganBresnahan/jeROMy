# Grades: 20261009-1308-sheet3-hud-rerun2-r2

Reference: smbdis (doppelganger), ca65 port by threecreepio. Spec: Super Mario Bros. (World) v3. One row per claim (eval/README.md); `final` is the reference verdict held to the proof step.

| line | claim | at | evidence (proof) | reference | final | grader | image |
|---|---|---|---|---|---|---|---|
| C1.coins | coin_count_display — HUD coin count ("x NN"), two BCD digits: 0x07ED = tens, 0x07EE = ones. Distinct from the binary 1-UP counter 0x075E. Dif | $07ED-$07EE | write+look, not in any diff, promoted | agrees (expected DisplayDigits+0x16:2 $07ED+2 \| CoinTally $075E; here: none) | agrees | reference | |
| C1.timer | level_timer — HUD TIME countdown, three BCD digits: 0x07F8 = hundreds, 0x07F9 = tens, 0x07FA = ones (starts at 400). Differential sear | $07F8-$07FA | write+look, derived by diff, promoted | agrees (expected GameTimerDisplay $07F8+3; here: GameTimerDisplay) | agrees | reference | |
| C1.score | player_score — HUD MARIO score, six BCD digits, most significant first: 0x07DD (10^6) 0x07DE (10^5) 0x07DF (10^4) 0x07E0 (10^3) 0x07E1  | $07DD-$07E2 | write+look, not in any diff, promoted | agrees (expected PlayerScoreDisplay $07DD+6; here: PlayerScoreDisplay \| ScoreAndCoinDisplay) | agrees | reference | |
