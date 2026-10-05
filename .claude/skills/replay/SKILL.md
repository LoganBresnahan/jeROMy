---
name: replay
description: Read what the DeepSeek agent actually did in a dsh session — its reasoning, tool calls, tool results, screenshots and token usage — from dsh's own session log (ADR-0011). Use after any run through dsh (a trio check, Logan's web session, an autonomous loop) to evaluate behavior, catch tool misuse or model slips, and file findings; and during an autonomous loop to watch a live session without the web UI.
---

# /replay — read the agent's session log

dsh persists every session as an append-only log under
`~/.dsh/sessions/<cwd-key>/session-<id>/session.v4.jsonl.zstd`. It has
everything the model saw and produced: system prompt, injected user
messages (including `[emulator view]` clicks, source `jeromy-view`),
reasoning blocks, tool calls with arguments, tool results with image
attachments, per-step token usage, and turn end reasons. jeROMy writes no
log of its own; this is the record. `scripts/dsh-log.mjs` reads it.

```bash
scripts/dsh-log.mjs list                       # newest 15 sessions: id prefix, age, turns, calls, errors, model, cwd, title, top tools
scripts/dsh-log.mjs show latest                # transcript (reasoning ▷, calls →, results, 🖼 image paths)
scripts/dsh-log.mjs show <id> --turn 3 --full  # one turn, nothing clipped
scripts/dsh-log.mjs show <id> --images DIR     # also copy the PNGs to DIR, then Read them
scripts/dsh-log.mjs stats <id> [--json]        # tool histogram, errors, tokens, estimated cost
scripts/dsh-log.mjs tail latest --follow       # live: prints new events as dsh checkpoints them
scripts/dsh-log.mjs events <id> --type tool/result | jq ...   # raw events
```

`<id>` is any unique prefix of the session id. Headless runs
(`scripts/trio.sh`) print a `replay:` line per check with the id; their
cwd is `~/.cache/jeromy/headless-cwd`. Web sessions carry the workspace
chosen in the dsh UI as cwd (Logan's: `/home/oof/rom_hacks`).

## What to look at, in order

1. **Did it answer the question that was asked?** Read the last ASSISTANT
   text of the turn against the USER line. A confident answer with no
   evidence tool call behind it is a finding.
2. **Tool trace.** Every `→` line and its RESULT. Look for: silent retries
   (the same call twice with no reasoning in between), results marked
   ERROR, a tool called with an argument the result contradicts, calls to
   tools outside the hacking set (`bash`, `read_image`, `read`) and what
   they were used for.
3. **Images.** Open the PNGs the agent saw (the `🖼` path, or `--images`).
   Judge the description against the frame, not against the agent's
   confidence. Screenshots are 256×240; a missing or empty image behind a
   described frame is a finding.
4. **Reasoning.** The `▷` blocks show where it guessed. Known slips to
   watch for: hue from a palette index without reading the table
   (roadmap item 13), `$`-hex mangled by Markdown (item 13), trusting
   `get_tile_at_pixel` on a split-scroll frame (ADR-0010),
   `record_mapping` with `confirmed` on a guess (item 9's confidence rule).
5. **Cost.** `stats` gives tokens and an estimate. Cache reads dominate
   long sessions; a step whose `in` jumps by tens of thousands is a tool
   result that should have been smaller.
6. **Injected context.** USER lines with sources other than `user` are
   ours or dsh's: `jeromy-view` (clicks), `agent-instructions` (dsh read an
   `AGENTS.md`/`CLAUDE.md` from the cwd: wrong cwd if it is a coding repo),
   `runtime-context`, `time-context`, `user-approval`.

## Where findings go

- A model or tool behavior worth guarding: `docs/issues.md`, with the
  session id prefix and seq numbers as provenance (`14597bd5 seq 36`).
- A procedure the agent worked out that is worth keeping: write or amend
  `skills/<name>/SKILL.md` right then (ADR-0008; standing rule).
- A confirmed `record_mapping` that never got promoted: it is still in
  the log; `promote_mappings` next session or merge by hand.

## In an autonomous loop

Start `tail latest --follow` in the background (or poll `tail <id>
--since <seq>` each iteration and keep the last seq). Judge each turn as
above before issuing the next instruction; do not read only the final
text. Stop the loop on a turn end reason other than `completed`, on two
consecutive ERROR results from the same tool, or when the agent starts
using `bash` to do what a jeROMy tool does.

## Report

```
REPLAY — <id prefix> · "<title>" · <turns>t <calls>c <errors>e · <model> · ~$<cost>
  asked     <user line>
  answered  <one line> · evidence: <tool(s) it rests on>
  slips     <seq: what> | none
  images    <n> seen · <judgement of one you opened>
  filed     <issues.md entries / skills written> | nothing
```
