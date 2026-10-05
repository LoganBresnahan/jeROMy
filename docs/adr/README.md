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
| [0008](0008-curated-rom-hacking-skills.md) | Ship curated ROM-hacking skills with the plugin, one per procedure | Proposed | 2026-10-05 |
| [0009](0009-persistent-edits-ledger-and-patch-export.md) | Persistent edits: find the ROM origin, keep a ledger, export a patch | Proposed | 2026-10-05 |
