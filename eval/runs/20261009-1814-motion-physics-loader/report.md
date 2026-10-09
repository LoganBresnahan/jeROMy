# Report: 20261009-1814-motion-physics-loader

First run of Mario's motion state (sheet 3) and of the physics constants
and the area loader (sheet 5) on SMB. Two tasks; task 2 in a throwaway hack
(removed; the `default` ledger's checksum unchanged). deepseek-flash,
blind, $0.19, 245 tool calls.

## Distribution (spec v11)

| Stage | Count |
|---|---|
| lines in scope | 5 |
| attempted | 5 |
| reached proof | 5 |
| recorded | 5 |
| derived | 3 (the speeds and facing; the constants and the loader came from disassembling the jump and gravity code and the level-start path) |
| promoted | 5 |
| graded right | 5: `$0057` Player_X_Speed, `$009F` Player_Y_Speed, `$0033` PlayerFacingDir, the force tables `$B424`/`$B42B` and max speed `$B443` (E5.physics), `$9C22` GetAreaDataAddrs (the area loader) |
| graded wrong | 0 |
| cost (USD), tool calls, wall time | 0.19, 245, about 16 min |

Unproven duplicates: three neighbouring tables (`PlayerYSpdData`,
`InitMForceData`, `FrictionData`, `MaxLeftXSpdData`) recorded beside the
proven ones without their own write; all at the right labels.

The constant proof, from the replay: a baseline standing jump rose 52 px
(`$00CE` 176 → 124, watched); after the ledgered write of `$04` over
`JumpMForceData[0]` and a reset, the same jump was measured again.

## Spec change made because of this run (v11)

The area-decoder line (D1) excludes loader words: "LoadAreaData" tied D1
and E4 on vocabulary and landed on D1 as `disagrees`; on E4 it is the exact
entry of `GetAreaDataAddrs`. Ledger F9's pattern (a spec line too loose or
too narrow), the fourth time; noted there.

## The change this run argues for

None to the worker.
