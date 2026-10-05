#!/usr/bin/env bash
# Tail the Lua bridge's log file from WSL. bridge.lua mirrors emu.log to
# <Mesen2 home>\LuaScriptData\<script>\jeromy-bridge.log so a script error
# (which stops the script and looks like a dead bridge from WSL) is readable.
#
# Usage: scripts/lua-log.sh [-f] [N]     (last N lines, default 40; -f follows)
set -uo pipefail
FOLLOW=0; [ "${1:-}" = "-f" ] && { FOLLOW=1; shift; }
N="${1:-40}"
MESEN_HOME="${MESEN_HOME:-/mnt/c/Users/tarsier/Documents/Mesen2}"
FILE="$(find "$MESEN_HOME" -name jeromy-bridge.log -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)"
[ -n "$FILE" ] || { echo "[lua-log] no jeromy-bridge.log under $MESEN_HOME (script not loaded since the file log shipped?)" >&2; exit 1; }
echo "[lua-log] $FILE"
if [ $FOLLOW -eq 1 ]; then tail -n "$N" -F "$FILE"; else tail -n "$N" "$FILE"; fi
