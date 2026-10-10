# Grades: 20261010-0228-sheet4-decoder-rerun-r1

Reference: smbdis (doppelganger), ca65 port by threecreepio. Spec: Super Mario Bros. (World) v19. One row per claim (eval/README.md); `final` is the reference verdict held to the proof step.

| line | claim | at | evidence (proof) | reference | final | grader | image |
|---|---|---|---|---|---|---|---|
| D1.area_format | area object decoder — The area object decoder: it reads a level's layout records and builds the level's objects/blocks from them. CODE SPAN $9 | $9508-$9588 | disassemble, derived by diff, promoted | agrees (expected ProcessAreaData $9508+2 \| AreaParserTaskControl $86E6+3; here: ProcessAreaData) | agrees | reference |  |
