#!/usr/bin/env bash
# Launch (or re-point) Mesen2 on the Windows side from WSL: load a ROM and
# mesen/bridge.lua in one shot. Mesen's SingleInstance preference hands the
# arguments to the running instance, so this is safe to call repeatedly.
#
# Usage: scripts/mesen-up.sh [--restart] [rom-path-on-windows]
#        --restart kills a running Mesen first. The single-instance handoff
#        swaps the ROM but keeps the already-running bridge.lua (verified
#        2026-10-05 via get_lua_logs), so a changed script needs this.
# Env:   MESEN_EXE   Windows path to Mesen.exe (default C:\Mesen.exe)
#        JEROMY_ROM  Windows path to the ROM (default: Super Mario Bros. (World))
set -euo pipefail

RESTART=0
if [ "${1:-}" = "--restart" ]; then RESTART=1; shift; fi
MESEN_EXE="${MESEN_EXE:-C:\\Mesen.exe}"
ROM="${1:-${JEROMY_ROM:-C:\\Users\\tarsier\\Documents\\.Super Mario Bros. (World)\\Super Mario Bros. (World).nes}}"
DISTRO="${WSL_DISTRO_NAME:-Ubuntu}"
REPO_WIN="\\\\wsl.localhost\\${DISTRO}$(pwd | sed 's#/#\\#g')"
LUA="${REPO_WIN}\\mesen\\bridge.lua"

MESEN_WSL="$(wslpath -u "$MESEN_EXE")"
[ -x "$MESEN_WSL" ] || { echo "Mesen.exe not found at $MESEN_EXE" >&2; exit 1; }
[ -f "$(wslpath -u "$ROM")" ] || { echo "ROM not found at $ROM" >&2; exit 1; }
[ -f mesen/bridge.lua ] || { echo "run from the jeROMy repo root" >&2; exit 1; }

echo "[mesen-up] exe  $MESEN_EXE"
echo "[mesen-up] rom  $ROM"
echo "[mesen-up] lua  $LUA"
if [ $RESTART -eq 1 ]; then
  echo "[mesen-up] restarting Mesen so the current bridge.lua loads"
  /mnt/c/Windows/System32/taskkill.exe /IM Mesen.exe /F >/dev/null 2>&1 || true
  sleep 3
fi
# Detach: Mesen is a GUI process; don't tie it to this shell.
nohup "$MESEN_WSL" "$ROM" "$LUA" >/dev/null 2>&1 &
disown
sleep 2
# No grep -q here: with pipefail, grep exiting early would SIGPIPE tasklist
# and turn a running Mesen into a false "did not start".
if [ "$(/mnt/c/Windows/System32/tasklist.exe 2>/dev/null | grep -ci '^Mesen.exe')" -gt 0 ]; then
  echo "[mesen-up] Mesen running"
else
  echo "[mesen-up] Mesen did not start" >&2; exit 1
fi
