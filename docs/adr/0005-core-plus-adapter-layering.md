# ADR-0005: Host-agnostic `core/` plus a thin `dsh/` adapter

**Status:** Accepted
**Date:** 2026-10-05

## Context

ADR-0001 commits jeROMy to dsh, which is alpha and says breaking changes
are expected. The valuable code (bridge, tools, prompt text, mappings) has
no reason to know about dsh. Today's tools are already shaped as
`{ name, description, input_schema, execute(adapter, input) }`, which maps
one-to-one onto dsh's `defineTool`, and would map equally onto an MCP server.

## Decision

1. `src/core/`: Mesen connection, adapter and protocol; tool specs and their
   executors against the adapter interface; prompt text builders; mapping
   loader and types; disassembler; palette table. **No imports from any
   `@deepseek-ai/*` package.** Unit tests live here against a mocked adapter.
2. `src/dsh/`: the plugin. Registers the Mesen service, maps each core tool
   to `defineTool` (including attachment handling for image results), adds
   the prompt section, declares session events, serves the emulator-view
   page (ADR-0004), and ships the bundle patch and settings card.
3. The boundary is enforced by a grep in `/shipshape`: no `@deepseek-ai`
   import outside `src/dsh/`.
4. If dsh becomes untenable, the replacement is a new adapter over
   `src/core/` (an MCP server is a few hundred lines); core is never
   rewritten for a host.

## Consequences

- A small amount of duplication at the boundary: core tool specs and
  `defineTool` declarations describe the same parameters. Kept mechanical
  by a single mapping function rather than hand-written per tool.
- Image results need a host-agnostic shape in core (bytes plus media type);
  the adapter turns that into a dsh attachment.
- Tests for the dsh layer are integration-shaped and fewer; correctness
  lives in core.

## Alternatives

- **Write tools directly as `defineTool` calls.** Less code today, full
  rewrite if the host changes. Rejected.
- **Core as a separate npm package.** Premature; one repo, two directories,
  one grep.

## Revisit triggers

- The adapter layer grows past a few hundred lines or starts holding domain
  logic. Then the boundary is in the wrong place.
- A second host (MCP, another harness) is actually built; then split the
  package.
