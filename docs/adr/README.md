# Architecture Decision Records

Every decision gets one: a new dependency, a changed contract or algorithm,
a pattern adopted or rejected. Implementation detail is not a decision.
Nygard style: Context / Decision / Consequences / Alternatives / Revisit
triggers. Supersede rather than rewrite; an amendment is a dated paragraph
under the section it changes, never a silent edit.

Cite as `ADR-NNNN`, in that exact form, in code comments, commit subjects,
test names and plan docs. `grep -rn "ADR-0003" src/` finds the code a decision
governs; `git log --grep 'ADR-0003'` finds the commits that shipped it.

Template: `_template.md`.

## Index

| # | Title | Status | Date |
|---|-------|--------|------|
| [0001](0001-dsh-plugin-not-app.md) | jeROMy ships as a DeepSeek Harness plugin, not an app | Accepted | 2026-10-05 |
| [0002](0002-deepseek-flash-and-provider-layer.md) | `deepseek-flash` by default; the provider layer belongs to dsh | Accepted | 2026-10-05 |
| [0003](0003-persistence-on-dsh.md) | Persistence on dsh's session log and storage; SQLCipher dropped | Accepted | 2026-10-05 |
| [0004](0004-emulator-view-sidebar-page.md) | Emulator view is a loopback page in dsh's sidebar browser | Accepted | 2026-10-05 |
| [0005](0005-core-plus-adapter-layering.md) | Host-agnostic `core/` plus a thin `dsh/` adapter | Accepted | 2026-10-05 |
| [0006](0006-documentation-driven-workflow.md) | Documentation-driven workflow: ADRs, roadmap, issues inbox, skills | Accepted | 2026-10-05 |
| [0007](0007-framebuffer-stream.md) | Push-based binary frame channel for the emulator view, if 10 fps stops being enough | Proposed | 2026-10-05 |
| [0008](0008-curated-rom-hacking-skills.md) | Ship curated ROM-hacking skills with the plugin, one per procedure | Accepted | 2026-10-05 |
| [0009](0009-persistent-edits-ledger-and-patch-export.md) | Persistent edits: find the ROM origin, keep a ledger, export a patch | Accepted | 2026-10-05 |
| [0010](0010-split-scroll-pixel-lookup.md) | Pixel lookups answer from the framebuffer and the scroll in effect at that scanline | Accepted | 2026-10-05 |
| [0011](0011-session-replay-from-dsh-log.md) | Agent sessions are reviewed from dsh's persisted log, not a jeROMy log | Accepted | 2026-10-05 |
| [0012](0012-one-package-plugin-and-bundle.md) | jeROMy installs as one npm package that is both the dsh plugin and a dsh bundle | Accepted | 2026-10-05 |
| [0013](0013-clicks-never-step-and-know-sprites.md) | A click never advances the emulator, and a pick knows which sprite it landed on | Accepted | 2026-10-05 |
| [0014](0014-region-selection-by-palette-slot.md) | The picker selects regions by palette slot, and every selection names its two edit paths | Accepted | 2026-10-05 |
| [0015](0015-clicks-pause-and-queue-behind-checkboxes.md) | A click pauses the game, and clicks reach the model only when the person checks them for the next prompt | Accepted | 2026-10-05 |
