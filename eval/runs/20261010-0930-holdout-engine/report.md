# Report: 20261010-0930-holdout-engine, holdout

Five Zelda lines run for the first time (holdout; graded the same way, not
tuned against): Link's facing direction, the game mode and the frame
counter; the pause flag and controller 1. Two blind tasks from Logan's
start state; deepseek-flash, $0.06, 138 tool calls, 450 s; no `web_` call.

## Distribution

| line | claim | reference | proof | derived | verdict |
|---|---|---|---|---|---|
| C2.link_dir | `$0098` | Link's Direction | write+look | yes | right |
| C4.frame_counter | `$0015` | Frame counter | watch | yes | right |
| C4.pause | `$00E0` | Game Paused? | watch | yes | right |
| C4.joypad | `$00FA` | Player 1 Buttons (`$00F8`/`$00FA`) | watch | no | right |
| C4.game_mode | `$00E1` | Game Mode is `$0012` | watch | yes | **wrong** |

## Why game mode is wrong

The task said the game mode "changes when the item subscreen opens", and
the worker found the byte that does: `$00E1`, the menu's scroll animation.
Zelda's game mode apparently does not change for the subscreen, so the
fact I wrote pointed it at the wrong byte. The error is in the task, not
the method (as in ledger F9, a spec wrong about the game); a re-run should
use a fact that holds (the mode changes between the title, the file screen
and play).

## What it says

Where play changes a value quickly, the method transfers: four of five,
all but one derived by the session's own diffs, at the first attempt and in
under eight minutes.
