# Testing

Two layers, and both are required before a roadmap item is called done:
vitest units for what can be pinned without an emulator, and a live Mesen2
session (`/verify`) for the rest. Behavior mapping over coverage numbers:
every tool has a test that names it.

## Running

```bash
npm test              # all suites once; the ship bar runs it twice
npm run test:watch
npx tsc --noEmit      # typecheck (test files are excluded from the build)
```

Vitest picks up `src/**/*.test.ts` and `scripts/**/*.test.mjs`
(`vitest.config.ts`). No DOM environment is needed anywhere.

## Where tests live

```
src/bridge/mesen/
  connection.test.ts      TCP server, newline framing, request ids, timeouts, disconnect
  protocol.test.ts        request/response/error shapes
  adapter.test.ts         each adapter method sends the matching Lua handler and params
src/agent/
  tools.test.ts           every core tool against a mocked EmulatorAdapter
  prompts.test.ts         prompt assembly: emulator status, mapping context, CHR guide
src/mappings/
  loader.test.ts          SHA1 keying, missing file is not an error, merge, prompt formatting
src/dsh/
  core-tools.test.ts      core tool → dsh ToolDefinition mapping, image → attachment, errors
  promote-mappings.test.ts  discoveries → mapping file
  emulator-view.test.ts   SSE pump cadence, pick context line, routes, shutdown
scripts/
  dsh-log.test.mjs        multi-frame zstd decode, transcript rendering, session resolution (ADR-0011)
```

## Patterns

- **Mocked adapter.** Tool tests build an object implementing
  `EmulatorAdapter` with `vi.fn()` per method and assert both the call and
  the rendered result. No socket is opened.
- **Real sockets for the bridge.** `connection.test.ts` starts the server on
  port 0 and connects a `net.Socket`; timing assertions use deadline loops,
  never fixed sleeps.
- **Deadline loops over sleeps.** `emulator-view.test.ts` polls until a
  condition holds or a deadline passes; the suite must survive a loaded
  machine twice in a row.
- **Fixture provenance.** Golden data (tile bytes, palette tables,
  nametable dumps, session event shapes) names the ROM or session and who
  hand-checked it, in a comment at the top of the test.
- **Tool↔test parity** and **Lua handler↔adapter parity** are mechanical
  checks in `/shipshape`; run them before claiming a tool or handler done.

## What units cannot tell you

Whether the Lua side stays under Mesen's 1 s watchdog, whether a palette
override is visible on screen, whether the model reads a screenshot
correctly. That is `/verify`: `scripts/up.sh`, `scripts/trio.sh`, and a
`/replay` of the sessions it produced (`scripts/dsh-log.mjs`).
