# Grades: 20261010-0137-sheet2-area-palettes

Reference: smbdis (doppelganger), ca65 port by threecreepio. Spec: Super Mario Bros. (World) v16. One row per claim (eval/README.md); `final` is the reference verdict held to the proof step.

| line | claim | at | evidence (proof) | reference | final | grader | image |
|---|---|---|---|---|---|---|---|
| (none) | underground palette table (World 1-2 / area type 2) — PRG source of the World 1-2 (underground) area palette: 32 bytes at prgRom 0xCEF = CPU $8CEF, 16 BG palettes (4x4) then  | underground | look, promoted | needs-judge | pending | claude |  |
| B1.underground_palette | underground palette table (World 1-2 / area type 2) — PRG source of the World 1-2 (underground) area palette: 32 bytes at prgRom 0xCEF = CPU $8CEF, 16 BG palettes (4x4) then  | $8CEF-$8D0E | write+reset+look, derived by diff, promoted | agrees (expected UndergroundPaletteData $8CEC+36; here: UndergroundPaletteData) | agrees | reference |  |
| (none) | water palette table (World 2-2 / area type 0) — PRG source of the World 2-2 (underwater) area palette: 32 bytes at prgRom 0xCA7 = CPU $8CA7, 16 BG palettes (4x4) then 1 | water | look, promoted | needs-judge | pending | claude |  |
| B1.water_palette | water palette table (World 2-2 / area type 0) — PRG source of the World 2-2 (underwater) area palette: 32 bytes at prgRom 0xCA7 = CPU $8CA7, 16 BG palettes (4x4) then 1 | $8CA7-$8CC6 | write+reset+look, derived by diff, promoted | agrees (expected WaterPaletteData $8CA4+36; here: WaterPaletteData) | agrees | reference |  |
| (none) | castle palette table (World 1-4 / area type 3) — PRG source of the World 1-4 (castle) area palette: 32 bytes at prgRom 0xD13 = CPU $8D13, 16 BG palettes (4x4) then 16 sp | castle | look, promoted | needs-judge | pending | claude |  |
| B1.castle_palette | castle palette table (World 1-4 / area type 3) — PRG source of the World 1-4 (castle) area palette: 32 bytes at prgRom 0xD13 = CPU $8D13, 16 BG palettes (4x4) then 16 sp | $8D13-$8D32 | write+reset+look, not in any diff, promoted | agrees (expected CastlePaletteData $8D10+36; here: CastlePaletteData) | agrees | reference |  |
