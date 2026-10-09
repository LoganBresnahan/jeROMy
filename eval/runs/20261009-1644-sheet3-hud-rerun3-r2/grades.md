# Grades: 20261009-1644-sheet3-hud-rerun3-r2

Reference: smbdis (doppelganger), ca65 port by threecreepio. Spec: Super Mario Bros. (World) v6. One row per claim (eval/README.md); `final` is the reference verdict held to the proof step.

| line | claim | at | evidence (proof) | reference | final | grader | image |
|---|---|---|---|---|---|---|---|
| C1.timer | level_timer_TIME (3-digit BCD countdown) — World 1-1 TIME countdown. Encoding: 3 BCD digits, 0x07F8 hundreds, 0x07F9 tens, 0x07FA ones; the HUD redraws each decrem | $07F8-$07FA | write+look, derived by diff, promoted | agrees (expected GameTimerDisplay $07F8+3; here: GameTimerDisplay) | agrees | reference | |
| C1.coins | coin_count (two decimal digits: tens 0x07ED, ones 0x07EE) — World 1-1 HUD coin counter next to the coin icon ("x NN"). Encoding: TWO decimal digit bytes, tens at 0x07ED and ones at | $07ED-$07EE | write+look, not in any diff, promoted | agrees (expected DisplayDigits+0x16:2 $07ED+2 \| CoinTally $075E; here: none) | agrees | reference | |
| C1.score | score (6 decimal digits, most significant first) — World 1-1 HUD score under MARIO (six digits). Encoding: six decimal digit bytes at 0x07DD-0x07E2, most significant at 0x | $07DD-$07E2 | write+look, not in any diff, promoted | agrees (expected PlayerScoreDisplay $07DD+6; here: PlayerScoreDisplay \| ScoreAndCoinDisplay) | agrees | reference | |
