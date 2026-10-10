# Grades: 20261010-0236-sheet4-decoder-rerun-r2

Reference: smbdis (doppelganger), ca65 port by threecreepio. Spec: Super Mario Bros. (World) v19. One row per claim (eval/README.md); `final` is the reference verdict held to the proof step.

| line | claim | at | evidence (proof) | reference | final | grader | image |
|---|---|---|---|---|---|---|---|
| D1.area_format | area object decoder — World 1-1 area object decoder. FOUND by trace_writes read mode on the 1-1 layout records CPU $A690-$A78F (prgRom 0x2690, | $9508 | disassemble, derived by diff, promoted | agrees (expected ProcessAreaData $9508+2 \| AreaParserTaskControl $86E6+3; here: ProcessAreaData) | agrees | reference |  |
