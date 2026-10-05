#!/usr/bin/env bash
# Print the DeepSeek account balance (USD) and exit non-zero when it is below
# a floor, so an unattended loop can decide whether to run model-driven checks.
#
# Usage: scripts/budget.sh [floor-usd]      (default floor 0: only an unreachable
#        account or an unavailable key fails)
set -uo pipefail
FLOOR="${1:-0}"
[ -n "${DEEPSEEK_API_KEY:-}" ] || { echo "[budget] DEEPSEEK_API_KEY not set" >&2; exit 2; }
JSON="$(curl -sf --max-time 15 https://api.deepseek.com/user/balance -H "Authorization: Bearer $DEEPSEEK_API_KEY")" \
  || { echo "[budget] balance endpoint unreachable" >&2; exit 2; }
BAL="$(printf '%s' "$JSON" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(next((b["total_balance"] for b in d.get("balance_infos",[]) if b.get("currency")=="USD"), "0"))')"
AVAIL="$(printf '%s' "$JSON" | python3 -c 'import sys,json; print(str(json.load(sys.stdin).get("is_available", False)).lower())')"
echo "deepseek balance USD $BAL · available $AVAIL · floor $FLOOR"
[ "$AVAIL" = "true" ] || exit 1
python3 -c "import sys; sys.exit(0 if float('$BAL') >= float('$FLOOR') else 1)"
