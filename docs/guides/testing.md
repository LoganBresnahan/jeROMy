# Testing Guide

jeROMiah uses [Vitest](https://vitest.dev/) for all tests. The test suite has **726 tests across 36 files** covering the agent, bridge, state management, and utility layers.

## Running Tests

```bash
npm test             # Run all tests once
npm run test:watch   # Watch mode (re-runs on file change)
```

Vitest is configured via `package.json` scripts — there's no separate `vitest.config.ts`. Test files are co-located with source files using the `*.test.ts` naming convention.

**Note:** Test files are excluded from the TypeScript build via `tsconfig.json`:
```json
"exclude": ["node_modules", "dist", "src/**/*.test.ts"]
```

---

## Test Structure

```
src/
├── agent/
│   ├── agent.test.ts          # Tool loop (mocked provider + adapter)
│   ├── provider.test.ts       # Provider interface type checks
│   ├── prompts.test.ts        # System prompt builder
│   └── tools.test.ts          # Tool definitions + executeTool()
├── bridge/mesen/
│   ├── adapter.test.ts        # MesenAdapter (mocked connection)
│   ├── connection.test.ts     # TCP connection framing
│   └── protocol.test.ts       # Protocol type guards + serialization
└── web/
    ├── state/
    │   ├── EventStateActor.test.ts       # Actor lifecycle, pub/sub
    │   ├── EventStateManager.test.ts     # Manager registration, broadcast
    │   ├── ShadowActor.test.ts           # Shadow DOM, adoptedStyleSheets
    │   └── InterleavedShadowActor.test.ts # Content interleaving
    └── utils/
        ├── codeBlocks.test.ts        # Code fence detection
        ├── deepEqual.test.ts         # Deep equality
        ├── deepClone.test.ts         # Deep clone
        ├── syntaxHighlight.test.ts   # 26 language highlighters
        ├── wildcardMatch.test.ts     # Glob-style wildcard matching
        ├── uniqueId.test.ts          # ID generation
        └── pick.test.ts              # Object key picking
```

---

## Mock Patterns

### Mocking the MesenConnection (adapter.test.ts)

The adapter creates a `MesenConnection` via `new`, so the mock must export a **class** (not an arrow function):

```typescript
vi.mock("./connection.js", () => {
  const mockRequest = vi.fn();
  class MockMesenConnection {
    isConnected = true;
    listen = vi.fn().mockResolvedValue(undefined);
    shutdown = vi.fn();
    request = mockRequest;
  }
  return {
    MesenConnection: MockMesenConnection,
    __mockRequest: mockRequest,  // test-only export for assertions
  };
});

const { __mockRequest } = await import("./connection.js") as any;
const mockRequest = __mockRequest as ReturnType<typeof vi.fn>;
```

This pattern exposes the mock request function so tests can set return values and assert calls.

### Mocking the Adapter (tools.test.ts)

For `executeTool()` tests, create a mock adapter object with all methods:

```typescript
function mockAdapter(overrides: Record<string, any> = {}) {
  return {
    screenshot: vi.fn().mockResolvedValue({ png_base64: "AAAA" }),
    getTileAtPixel: vi.fn().mockResolvedValue({ tile_id: 1, palette_id: 0 }),
    getPalette: vi.fn().mockResolvedValue({ palette_id: 0, colors: [0, 1, 2, 3] }),
    // ... all adapter methods
    ...overrides,
  } as any;
}
```

The `overrides` parameter lets individual tests inject failures:

```typescript
const adapter = mockAdapter({
  getCpuState: vi.fn().mockRejectedValue(new Error("bridge disconnected")),
});
```

### DOM Testing (happy-dom)

State management tests use [happy-dom](https://github.com/nicedoc/happy-dom) for DOM APIs. Enable it per-file with a pragma:

```typescript
// @vitest-environment happy-dom

import { describe, it, expect } from "vitest";
```

This provides `document`, `HTMLElement`, `CustomEvent`, `MutationObserver`, `CSSStyleSheet`, `ShadowRoot`, and other DOM APIs without a full browser.

---

## Test Categories

### Agent Tests

- **agent.test.ts**: Tests the tool loop with a mocked `LLMProvider` that returns predefined responses. Verifies iteration flow, tool execution, abort handling, and event yielding.
- **tools.test.ts**: Tests tool definitions (names, schemas, required params) and the `executeTool()` dispatcher. Verifies default parameters, error handling, and screenshot result type.
- **prompts.test.ts**: Tests system prompt construction with and without runtime context.
- **provider.test.ts**: Type-level tests for the provider interface.

### Bridge Tests

- **adapter.test.ts**: Tests all 15+ adapter methods by mocking the connection's `request()` function. Verifies parameter passing and return types.
- **connection.test.ts**: Tests TCP message framing and request/response matching.
- **protocol.test.ts**: Tests `isErrorResponse()` type guard and JSON serialization round-trips.

### State Management Tests

- **EventStateActor.test.ts**: Actor lifecycle (registration, publication, subscription), scoping helpers, DOM observation, circular dependency handling.
- **EventStateManager.test.ts**: Manager registration, broadcast, subscription indexing (exact + wildcard), external messages, style injection.
- **ShadowActor.test.ts**: Shadow DOM creation, `adoptedStyleSheets` caching, render/update lifecycle.
- **InterleavedShadowActor.test.ts**: Content interleaving (text segments, tool batches, screenshots), fence carry-forward, streaming lifecycle.

### Utility Tests

- **codeBlocks.test.ts**: Code fence detection across languages, nested fences, edge cases.
- **deepEqual.test.ts**: Primitives, arrays, objects, nested structures, special values (NaN, null, undefined, Date, RegExp).
- **deepClone.test.ts**: Structural cloning, reference independence, special types.
- **syntaxHighlight.test.ts**: 26 languages with expected token outputs, language aliases, edge cases.
- **wildcardMatch.test.ts**: Pattern matching with `*` wildcards, dot-separated keys.
- **uniqueId.test.ts**: ID generation, incrementing, prefix handling, counter reset.
- **pick.test.ts**: Object key picking, missing keys, empty input.

---

## Writing New Tests

1. **Co-locate**: Place `foo.test.ts` next to `foo.ts`
2. **Use `vi.fn()` for mocks**: Prefer Vitest's built-in mocking over manual stubs
3. **Use `vi.mock()` for module-level mocks**: Must be at the top level, before imports
4. **DOM tests**: Add `// @vitest-environment happy-dom` pragma and install `happy-dom` as devDependency
5. **Async tests**: Use `async`/`await` — Vitest handles promises natively
6. **No test files in build**: The `tsconfig.json` excludes `src/**/*.test.ts` from compilation

### Test Naming Convention

```typescript
describe("ModuleName", () => {
  it("does specific thing with specific input", async () => {
    // arrange, act, assert
  });
});
```

Use present tense, describe behavior, not implementation.
