# Actor System (EventStateActor / EventStateManager)

The frontend uses a pub-sub actor system ported from [Moby](https://github.com/anthropics/deepseek-vscode-extension) for decoupled state management. Actors publish state and subscribe to state changes without direct references to each other.

```
src/web/state/
├── EventStateActor.ts      # Base class for all actors
├── EventStateManager.ts    # Central coordinator + global state store
├── EventStateLogger.ts     # Structured logging for state flow
├── ShadowActor.ts          # Actor with Shadow DOM encapsulation
├── InterleavedShadowActor.ts # Shadow actor with content interleaving
├── sharedStyles.ts         # Base CSS for shadow actors
└── types.ts                # Shared type definitions
```

---

## Core Concepts

### Actor

An `EventStateActor` is a class bound to a DOM element that declares:

- **Publications**: State keys it produces (via getter functions)
- **Subscriptions**: State keys it consumes (via handler functions)

```typescript
class MyActor extends EventStateActor {
  constructor(manager: EventStateManager, element: HTMLElement) {
    super({
      manager,
      element,
      publications: {
        'myactor.count': () => this.count,     // getter
      },
      subscriptions: {
        'gateway.connected': (val) => { ... }, // handler
        'turn.*': (val, key) => { ... },       // wildcard
      },
    });
  }
}
```

### Manager

The `EventStateManager` is the central coordinator:

```
Actor A publishes "theme.dark" = true
    │
    ▼
EventStateManager
    ├─ Updates globalState["theme.dark"] = true
    ├─ Finds subscribers to "theme.dark" (exact match)
    ├─ Finds subscribers matching "theme.*" (wildcard match)
    └─ Dispatches CustomEvent('state-changed') to each subscriber's element
```

### State Flow

```
Actor publishes state
    │
    ▼
Manager.handleStateChange()
    ├─ Circular dependency check (source in publication chain?)
    ├─ Chain depth check (max 10)
    ├─ Deep equality check (skip if unchanged)
    ├─ Update globalState (deep clone)
    └─ Broadcast to subscribers
         │
         ▼
    Subscriber's element receives CustomEvent
         │
         ▼
    EventStateActor.handleStateChanged()
         ├─ Ignores own changes (source === actorId)
         ├─ Pauses DOM observer
         ├─ Calls subscription handlers
         └─ Resumes DOM observer
```

---

## Key Design Decisions

### Subscription Indexing

The manager uses two indexes for fast subscriber lookup:

- **Exact subscriptions**: `Map<key, Set<actorId>>` — O(1) lookup
- **Wildcard subscriptions**: `Map<pattern, Set<actorId>>` — O(w) where w = number of wildcard patterns (typically small)

This replaced an earlier O(n) scan of all actors.

### Deep Equality / Deep Clone

All state passed through the system is deep-cloned to prevent mutations:

- `publish()` deep-clones before caching locally
- `updateGlobalState()` deep-clones before storing
- `getStateForKeys()` deep-clones before dispatching

Change detection uses `deepEqual()` to skip no-op updates. Both utilities are in `src/web/utils/`.

### Circular Dependency Prevention

The `publicationChain` array tracks the chain of actors that triggered a state change. If an actor appears twice, the update is blocked:

```
A publishes → triggers B's handler → B publishes → triggers A's handler
                                                          │
                                              publicationChain = ["A", "B"]
                                              source = "A" → found in chain!
                                              → BLOCKED (circular dependency)
```

Chain depth is also capped at 10 to prevent runaway cascades.

### Actor ID Generation

Actor IDs are generated from the element ID + class name:

```
element.id = "chat" → actorId = "chat-GatewayActor"
element.id = ""     → actorId = "VirtualListActor-abc123" (uniqueId)
```

Multiple actors can share a DOM element — the class name suffix ensures uniqueness.

---

## Scoping Helpers

Actors use scoping helpers to namespace state keys and avoid collisions:

| Method | Example | Pattern |
|--------|---------|---------|
| `actorScope('status')` | `"chat-GatewayActor.status"` | Instance-specific |
| `typeScope('active')` | `"gateway.active"` | Type-level (strips "Actor" suffix) |
| `globalScope('theme')` | `"global.theme"` | Global |

---

## Shadow DOM Actors

`ShadowActor` extends `EventStateActor` with Shadow DOM encapsulation:

- Creates a `shadowRoot` on the element
- Uses `adoptedStyleSheets` for efficient CSS sharing (see below)
- Provides `render()` and `update()` lifecycle methods

`InterleavedShadowActor` extends `ShadowActor` with content interleaving support (used by `TurnActor` for streaming text + tools + screenshots).

### adoptedStyleSheets Caching

The `EventStateManager` caches parsed `CSSStyleSheet` objects:

```
Manager.getStyleSheet(css)
    │
    ├─ Hash the CSS string (djb2)
    ├─ Check cache: stylesheetCache.get(hash)
    │   ├─ Hit → return cached CSSStyleSheet
    │   └─ Miss → new CSSStyleSheet(), replaceSync(css), cache it
    │
    └─ shadowRoot.adoptedStyleSheets = [baseSheet, componentSheet]
```

This means 100 TurnActor instances share the same two parsed CSSStyleSheet objects instead of each having their own `<style>` element. Shared base sheets are pre-parsed:

- `getShadowBaseSheet()` — base styles for all ShadowActors
- `getInterleavedBaseSheet()` — additional styles for interleaved content

---

## CSS Injection (Light DOM)

For actors that don't use Shadow DOM, the manager provides `injectStyles()`:

- Merges all actor styles into a single `<style id="actor-styles">` in `document.head`
- Idempotent — safe to call multiple times per actor
- Each actor's styles are marked with a comment for debugging

---

## DOM Change Detection

Actors optionally observe their DOM subtree via `MutationObserver`:

```
DOM mutation detected
    │
    ▼
handleDOMChange()
    ├─ Read all publication getters
    ├─ Compare against cached published state
    └─ If changed → publish(changedKeys)
```

The observer is paused during subscription handler execution to prevent feedback loops (subscription updates the DOM → triggers mutation → re-reads state → publishes → ∞).

---

## External Integration

State can be injected from outside the actor system:

```typescript
// Inject state from host application
manager.handleExternalMessage('theme', { dark: true });
// → publishes "external.theme" to all subscribers matching that key

// Direct publish
manager.publishDirect('my.key', value, 'my-source-id');
```

---

## Actors in jeROMy

| Actor | Element | Publications | Subscriptions |
|-------|---------|-------------|---------------|
| `GatewayActor` | `#gateway` | `gateway.connected`, `gateway.streaming` | — |
| `VirtualListActor` | `#turns` | — | `gateway.streaming` |
| `TurnActor` (pooled) | turn elements | — | — |
| `InputAreaActor` | `#inputArea` | — | `gateway.connected`, `gateway.streaming` |

The `VirtualListActor` pools `TurnActor` instances for memory efficiency — see [Streaming Coordination](streaming-coordination.md).
