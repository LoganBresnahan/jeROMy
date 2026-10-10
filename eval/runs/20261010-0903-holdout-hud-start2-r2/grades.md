# Grades: 20261010-0903-holdout-hud-start2-r2

Reference: Data Crystal, The Legend of Zelda/RAM map (GNU FDL 1.2), copied by Logan 2026-10-09; zelda1-disassembly (Aldo Nunez) .dbg. Spec: Legend of Zelda, The (USA) v2. One row per claim (eval/README.md); `final` is the reference verdict held to the proof step.

| line | claim | at | evidence (proof) | reference | final | grader | image |
|---|---|---|---|---|---|---|---|
| C1.rupees | rupee_count — Rupee count, one byte 0-255, drawn as the top HUD counter (diamond icon) with a two-digit decimal display (X + digit). F | $067D | write+look, not in any diff, promoted | disagrees (expected Number of Rupees $066D; here: Number of rupees to add \| RupeesToAdd) | disagrees | reference |  |
| C1.keys | key_count — Key count, one byte 0-255, drawn as the middle HUD counter; the icon tile loaded in CHR RAM is a key (bow + toothed shaf | $066E | write+look, not in any diff, promoted | agrees (expected Number of Keys $066E; here: InvKeys \| Number of Keys) | agrees | reference |  |
| C1.bombs | bomb_count — Bomb count, one byte 0-255, drawn as the bottom HUD counter; the icon tile loaded in CHR RAM is a round bomb with a lit  | $0658 | write+look, not in any diff, promoted | agrees (expected Number of Bombs $0658; here: InvBombs \| Number of Bombs) | agrees | reference |  |
| C1.hearts | heart_meter (containers + current hearts) — Link's heart meter, one byte packing both the container count and the current hearts. High nibble = (max/container heart | $066F | write+look, derived by diff, promoted | agrees (expected Heart Containers $066F; here: Heart Containers \| HeartValues) | agrees | reference |  |
| C1.partial_heart | heart_fraction (fill of the rightmost heart) — Fill amount of the rightmost heart in the meter (the $0670 byte paired with $066F). Discovered by differential search: i | $0670 | write+look, derived by diff, promoted | agrees (expected Partial heart $0670; here: HeartPartial \| Partial heart) | agrees | reference |  |
