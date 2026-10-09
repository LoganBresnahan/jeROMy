# Grades: 20261009-1241-sheet5-routines

Reference: smbdis (doppelganger), ca65 port by threecreepio. Spec: Super Mario Bros. (World) v3. One row per claim (eval/README.md); `final` is the reference verdict held to the proof step.

| line | claim | at | evidence (proof) | reference | final | grader | image |
|---|---|---|---|---|---|---|---|
| E5.coin | AddCoin - collect a coin (coin count + coin digits, +200 score, 1-UP at 100) — Entry $BBFE, RTS at $BC48 (0x4B bytes). Found with no reference: the mapping's coin digits $07ED/$07EE have NO direct PR | $BBFE-$BC48 | disassemble, derived by diff, promoted | agrees (expected GiveOneCoin $BBFE+36; here: GiveOneCoin) | agrees | reference | |
| E5.digits | AddBCD - shared signed-digit adder for the HUD counters (coin/timer/score) — Entry $8F5F, main RTS at $8F86 (40 bytes; carry tail through $8F95). Found by trace_writes: watching the self-ticking ti | $8F5F-$8F86 | disassemble, derived by diff, promoted | agrees (expected DigitsMathRoutine $8F5F+9 \| UpdateNumber $BC36+16; here: DigitsMathRoutine) | agrees | reference | |
| C1.coins | coin_count_binary (0-99; reaching 100 gives a 1-UP) — Binary coin counter, separate from the two BCD HUD coin digits at $07ED/$07EE. The coin routine $BBFE does INC $075E at  | $075E | trace, not in any diff, promoted | agrees (expected DisplayDigits+0x16:2 $07ED+2 \| CoinTally $075E; here: CoinTally) | agrees | reference | |
| E5.lose_life | LoseLife - take a life away when Mario dies — Found with no reference by trace_writes on the lives counter $075A while holding Right from the start of 1-1 into the fi | $91CD-$91E8 | disassemble, derived by diff, promoted | agrees (expected PlayerLoseLife $91CD+28; here: PlayerLoseLife) | agrees | reference | |
| E5.timer | DecrementTimer - count the level TIME down — Found with no reference from the mapping's timer digits $07F8-$07FA. trace_writes on the BCD operand byte $0139 for 300  | $B74F-$B7A3 | disassemble, derived by diff, promoted | agrees (expected RunGameTimer $B74F+55; here: RunGameTimer) | agrees | reference | |
