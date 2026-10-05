# jeROMy Documentation

Start here: [DIRECTION.md](DIRECTION.md) is product truth,
[roadmap.md](roadmap.md) is build order (frontier = first unchecked item),
[adr/](adr/README.md) holds every decision, [issues.md](issues.md) is the
inbox for findings from real use. Working rules live in the root
[CLAUDE.md](../CLAUDE.md).

## Direction and decisions

| Document | Description |
|----------|-------------|
| [DIRECTION](DIRECTION.md) | What jeROMy is, the loop, shape (dsh plugin), principles, bright lines, non-goals |
| [Roadmap](roadmap.md) | Now / Next / Later with carry-ins; shipped history |
| [ADRs](adr/README.md) | Decision records, `ADR-NNNN`; index and template |
| [Issues](issues.md) | Findings from real use; deleted when fixed |

## Plans

| Document | Description |
|----------|-------------|
| [dsh migration](plans/dsh-migration.md) | The rethink: model, harness facts, keep/delete table, phases, risks (ADR-0001..0005) |
| [Local model](plans/local-model.md) | Superseded research: Qwen3-VL on Intel Arc (ADR-0002 deferred it) |
| [Overnight 2026-10-05](plans/overnight-2026-10-05.md) | Unattended run: decisions, order, stop conditions, morning report |

## Architecture

| Document | Description |
|----------|-------------|
| [Architecture Overview](architecture/overview.md) | dsh plugin shape: layers, runtime flow, timing constraints, persistence |
| [Bridge Protocol](bridge.md) | Mesen2 TCP protocol spec: methods, emulator control, Lua API notes |
| [Phase 4 Plan](architecture/phase4-plan.md) | History: tile editing + game mappings + emulator control as shipped under v0.1 |

## Guides

| Document | Description |
|----------|-------------|
| [Testing](guides/testing.md) | Test patterns, running tests, mock strategies |
