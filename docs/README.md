# jeROMy Documentation

## Architecture

Core system design and component documentation.

| Document | Description |
|----------|-------------|
| [Architecture Overview](architecture/overview.md) | System diagram, platform abstraction layers, data flow, phased roadmap |
| [Bridge Protocol](bridge.md) | Mesen2 TCP protocol spec — methods, message format, Lua API notes |
| [Agent Core](architecture/agent.md) | LLM tool loop, provider abstraction, streaming events, system prompt |
| [Actor System](architecture/frontend/actor-system.md) | EventStateActor/Manager pub-sub, shadow DOM, adoptedStyleSheets |
| [Streaming Coordination](architecture/frontend/streaming-coordination.md) | Gateway interleaving, fence carry-forward, turn lifecycle |

## Guides

Practical guides for development and contribution.

| Document | Description |
|----------|-------------|
| [Testing](guides/testing.md) | Test patterns, running tests, mock strategies, coverage |

## Quick Links

- [README (project root)](../README.md) — Quick start, prerequisites, project structure
- [Bridge Protocol](bridge.md) — Full method reference for the Mesen2 TCP API
- [Architecture Overview](architecture/overview.md) — Start here for the big picture
