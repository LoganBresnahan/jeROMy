#!/usr/bin/env bash
# Run the v0.1 jeROMy server against DeepSeek through its Anthropic-compatible
# endpoint (ADR-0002, roadmap item 0). Needs DEEPSEEK_API_KEY in the env.
set -euo pipefail
: "${DEEPSEEK_API_KEY:?DEEPSEEK_API_KEY is not set}"
export ANTHROPIC_BASE_URL="https://api.deepseek.com/anthropic"
export ANTHROPIC_API_KEY="$DEEPSEEK_API_KEY"
export JEROMY_MODEL="${JEROMY_MODEL:-deepseek-flash}"
echo "[dev-deepseek] model=$JEROMY_MODEL base=$ANTHROPIC_BASE_URL"
exec npm run dev
