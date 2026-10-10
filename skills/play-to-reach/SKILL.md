---
name: play-to-reach
description: Get the player to a place far into a level by playing, in short checkpointed runs: save_state, a run of held direction plus timed jumps, a look, load_state on any setback. Use when a task needs something that is only on screen further into a level (an enemy past the pipes, the flagpole, a hidden block), or when writing the player's position did not bring the screen along.
whenToUse: The thing to inspect is not on the first screens of a level; a teleport by writing position bytes left the camera behind; a run of held Right keeps ending at an obstacle or a death.
user-invocable: true
---

# Play to a place in a level

Writing the player's position bytes moves the player but not the camera or
the level loader: the screen stays where it was, the player snaps back, or
the level breaks (eval/runs/20261010-0016-sheet1-powerups-koopa-flag, task
3, spent its whole cap on camera writes). Play there instead, in short
runs you can undo.

## Steps

1. **Checkpoint.** `save_state` (slot 1) once the level is running and the
   player is in control. Every later setback goes back here or to the newest
   checkpoint.
2. **Run a short stretch.** `play_input` with about 120-200 frames: hold
   the forward direction (and the run button if the game has one: SMB's B),
   with a jump pulse every 30-40 frames (hold the jump button 15-20 frames,
   then release for the rest of the cycle; a held jump that never releases
   jumps only once). A script is a list of holds, e.g.
   `[{right,b} 25, {right,b,a} 18, {right,b} 25, {right,b,a} 18, ...]`.
3. **Look.** A screenshot after every stretch. If the mapping names the
   player's position (SMB: the page and the x within it), read it too, so
   progress is a number, not a guess.
4. **Keep or undo.**
   - Progress and the player is unharmed: `save_state` (the next slot or
     the same one) and go on.
   - A death, a lost power-up, a lives card, or no progress in two stretches
     (stuck against a wall or a pipe): `load_state` the newest checkpoint
     and change one thing: jump earlier, hold the jump longer for a tall
     obstacle, wait for an enemy to pass, or take a shorter stretch.
5. **Stop at the target.** When the thing is on screen, `pause_emulator`
   and inspect it (`list_sprites`, `get_region`). Record what you came for,
   with `reach` naming the checkpoints or the inputs, so it can be done
   again.

## Report shape

Say where the player got to (the screen, and the position if mapped), how
many stretches and retries it took, which checkpoint holds the target, and
the inputs that cleared the hard spots, so the person can follow or repeat
the route.

## Budget

A level is a few thousand pixels; at a run's speed a stretch of 150 frames
covers about one screen. Expect one stretch per screen and a retry or two
per obstacle. If ten stretches pass with no new screen, report where it is
stuck rather than spending the rest of the session there.

## When not to play

If the game can be sent to another level or area by a mapped variable (SMB:
the area index, written before Start), and the target is near the start of
that area, go there instead. Recording which area holds what is itself
worth a `note`.
