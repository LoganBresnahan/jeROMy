# Local Model Support — Research & Plan

## Motivation

Claude API costs ~$5 per prompt during development. Running a local model on the Intel Arc A770 16GB GPU eliminates per-token costs for iterative development and testing, while keeping Claude available for high-stakes tasks requiring superior reasoning.

## Hardware

- **GPU:** Intel Arc A770 16GB VRAM
- **Constraint:** Not NVIDIA — no CUDA. Need SYCL/oneAPI or Vulkan backends.

## Requirements

jeROMy's agent needs ALL of the following from a single model/API:
1. **Vision/multimodal** — screenshots (PNG) sent to the model for visual analysis
2. **Tool use / function calling** — structured JSON tool calls in an iterative tool loop
3. **Streaming** — token-by-token streaming responses for the UI
4. **Fits 16GB VRAM** — model weights + KV cache + vision encoder must fit

## Inference Engines for Intel Arc

### llama.cpp + SYCL (Recommended)

The most performant and mature path for Intel Arc GPUs.

- Official SYCL backend via Intel oneAPI
- `llama-server` provides OpenAI-compatible API with vision + tool calling + streaming
- Intel actively contributes optimizations; Q4_0 performance increased 21-87% in 2025.2
- **Important:** legacy quants (Q4_0, Q5_0, Q8_0) are significantly faster than K-quants (Q4_K_M, Q5_K_M) on SYCL
- Can also use IPEX-LLM's portable zip (pre-built llama.cpp for Intel GPU)

Setup: Install Intel oneAPI Base Toolkit → build llama.cpp with `-DGGML_SYCL=ON` → run `llama-server`

### Ollama (Simpler but Limited)

- IPEX-LLM Docker image provides Ollama compiled for Arc GPU (most battle-tested route)
- Experimental Vulkan support since Ollama 0.12.6-rc0 (`OLLAMA_VULKAN=1`)
- **Critical limitation:** Ollama cannot combine vision + tool calling in the same request ([issue #8626](https://github.com/ollama/ollama/issues/8626))
- Would require a two-model approach (vision model → text description → tool model)

### vLLM with Intel XPU

- Intel Arc support via XPU backend since vLLM 0.6.6
- Limitation: BF16 not supported on Arc (only Data Center GPUs)
- Less mature for consumer Arc GPUs

## Model Selection

### Qwen3-VL-8B-Instruct (Primary Choice)

The only strong model combining vision AND tool use at a size that fits 16GB.

- Native tool calling with structured output (trained for it)
- GUI/computer use capability (recognizes UI elements)
- 256K context window
- GGUF files available on HuggingFace

| Quantization | File Size | VRAM (weights) | Fits 16GB? |
|---|---|---|---|
| Q4_0 | ~4.7 GB | ~5-6 GB total | Yes, plenty of headroom |
| Q8_0 | ~8.2 GB | ~9-10 GB total | Yes, ~6 GB for KV cache |
| FP16 | ~16 GB | ~18+ GB total | No |

**Recommendation:** Q8_0 for quality, Q4_0 for speed. Use legacy quants (not K-quants) for best SYCL performance.

### Performance Estimates on Arc A770

| Model | Quant | Generation Speed |
|---|---|---|
| 7-8B models | Q4_0 | ~40-55 tok/s |
| 7-8B models | Q8_0 | ~30-40 tok/s |
| 14B models | Q4_0 | ~20-25 tok/s |

Vision processing adds latency for initial image encoding (~1-2 GB extra VRAM).

### Fallback: Two-Model Approach

If combined vision + tool use proves too buggy on a single model:
1. **Vision model** (Qwen3-VL-8B Q4) — analyzes screenshots, outputs text descriptions
2. **Tool model** (Qwen3-8B or Qwen2.5-7B) — takes descriptions, makes tool calls

Both fit simultaneously in 16GB at Q4 (~5 GB each).

### Other Candidates Considered

- **Qwen2.5-VL-7B** — supports vision + tool use conceptually, but default GGUF chat templates don't enable tool calling. Needs custom template.
- **GLM-4.6V-Flash (9B)** — native multimodal tool use, but full GGUF/vision support is draft status.
- **Llama 3.x 8B** — good tool use, no vision.
- **Mistral 7B** — fast on Arc, no vision.

## Implementation: OpenAI-Compatible Provider

Since `llama-server` exposes an OpenAI-compatible API, we add a new provider that implements our existing `LLMProvider` interface targeting the OpenAI chat completions format.

### New File: `src/agent/providers/openai-compat.ts`

```typescript
export class OpenAICompatibleProvider implements LLMProvider {
  constructor(options: {
    baseUrl: string;    // e.g. "http://localhost:8080/v1"
    apiKey?: string;    // optional, most local servers don't need it
    model?: string;     // e.g. "qwen3-vl-8b"
  })

  async chat(messages, options): Promise<LLMResponse> { ... }
  async *stream(messages, options): AsyncIterable<LLMStreamEvent> { ... }
}
```

Maps our internal types to/from OpenAI format:
- `ContentBlock` → OpenAI `content` (text, image_url with base64 data URI)
- `ToolUseBlock` → OpenAI `tool_calls` with `function` type
- `ToolResultBlock` → OpenAI `tool` role message
- `LLMTool` → OpenAI `tools` with `function` type
- Streaming via SSE (`data: [DONE]` termination)

### Provider Selection

Selected via settings (see settings plan below). The provider is instantiated based on configuration:

- If `provider === "anthropic"` → use `AnthropicProvider`
- If `provider === "openai-compat"` → use `OpenAICompatibleProvider`
- Settings specify: provider type, base URL, API key, model name

## Risks

1. **Vision + tool calling on same request is bleeding edge** in llama.cpp — may have bugs
2. **8B model quality** is significantly below Claude Sonnet/Opus for spatial reasoning and self-evaluation
3. **Vision models may run slower on Arc** than text-only models (some reports of failures)
4. **Qwen3-VL tool calling templates** have known bugs in Ollama (unclosed think tags); llama.cpp server may be more stable
5. **Real-world performance varies** — benchmarks are best-case; actual throughput depends on drivers, context length, etc.

## Sources

- [llama.cpp SYCL Backend Docs](https://github.com/ggml-org/llama.cpp/blob/master/docs/backend/SYCL.md)
- [Intel: Run LLMs on Intel GPUs Using llama.cpp](https://www.intel.com/content/www/us/en/developer/articles/technical/run-llms-on-gpus-using-llama-cpp.html)
- [IPEX-LLM GitHub](https://github.com/intel/ipex-llm)
- [Ollama Tool Support for Vision Models Issue #8626](https://github.com/ollama/ollama/issues/8626)
- [Qwen3-VL GitHub](https://github.com/QwenLM/Qwen3-VL)
- [Qwen3-VL-8B-Instruct-GGUF on HuggingFace](https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct-GGUF)
- [Ollama on Intel Arc A770 using Vulkan](https://www.theobservum.com/posts/2025/2025-12-14_ollama_on_vulkan_and_intel_arc/)
- [Run Ollama on Intel Arc GPU (IPEX)](https://dev.to/itlackey/run-ollama-on-intel-arc-gpu-ipex-4e4k)
