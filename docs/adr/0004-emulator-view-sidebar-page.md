# ADR-0004: Emulator view is a loopback page in dsh's sidebar browser

**Status:** Accepted
**Date:** 2026-10-05

## Context

The one UI surface jeROMy needs that a chat harness does not provide: a
live emulator view with zoom, a pixel picker that tells the agent which tile
and palette the user clicked, and pause / step / resume buttons. In v0.1 this
is the left panel of our own web app.

dsh's client-side extension story is thin in the docs: settings cards, plugin
detail page sections, right-sidebar tab types (`ui-sidebar-right`), keyed
per-tool result views. Client code must be built with dsh's `clientBundle`
preset and declared under `dsh.client`. Separately, `ui-sidebar-browser`
shows "sandboxed HTTP(S) pages, including loopback services, in
right-Sidebar tabs".

The host side of a plugin can serve HTTP on loopback and can call
`agent.inject()` to put model-facing context into the next request.

## Decision

1. The emulator view is **one static page served by the jeROMy plugin on
   loopback**, opened in a dsh right-sidebar browser tab. Plain HTML and a
   small script; no framework, no dsh client bundle.
2. The page polls the plugin for screenshots, offers zoom and a pixel picker,
   and exposes pause / step / resume.
3. A pixel click POSTs to the plugin, which resolves tile and palette via the
   Mesen service and calls `agent.inject()` so the result reaches the model
   on the next turn and is logged as a session event.
4. A native `ui-sidebar-right` tab type is the upgrade path, taken only if
   the browser tab proves insufficient (focus, sizing, or input latency).

## Consequences

- Zero coupling to dsh's client build. The page survives client-side
  breaking changes.
- The page is a second origin inside dsh; it cannot read dsh state and does
  not need to.
- Pixel-picker results are logged by construction (ADR-0003's
  "model-visible means logged").

## Alternatives

- **Native sidebar panel via `dsh.client`.** Better integration, but the
  client extension docs are thin and the API is alpha. Deferred, not
  rejected.
- **Describe clicks in chat by hand.** No build cost, but the agent loses
  the exact tile/palette and the user does the agent's job. Rejected.
- **Keep the v0.1 web UI as a separate window.** Keeps 15k lines alive to
  show one panel. Rejected.

## Revisit triggers

- The sidebar browser cannot keep up with screenshot polling or drops
  pointer events.
- dsh documents and stabilizes a sidebar tab API.
