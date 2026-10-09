# Grades: 20261009-1209-holdout-sheet3

Reference: Data Crystal, The Legend of Zelda/RAM map (GNU FDL 1.2), copied by Logan 2026-10-09; zelda1-disassembly (Aldo Nunez) .dbg. Spec: Legend of Zelda, The (USA) v2. One row per claim (eval/README.md); `final` is the reference verdict held to the proof step.

| line | claim | at | evidence (proof) | reference | final | grader | image |
|---|---|---|---|---|---|---|---|
| C2.link_x | link_x_screen_position — Link's horizontal position on the screen, one byte, direct screen pixel (0=left edge, increases rightward). Found by dif | $0070 | write+look, derived by diff, promoted | agrees (expected Link's X-position on the screen $0070; here: Link's X-position on the screen \| ObjX) | agrees | reference | |
| C2.link_y | link_y_screen_position — Link's vertical position on the screen, one byte, direct screen pixel (0=top, increases downward). Found by differential | $0084 | write+look, derived by diff, promoted | agrees (expected Link's Y-position on the screen $0084; here: Link's Y-position on the screen \| ObjY) | agrees | reference | |
| C1.room | overworld_screen_location — Which overworld screen Link is on. Value = row*16 + column, i.e. (row&lt;&lt;4)\|col; north = -16, south = +16, east = + | $00EB | write+look, derived by diff, promoted | agrees (expected Map location $00EB; here: Map location \| RoomId) | agrees | reference | |
