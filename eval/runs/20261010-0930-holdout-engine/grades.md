# Grades: 20261010-0930-holdout-engine

Reference: Data Crystal, The Legend of Zelda/RAM map (GNU FDL 1.2), copied by Logan 2026-10-09; zelda1-disassembly (Aldo Nunez) .dbg. Spec: Legend of Zelda, The (USA) v2. One row per claim (eval/README.md); `final` is the reference verdict held to the proof step.

| line | claim | at | evidence (proof) | reference | final | grader | image |
|---|---|---|---|---|---|---|---|
| C4.frame_counter | frame_counter — Global frame counter in zero page, incremented exactly once per frame (wraps 255->0). Encoding: plain binary, +1 per fra | $0015 | watch, derived by diff, promoted | agrees (expected Frame counter $0015; here: Frame counter \| FrameCounter) | agrees | reference |  |
| C2.link_dir | link_facing_direction — Direction Link faces on the overworld. Encoding is a one-hot bitmask: up=$08, down=$04, left=$02, right=$01. Proven by D | $0098 | write+look, derived by diff, promoted | agrees (expected Link's Direction $0098; here: Link's Direction \| ObjDir \| ObjRoomItemId) | agrees | reference |  |
| C4.game_mode | game_mode — Game mode / screen-state byte: selects whether the overworld is playing or the item subscreen is up. Observed values: 0  | $00E1 | watch, derived by diff, promoted | disagrees (expected Game Mode $0012; here: Item Menu Scrolling Animation \| MenuState) | disagrees | reference |  |
| C4.pause | pause_flag — Game pause flag on the overworld; the game ignores controller input and freezes the action while it is 1. Found by diffe | $00E0 | watch, derived by diff, promoted | agrees (expected Game Paused? $00E0; here: Game Paused? \| Paused) | agrees | reference |  |
| C4.joypad | controller1_buttons — Player-1 controller state as the game reads it: the held-buttons byte for the current frame. The controller-read routine | $00FA | watch, not in any diff, promoted | agrees (expected Player 1 Buttons $00F8 \| Player 1 Buttons $00FA; here: ButtonsDown \| Player 1 Buttons) | agrees | reference |  |
