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
| [Settings](plans/settings.md) | Pre-rethink settings plan; superseded by dsh settings |

## Architecture (v0.1, pre-rethink)

These describe the standalone stack that roadmap item 8 deletes. They lag
by design until then; `bridge.md` is kept current regardless.

| Document | Description |
|----------|-------------|
| [Bridge Protocol](bridge.md) | Mesen2 TCP protocol spec: methods, emulator control, Lua API notes. **Survives the rethink.** |
| [Architecture Overview](architecture/overview.md) | v0.1 system diagram, platform abstraction layers, data flow |
| [Phase 4 Plan](architecture/phase4-plan.md) | Tile editing + game mappings + emulator control (shipped) |
| [Agent Core](architecture/agent.md) | v0.1 tool loop, provider abstraction, streaming events, system prompt |
| [Actor System](architecture/frontend/actor-system.md) | v0.1 web UI actors (to be deleted) |
| [Streaming Coordination](architecture/frontend/streaming-coordination.md) | v0.1 gateway interleaving (to be deleted) |

## Guides

| Document | Description |
|----------|-------------|
| [Testing](guides/testing.md) | Test patterns, running tests, mock strategies |
