# Grades: 20261009-1302-sheet3-hud-rerun2-r1

Reference: smbdis (doppelganger), ca65 port by threecreepio. Spec: Super Mario Bros. (World) v3. One row per claim (eval/README.md); `final` is the reference verdict held to the proof step.

| line | claim | at | evidence (proof) | reference | final | grader | image |
|---|---|---|---|---|---|---|---|
| C1.timer | level_timer_digits — The TIME countdown, three BCD bytes, most-significant first: 0x07F8 = hundreds, 0x07F9 = tens, 0x07FA = ones. In World 1 | $07F8-$07FA | write+look, derived by diff, promoted | agrees (expected GameTimerDisplay $07F8+3; here: GameTimerDisplay) | agrees | reference | |
| C1.score | score_digits — The displayed MARIO score, six BCD bytes most-significant first: 0x07DD = millions, 0x07DE = hundred-thousands, 0x07DF = | $07DD-$07E2 | write+look, derived by diff, promoted | agrees (expected PlayerScoreDisplay $07DD+6; here: PlayerScoreDisplay \| ScoreAndCoinDisplay) | agrees | reference | |
| C1.coins | coin_count_display — The two-digit coin counter shown after the coin icon ('x'), two BCD bytes: 0x07ED = tens, 0x07EE = ones. Found with no r | $07ED-$07EE | write+look, derived by diff, promoted | agrees (expected DisplayDigits+0x16:2 $07ED+2 \| CoinTally $075E; here: none) | agrees | reference | |
| C1.coins | coin_count_binary — Binary coin counter (0-99; at 100 it resets to 0 and grants a 1-UP) kept alongside the displayed BCD digits at 0x07ED/0x | $075E | write+look, derived by diff, promoted | agrees (expected DisplayDigits+0x16:2 $07ED+2 \| CoinTally $075E; here: CoinTally) | agrees | reference | |
| (none) | HUD counter extents proven by one-byte-past probes — Extent probes for the three World 1-1 HUD counters (differential search, no reference). Score: wrote 0x07DC..0x07E4 = [9 | hud_value_extents | look | needs-judge | confirmed | claude | images/task-1/5b5e423dd400.png: after writing $07DC-$07E4 = 9,1..8 and taking a coin, the HUD reads "1234760 ×56": $07DD-$07E2 drawn (1,2,3,4,7,6 with the +200), then the fixed 0; neither $07DC=9 nor $07E3=7 appears, and the coin probes $07EC=9, $07EF=8 do not either |
