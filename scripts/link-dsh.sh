#!/usr/bin/env bash
# Dev-time wiring for the dsh plugin layer (ADR-0005): symlink the harness
# checkout's workspace packages into this repo's node_modules so
# `import ... from '@deepseek-ai/dsh-tools'` in src/dsh resolves to the SAME
# built files the running harness uses (Node keys ESM modules by realpath, so
# Service/Context class identity is shared). Publishing later swaps these for
# registry versions in package.json; nothing here is committed.
#
# Env: DSH_SRC  path to the deepseek-harness checkout (default ../deepseek-harness)
set -euo pipefail
DSH_SRC="$(cd "${DSH_SRC:-$(dirname "$0")/../../deepseek-harness}" && pwd)"
[ -f "$DSH_SRC/pnpm-workspace.yaml" ] || { echo "not a dsh checkout: $DSH_SRC" >&2; exit 1; }
DEST="$(dirname "$0")/../node_modules/@deepseek-ai"
mkdir -p "$DEST"
link() { # name  relative-dir
  local target="$DSH_SRC/$2"
  [ -f "$target/package.json" ] || { echo "missing $target" >&2; exit 1; }
  ln -sfn "$target" "$DEST/$1"
  echo "  @deepseek-ai/$1 -> $2"
}
echo "[link-dsh] from $DSH_SRC"
link cordis               vendor/cordis
link schemastery          vendor/schemastery
link dsh-tools            packages/core/tools
link dsh-attachment       packages/attachment/attachment
link dsh-system-prompt    packages/core/system-prompt
link dsh-llm              packages/llm/llm
link dsh-agent            packages/core/agent
link dsh-skill            packages/skill/skill
