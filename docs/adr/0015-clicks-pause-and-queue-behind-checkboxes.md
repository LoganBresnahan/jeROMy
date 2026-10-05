# ADR-0015: A click pauses the game, and clicks reach the model only when the person checks them for the next prompt

**Status:** Accepted (2026-10-05, Logan's call after ADR-0014 shipped). Supersedes the "a click injects into the live agent" part of ADR-0004.
**Date:** 2026-10-05

## Context

Since ADR-0004 a click in the emulator view was injected into the live
agent at once (`agent.inject`), one message per click, consumed at the
agent's next step. Two things were wrong with that by the time ADR-0013
and ADR-0014 had made clicks precise.

First, a pick on a running game is not one frame: the tile read, the
pixel color, the sprite test and the region map are separate bridge
requests answered at different frame ends, and the overlay that now
persists until the next click slides off a moving frame within a second.
Logan's sessions showed the agent re-querying a frame 182 pixels away from
the one he clicked. The `identify-click` skill's first step was already
"pause first"; the click itself did not.

Second, immediate injection gave the person no say. Every exploratory
click became a message the model had to read, duplicates included (two
identical lines in session `2c572b4f`), and a click made while the agent
was mid-turn landed in whatever step came next. Logan asked for a history
of clicks, grouped by selection mode, with a checkbox per click that
decides what goes with the next prompt, the newest click of each mode
checked by default.

dsh offers the right seam: the `agent/pre-step` waterfall lets a plugin
add messages to the step that admits the person's prompt, and those
messages are logged like any other user-batch message (its own plan-mode
plugin adds narration this way). The view already has a server-sent
stream the page follows.

## Decision

1. **A click pauses a running game first, and leaves it paused.** The
   view's `POST /pick` reads the emulator status, pauses if running, takes
   the readout, and reports `pause_state`: `paused_by_click`,
   `already_paused`, or `resumed_after_pick` when the toolbar's "Pause on
   click" box is off (then the game is paused only for the readout and
   resumed). The context line ends with a sentence saying which. Nothing
   steps (ADR-0013 stands).
2. **Clicks become history records, not messages.** `ClickHistory`
   (`src/dsh/click-history.ts`) keeps, in memory for the life of the plugin
   process, one record per click: mode, coordinates, the short label, the
   full context line, the overlay to redraw it, and `selected`. Adding a
   click of mode M checks it and unchecks the previous unsent click of
   mode M; other modes keep their check. So the default send is the newest
   click of each mode the person used. Capped at 40, dropping the oldest
   unchecked first. Never persisted: dsh's session log is the record of
   what reached the model (ADR-0003).
3. **Checked clicks go with the next prompt.** The plugin listens on
   `agent/pre-step`; when a proposed step carries a message whose source is
   the person (`source.kind === "user"`), it takes the checked records
   (oldest first), marks them sent with that turn, unchecks them, and
   enters them ahead of the prompt as `jeromy-view` user messages. Steps
   without a person's message (tool results, steering, subagents) take
   nothing. A sent record can be re-checked and sent again.
4. **The page shows the history.** Under the pick text, one section per
   mode (pixel, tile, color, object), newest first as a., b., c., each with
   its checkbox and label; clicking a label redraws that click's highlight
   and its context line; sent rows are dimmed and say so; a button clears
   the history. The stream carries `clicks_rev`, and the page refetches
   `GET /clicks` only when it changes, so the boxes clear by themselves
   when a prompt consumes them. `POST /clicks/select` and
   `POST /clicks/clear` are the other two routes; none of them touches the
   bridge.

## Consequences

- The person decides what the model sees, click by click, and sees it
  decided (checked rows) before pressing Enter. Exploratory clicking is
  free.
- Every click costs one `get_emulator_status` and, on a running game, one
  pause. The game stays paused after a click by default; Resume is one
  button. People who want to watch and click toggle "Pause on click" off
  and get a consistent readout from a momentary pause instead.
- A click made while the agent is mid-turn waits for the next prompt
  instead of landing in a tool-result step; the agent can no longer be
  "told" something between its steps from the view. If that is ever
  needed, a "send now" button is one route away.
- The history dies with the plugin process (a dsh restart); it does not
  follow a session across restarts and is not shared between sessions in
  one process. Acceptable for a scratch list; revisit if it becomes
  something people curate.
- `pickPixel` and the context line are unchanged; the skills and prompt
  say that clicks arrive with the prompt, possibly several, and that the
  game is paused on the clicked frame.

## Alternatives

- **Keep injecting at once, add pause.** Fixes the frame, not the
  consent. Rejected.
- **Put the checked clicks in the prompt section instead of messages.**
  Re-sent on every step until unchecked, and invisible in the transcript
  as discrete events. Rejected; the pre-step batch is logged per message
  and sent once.
- **Inject on `agent/inbox/inserted` when the person's message arrives.**
  Works in the common case but races the loop's claim of the batch; the
  waterfall is the sanctioned seam. Rejected.
- **Persist the history in a file per ROM.** Nothing asked for it, and it
  would be a second record beside dsh's log. Rejected until a use appears.

## Revisit triggers

- Someone wants a click to reach a running turn (a "send now" button, or
  steering through `agent.steer`).
- The history is wanted across restarts or per session; then key it by
  session id and store it under `hacks/sha1-<sha1>/`.
- Pause on click annoys in a workflow where the person clicks while
  playing; then the toggle's default flips, or the toggle persists in
  `localStorage`.
