#!/usr/bin/env bash
# Bring the whole jeROMy loop up from WSL, idempotently: dsh (profile jeromy,
# plugin from source) + Mesen2 on Windows with the ROM and bridge.lua, then
# wait for the bridge and print where everything is. Safe to rerun; it only
# starts what is not already running. `scripts/up.sh --down` stops dsh.
#
# Env: JEROMY_ROM, MESEN_EXE  (see mesen-up.sh)   DSH_PORT (3080)   DSH_SRC
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${DSH_PORT:-3080}"
LOG="$REPO/.dsh-dev/dsh.log"
mkdir -p "$REPO/.dsh-dev"

# `|| true`: under `set -e -o pipefail` an empty grep (port free) would otherwise end the script silently.
owner_of() { ss -ltnp 2>/dev/null | grep -E ":$1 " | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2 || true; }
is_ours() { [ -n "${1:-}" ] && tr '\0' ' ' < "/proc/$1/cmdline" 2>/dev/null | grep -q -- "--profile jeromy"; }

if [ "${1:-}" = "--down" ]; then
  for port in "$PORT" 9001 9002; do pid="$(owner_of "$port")"; if is_ours "$pid"; then kill "$pid" && echo "[up] stopped dsh (pid $pid)"; fi; done
  exit 0
fi

# 1. dsh
pid="$(owner_of 9001)"
if is_ours "$pid"; then
  echo "[up] dsh already running (pid $pid)"
elif [ -n "$pid" ]; then
  echo "[up] port 9001 is owned by pid $pid, not our dsh: $(tr '\0' ' ' < /proc/$pid/cmdline | cut -c1-100)" >&2
  echo "[up] stop it first (the v0.1 server or a headless run), then rerun" >&2
  exit 1
else
  echo "[up] starting dsh profile jeromy (log: $LOG)"
  (setsid nohup "$REPO/scripts/dsh-dev.sh" --no-open > "$LOG" 2>&1 &)
  for _ in $(seq 1 60); do sleep 1; grep -q "dsh web: http" "$LOG" 2>/dev/null && break; done
  grep -q "dsh web: http" "$LOG" || { echo "[up] dsh did not come up; tail of log:" >&2; tail -20 "$LOG" >&2; exit 1; }
fi

# 2. Mesen with ROM + Lua (single-instance handoff if already open)
"$REPO/scripts/mesen-up.sh" "$@"

# 3. wait for the bridge, then confirm through the view
echo -n "[up] waiting for the Lua bridge"
for _ in $(seq 1 30); do
  if curl -sf http://127.0.0.1:9002/status 2>/dev/null | grep -q '"connected":true'; then echo " connected"; break; fi
  echo -n "."; sleep 1
done
STATUS="$(curl -sf http://127.0.0.1:9002/status 2>/dev/null || echo '{"connected":false}')"
echo "[up] view status: $STATUS"
echo "$STATUS" | grep -q '"connected":true' || { echo "[up] bridge not connected: is bridge.lua running in Mesen's Script Window? (Tools > Script Window > Run)" >&2; exit 1; }

echo
echo "  dsh web:        $(grep -o 'http://127.0.0.1:[0-9]*/?token=[^ ]*' "$LOG" | tail -1)"
echo "  emulator view:  http://127.0.0.1:9002/   (right-sidebar Browser)"
echo "  headless check: scripts/trio.sh"
