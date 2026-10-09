# Grades: 20261009-1524-sheet3-hud-rerun3-r1

Reference: smbdis (doppelganger), ca65 port by threecreepio. Spec: Super Mario Bros. (World) v6. One row per claim (eval/README.md); `final` is the reference verdict held to the proof step.

| line | claim | at | evidence (proof) | reference | final | grader | image |
|---|---|---|---|---|---|---|---|
| C1.timer | level_timer_digits (TIME) — World 1-1 level timer shown as TIME. Encoding: three bytes, each holding one decimal digit 0-9 (not packed): $07F8 = hun | $07F8-$07FA | write+look, derived by diff, promoted | agrees (expected GameTimerDisplay $07F8+3; here: GameTimerDisplay) | agrees | reference | |
| C1.timer | level_timer_digits (TIME) — World 1-1 level timer shown as TIME. Encoding: three bytes, each a single decimal digit 0-9 (not packed BCD): $07F8 = hu | $07F8-$07FA | write+look, derived by diff, promoted | agrees (expected GameTimerDisplay $07F8+3; here: GameTimerDisplay) | agrees | reference | |
| C1.coins | coin_count_digits — Coin count shown next to the coin icon in the SMB HUD. Stored as two decimal digits, one per byte, at $07ED (tens) and $ | $07ED-$07EE | write+look, derived by diff, promoted | agrees (expected DisplayDigits+0x16:2 $07ED+2 \| CoinTally $075E; here: none) | agrees | reference | |
| C1.score | score_digits — Six-digit score (plus a fixed 0 ones tile) shown under MARIO. Differential search + write proof. After a coin (+200 from | $07DD-$07E2 | write+look, derived by diff, promoted | agrees (expected PlayerScoreDisplay $07DD+6; here: PlayerScoreDisplay \| ScoreAndCoinDisplay) | agrees | reference | |
