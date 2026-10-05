# ADR-0002: `deepseek-flash` by default; the provider layer belongs to dsh

**Status:** Accepted
**Date:** 2026-10-05

## Context

Development on Claude vision cost about $5 per prompt and stopped the
project. `docs/plans/local-model.md` explored a local Qwen3-VL on an Intel
Arc as the way out; it was never built.

DeepSeek API as of 2026-10-04: `deepseek-flash` is DeepSeek-V4.1-Flash
(released 2026-09-10), native vision, tool calls, JSON mode, thinking mode,
1M context, 384K max output. Images cost at most 1024 tokens each. Pricing
per million tokens at peak: $0.30 input (cache miss), $0.006 input (cache
hit), $1.20 output; off-peak is half. `deepseek-v4-pro` has no vision and is
routed to V4.1-Flash since 2026-09-14. A 256x240 NES screenshot therefore
costs about three hundredths of a cent.

DeepSeek also exposes an Anthropic-compatible endpoint
(`https://api.deepseek.com/anthropic`) that supports image blocks, tool use,
streaming and thinking; Claude Sonnet/Haiku model names map to
`deepseek-flash`. The current jeROMy can run on it with two environment
variables.

The maintainer is tired of keeping provider adapters current. dsh ships two
adapters behind one `ctx.llm` seam: a direct DeepSeek adapter and a
multi-provider adapter on `@earendil-works/pi-ai` (15+ providers, generated
model catalog). Custom OpenAI- or Anthropic-compatible endpoints are a
settings entry. Vercel AI SDK was considered as "the" abstraction.

## Decision

1. Default model is `deepseek-flash`. Thinking effort is a dsh config value
   (`reasoningEffort`), which supersedes the unfinished Phase 4.5 extended
   thinking work.
2. **This repository contains no provider adapters.** Model access goes
   through dsh. Switching to Claude or a local model is a dsh settings
   change. Vercel AI SDK is not adopted; it would be an abstraction under
   dsh's abstraction.
3. Before migration work, the current stack is run once against the
   Anthropic-compatible endpoint to validate V4.1-Flash on NES screenshots,
   ASCII tile dumps, a palette edit and multi-step tool calls (roadmap
   item 0). This ADR is reopened if that fails.

## Consequences

- `src/agent/providers/anthropic.ts` and `src/agent/provider.ts` are deleted
  with the old stack (ADR-0001).
- Per-turn cost drops by roughly two orders of magnitude, which changes what
  is reasonable to do per turn: more screenshots, verification after every
  edit.
- Image handling inside tool results on the OpenAI-compatible route is not
  documented by DeepSeek (the vision guide mentions `user` messages only).
  dsh's own screenshot tools depend on it working. Roadmap item 3 confirms it;
  the fallback is injecting the screenshot as a user-turn image via
  `agent.inject()`.
- If dsh ever lacks a provider we need, `ctx.llm.registerAdapter()` is the
  documented seam, and that adapter would live in its own plugin, not here.

## Alternatives

- **Vercel AI SDK, forked for stability.** Solves provider churn only if we
  own the loop, and we no longer do. Rejected.
- **Local Qwen3-VL on Intel Arc** (`docs/plans/local-model.md`). Zero
  marginal cost but SYCL build friction, Ollama's vision+tools limitation,
  and weaker vision. Still available later as a dsh custom endpoint with no
  code here. Deferred.
- **Stay on Claude.** Best vision, unaffordable for iteration. Available per
  session through dsh settings for hard problems.

## Revisit triggers

- Roadmap item 0 shows V4.1-Flash cannot read NES screenshots or tile dumps
  reliably.
- DeepSeek pricing or the vision token cap changes materially.
- A provider we need is missing from dsh and pi-ai for more than a release.
