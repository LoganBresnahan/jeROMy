# Settings — Research & Plan

## Motivation

jeROMy currently uses scattered environment variables for configuration (`ANTHROPIC_API_KEY`, `JEROMY_MODEL`, planned `JEROMY_THINKING_BUDGET`). With the addition of local model support (provider type, base URL, API key), this is becoming unwieldy. We need a proper settings system that:

- Stores all configuration in one place
- Has a UI so users can change settings without restarting the server
- Supports runtime changes (switch model/provider without restart)
- Keeps API keys secure

## Current Environment Variables

| Variable | Used By | Purpose |
|----------|---------|---------|
| `ANTHROPIC_API_KEY` | Anthropic SDK (auto-read) | Claude API key |
| `JEROMY_MODEL` | `src/index.ts` → `AnthropicProvider` | Model name override |

Planned but not yet implemented:
- `JEROMY_THINKING_BUDGET` — extended thinking token budget

## Reference: How Moby Handles Settings

The DeepSeek VSCode extension (Moby) has a mature settings system we can learn from:

- **Storage:** VS Code's `workspace.getConfiguration()` (doesn't apply to us — we're a standalone web app)
- **All settings are global** — not per-session. Same model/temperature applies everywhere.
- **Runtime changes are immediate** — no restart needed, settings apply to the next LLM request
- **Settings UI:** Shadow DOM popup actor (`SettingsShadowActor`) with dropdowns, sliders, text inputs
- **Flow:** UI change → message to backend → persist → next request uses new values
- **Secrets** (API keys) stored separately via VS Code Secrets API

**Moby's settings list** (for reference — what a mature AI tool configures):
- Model selection, temperature, max tokens, max tool call iterations
- System prompt (custom override)
- Log levels (extension + webview, separately)
- Auto-save history, max history sessions
- Web search settings (depth, credits, cache)
- Edit mode (manual/ask/auto)
- Dev mode toggle

## Design Decisions

### Storage: Database (not file)

Settings stored in the existing SQLCipher database (`./data/jeromy.db`) rather than a separate `settings.json`:

1. **Already exists** — no second persistence layer
2. **Atomic writes** — SQLite transactions; JSON file writes can corrupt on crash
3. **Single source of truth** — settings alongside sessions and events
4. **Already encrypted** — SQLCipher handles API key security; plain JSON would leak keys
5. **Query-friendly** — natural path to per-session overrides later (add session_id column)

Schema:
```sql
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL  -- JSON-encoded value
);
```

### No Environment Variable Overrides

Env vars are dropped as a configuration mechanism (except `ANTHROPIC_API_KEY` which the SDK reads automatically by convention). All configuration comes from the database. If someone needs to pre-configure for Docker/CI, they can pre-seed the database.

### All Settings Are Global

Following Moby's pattern — settings are user preferences, not per-session. The same provider/model/temperature applies to all sessions. Per-session overrides can be added later as a natural extension (session_id column in the settings table).

## Settings

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `provider` | `"anthropic" \| "openai-compat"` | `"anthropic"` | LLM provider type |
| `model` | string | `"claude-sonnet-4-20250514"` | Model name/ID |
| `apiKey` | string | `""` | API key (Anthropic or local server) |
| `baseUrl` | string | `""` | Base URL for OpenAI-compatible servers (e.g. `http://localhost:8080/v1`) |
| `temperature` | number \| null | `null` | LLM temperature (null = provider default) |
| `maxTokens` | number | `4096` | Max output tokens per response |
| `maxIterations` | number | `50` | Max tool loop iterations |
| `thinkingBudget` | number | `0` | Extended thinking token budget (0 = disabled, Anthropic only) |

## Architecture

### New: `src/settings.ts` — SettingsManager

```typescript
export interface Settings {
  provider: "anthropic" | "openai-compat";
  model: string;
  apiKey: string;
  baseUrl: string;
  temperature: number | null;
  maxTokens: number;
  maxIterations: number;
  thinkingBudget: number;
}

export class SettingsManager {
  constructor(db: BetterSqlite3.Database);

  /** Get all settings (with defaults for missing keys). */
  getAll(): Settings;

  /** Get a single setting. */
  get<K extends keyof Settings>(key: K): Settings[K];

  /** Update one or more settings. Returns changed keys. */
  update(partial: Partial<Settings>): string[];

  /** Reset all settings to defaults. */
  resetAll(): void;
}
```

- Creates `settings` table on construction (idempotent)
- `getAll()` reads all rows, merges with defaults for any missing keys
- `update()` uses `INSERT OR REPLACE` in a transaction, returns list of changed keys
- Values stored as `JSON.stringify(value)`, parsed on read

### Modified: `src/index.ts` — Provider Factory + WS Actions

**Provider factory function:**
```typescript
function createProvider(settings: Settings, log: LogFn): LLMProvider {
  if (settings.provider === "openai-compat") {
    return new OpenAICompatibleProvider({
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey || undefined,
      model: settings.model,
      log,
    });
  }
  return new AnthropicProvider({
    apiKey: settings.apiKey || undefined,  // falls back to ANTHROPIC_API_KEY env
    model: settings.model,
    log,
  });
}
```

Called at startup and whenever provider/model/apiKey/baseUrl changes. The Agent is recreated with the new provider (conversation history is preserved via `agent.getHistory()` → new agent → `agent.setHistory()`).

**New WS actions:**

| Action | Direction | Payload |
|--------|-----------|---------|
| `settings_get` | client → server | — |
| `settings_get` | server → client | `{ result: Settings }` |
| `settings_update` | client → server | `{ params: Partial<Settings> }` |
| `settings_changed` | server → client (broadcast) | `{ settings: Settings }` |

When `settings_update` arrives:
1. Validate values (provider must be known, maxTokens > 0, etc.)
2. `settingsManager.update(params)` — persist to DB
3. If provider/model/apiKey/baseUrl changed → recreate provider + agent
4. Broadcast `settings_changed` to all connected clients

### New: `src/web/actors/sidebar/SettingsPanel.ts`

A plain class (like `EmulatorSidebar` and `SessionPanel`) that manages the settings UI in the sidebar.

**UI layout** (new panel in the sidebar, between Sessions and Emulator):

```
┌─ Settings ──────────────────────┐
│ Provider:  [Anthropic     ▼]    │
│ Model:     [claude-sonnet-4... ] │
│ API Key:   [••••••••••••••••  ] │
│ Base URL:  [http://localhost...] │  ← shown only when provider = openai-compat
│ Temperature: [───●────] 0.7     │
│ Max Tokens:  [────●───] 4096    │
│ Max Iterations: [──●──] 50      │
│ Thinking Budget: [●───] 0       │  ← shown only when provider = anthropic
│                                  │
│ [Reset Defaults]                 │
└──────────────────────────────────┘
```

**Behavior:**
- On change: sends `settings_update` via gateway WebSocket
- On `settings_changed` from server: updates UI to reflect new values
- API key field is `type="password"` (masked by default, toggle to reveal)
- Collapsible (starts collapsed to save sidebar space)
- Provider dropdown change shows/hides provider-specific fields

### Modified: `src/web/index.html`

Add settings panel HTML to sidebar (between Sessions and Emulator panels):
```html
<div class="panel" id="settingsPanel">
  <h2>Settings</h2>
  <!-- Populated by SettingsPanel.ts -->
</div>
```

### Modified: `src/web/actors/gateway/GatewayActor.ts`

- Handle `settings_changed` messages from server → update SettingsPanel
- Expose `sendSettingsUpdate(params)` method for the SettingsPanel to call
- Request settings on connect (`settings_get`) so the UI populates on load

### New: `src/agent/providers/openai-compat.ts` — OpenAI-Compatible Provider

Implements `LLMProvider` targeting the OpenAI chat completions API format.

**Type mapping:**
- `ImageBlock` → `{ type: "image_url", image_url: { url: "data:image/png;base64,..." } }`
- `ToolUseBlock` → `tool_calls[].function` with JSON args
- `ToolResultBlock` → message with `role: "tool"`, `tool_call_id`, `content`
- `LLMTool` → `{ type: "function", function: { name, description, parameters } }`
- Streaming: parse SSE lines (`data: {...}` / `data: [DONE]`)

**No SDK dependency** — uses `fetch()` directly. The OpenAI format is simple enough that a raw HTTP client is cleaner than adding the `openai` npm package.

## Files

| File | Status | Changes |
|------|--------|---------|
| `src/settings.ts` | **New** | SettingsManager class, Settings interface, DB table |
| `src/agent/providers/openai-compat.ts` | **New** | OpenAI-compatible LLM provider |
| `src/index.ts` | Modified | Provider factory, settings WS actions, use SettingsManager |
| `src/db/index.ts` | Modified | Export SettingsManager (or init settings table in JeromyDatabase) |
| `src/web/actors/sidebar/SettingsPanel.ts` | **New** | Settings UI panel |
| `src/web/index.html` | Modified | Add settings panel HTML |
| `src/web/actors/gateway/GatewayActor.ts` | Modified | Handle settings messages |
| `src/agent/providers/anthropic.ts` | Modified | Accept apiKey from settings (not just env) |

## Runtime Flow

```
User changes "provider" dropdown in sidebar
  ↓
SettingsPanel calls gateway.sendSettingsUpdate({ provider: "openai-compat", ... })
  ↓
GatewayActor sends WS: { action: "settings_update", params: { provider: "openai-compat" } }
  ↓
Server: settingsManager.update({ provider: "openai-compat" })
  ↓
Server: detects provider changed → recreates LLM provider + Agent (preserving history)
  ↓
Server: broadcasts { action: "settings_changed", settings: {...} } to all clients
  ↓
GatewayActor receives → updates SettingsPanel UI
  ↓
Next agent.run() uses new provider
```

## Testing

- `SettingsManager`: get/set/defaults, update returns changed keys, reset, JSON round-trip, unknown keys ignored
- `OpenAICompatibleProvider`: type mapping (messages, tools, images), SSE stream parsing, error handling
- Provider factory: creates correct provider type based on settings
- Integration: change settings via WS → verify provider switches, next chat uses new model

## Verification

1. `npm test` — all existing + new tests pass
2. Start with default settings → Anthropic provider used
3. Change provider to "openai-compat" with local llama-server URL → local model used
4. Change model name → next chat uses new model without restart
5. Refresh browser → settings panel shows persisted values from DB
6. API key is masked in the UI, persisted encrypted in SQLCipher
