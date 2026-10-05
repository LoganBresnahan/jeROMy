#!/usr/bin/env bash
# Roadmap item 7 / ADR-0012: prove the package installs into a fresh dsh
# profile and runs. Builds the package, creates a throwaway profile from the
# web template, `dsh plugin --profile <p> add <this repo>`, boots it on a
# spare web port, checks the emulator view's /status and a /pick with no
# model involved, runs one headless look check through the installed copy,
# and removes the profile. The dev dsh must be down (one bridge port).
#
# Usage: scripts/install-check.sh [--keep]     (--keep leaves the profile for inspection)
set -uo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
DSH_SRC="$(cd "${DSH_SRC:-$REPO/../deepseek-harness}" && pwd)"
PROFILE="${JEROMY_TEST_PROFILE:-jeromy-pkg}"
PORT="${JEROMY_TEST_PORT:-3081}"
DSH_HOME_DIR="${DSH_HOME:-$HOME/.dsh}"
PDIR="$DSH_HOME_DIR/profiles/$PROFILE"
LOG="$REPO/.dsh-dev/install-check.log"
KEEP=0; [ "${1:-}" = "--keep" ] && KEEP=1
mkdir -p "$REPO/.dsh-dev"

owner_of() { ss -ltnp 2>/dev/null | grep -E ":$1 " | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2 || true; }
fail() { echo "[install-check] FAIL: $*" >&2; exit 1; }
stop_boot() { # the boot is `sh -c node ...`: kill the node process itself, not just the wrapper
  for p in $(pgrep -f "bin.ts --profile $PROFILE "); do kill "$p" 2>/dev/null; done
  for _ in $(seq 1 15); do pgrep -f "bin.ts --profile $PROFILE " >/dev/null || break; sleep 1; done
  pkill -9 -f "bin.ts --profile $PROFILE " 2>/dev/null || true
}
cleanup() {
  stop_boot
  if [ $KEEP -eq 0 ] && [ -d "$PDIR" ]; then rm -rf "$PDIR"; echo "[install-check] removed profile $PROFILE"; fi
}
trap cleanup EXIT

[ -z "$(owner_of 9001)" ] || fail "port 9001 is owned by pid $(owner_of 9001); run scripts/up.sh --down first"
[ -f "$REPO/capstone/capstone.wasm" ] || echo "[install-check] note: capstone not built; disassemble will report itself unavailable"

echo "[install-check] 1. build and pack"
(cd "$REPO" && npm run -s build) || fail "build"
[ -f "$REPO/dist/dsh/index.js" ] || fail "dist/dsh/index.js missing after build"
# A tarball, not the checkout: a directory spec would be linked, and the
# plugin would then resolve @deepseek-ai/* through the checkout's dev
# symlinks instead of the profile's packages (two cordis instances).
TGZ="$(cd "$REPO" && npm pack --silent --pack-destination "$REPO/.dsh-dev" 2>/dev/null | tail -1)"
[ -f "$REPO/.dsh-dev/$TGZ" ] || fail "npm pack produced nothing"
SPEC="$REPO/.dsh-dev/$TGZ"
echo "[install-check]    $TGZ"

echo "[install-check] 2. fresh profile $PROFILE from the web template"
rm -rf "$PDIR"
(cd "$DSH_SRC" && pnpm -s dsh "$PROFILE" --from-default-profile web --dump-config >/dev/null 2>"$LOG") || fail "profile init (see $LOG)"
[ -f "$PDIR/package.json" ] || fail "profile package.json not created"

echo "[install-check] 3. dsh plugin --profile $PROFILE add $SPEC"
(cd "$DSH_SRC" && pnpm -s dsh plugin --profile "$PROFILE" add "$SPEC" >>"$LOG" 2>&1) || { tail -20 "$LOG" >&2; fail "plugin add"; }
grep -q '"jeromy-dsh"' "$PDIR/package.json" || fail "jeromy-dsh not in the profile manifest"
python3 - "$PDIR/package.json" <<'PY' || exit 1
import json, sys
m = json.load(open(sys.argv[1]))
b = m.get("dsh", {}).get("profile", {}).get("bundles", [])
print(f"[install-check]    bundles: {b}")
sys.exit(0 if "jeromy-dsh" in b else 1)
PY
[ $? -eq 0 ] || fail "jeromy-dsh not enabled as a bundle"

echo "[install-check] 4. composed config has the plugin row, the preset and the session-log switch"
CFG="$(cd "$DSH_SRC" && pnpm -s dsh --profile "$PROFILE" --dump-config 2>>"$LOG")"
echo "$CFG" | grep -q "name: jeromy-dsh" || fail "plugin row missing from composed config"
echo "$CFG" | grep -q "id: preset-jeromy" || fail "preset row missing"
echo "$CFG" | grep -A4 "id: session-log-deepseek" | grep -q "enabled: false" || { echo "$CFG" | grep -A4 "id: session-log-deepseek" >&2; fail "session-log switch missing"; }

echo "[install-check] 5. boot the installed profile on :$PORT"
(cd "$DSH_SRC" && pnpm -s dsh --profile "$PROFILE" --port "$PORT" --no-open >>"$LOG" 2>&1 &) ; sleep 1
for _ in $(seq 1 60); do grep -q "dsh web: http" "$LOG" 2>/dev/null && break; sleep 1; done
grep -q "dsh web: http" "$LOG" || { tail -20 "$LOG" >&2; fail "installed profile did not boot"; }
grep -iE "jeromy: .*tools, prompt section" "$LOG" >/dev/null || echo "[install-check]    (plugin banner not in log; checking the view instead)"
for _ in $(seq 1 30); do curl -sf http://127.0.0.1:9002/status 2>/dev/null | grep -q '"connected":true' && break; sleep 1; done
STATUS="$(curl -sf http://127.0.0.1:9002/status || true)"
echo "[install-check]    view status: $STATUS"
echo "$STATUS" | grep -q '"connected":true' || fail "bridge not connected through the installed plugin (is Mesen running with bridge.lua?)"
echo "$STATUS" | grep -q '"lua_script"' || fail "/status does not report the Lua script path"
PICK="$(curl -s -X POST http://127.0.0.1:9002/pick -H 'content-type: application/json' -d '{"x":128,"y":220}')"
echo "$PICK" | grep -q '"scroll_source"' || fail "pick route failed: $PICK"
echo "[install-check]    pick ok: $(echo "$PICK" | cut -c1-120)…"

echo "[install-check] 6. one headless look through the installed copy"
stop_boot
for _ in $(seq 1 30); do [ -z "$(owner_of 9001)" ] && break; sleep 1; done
[ -z "$(owner_of 9001)" ] || fail "port 9001 still owned by pid $(owner_of 9001) after stopping the boot"
# Give the Lua client time to notice the web boot is gone (heartbeat, ~4 s) so
# the headless run's first tool call finds it reconnected within its 15 s wait.
sleep 6
OUT="$REPO/.chat-out/install-check-$(date +%Y%m%d-%H%M%S).jsonl"
mkdir -p "$(dirname "$OUT")" "$HOME/.cache/jeromy/headless-cwd"
TSX_ESM="$(cd "$DSH_SRC" && node -p "require.resolve('tsx/esm')")"
# The headless profile has no jeromy-dsh of its own: mount the installed copy by path.
HPATCH="$REPO/.dsh-dev/install-check.patch.yml"
sed "s#name: jeromy-dsh#name: '$PDIR/node_modules/jeromy-dsh/dist/dsh/index.js'#" "$PDIR/node_modules/jeromy-dsh/cordis.patch.yml" > "$HPATCH"
( cd "$HOME/.cache/jeromy/headless-cwd" && TSX_TSCONFIG_PATH="$DSH_SRC/tsconfig.json" timeout 300 node --import "$TSX_ESM" "$DSH_SRC/apps/cli/src/bin.ts" --profile headless --patch "$HPATCH" --json "Take a screenshot and say in one sentence what is on screen." ) > "$OUT" 2>>"$LOG"
grep -q '"type":"final"' "$OUT" || { tail -5 "$LOG" >&2; fail "headless check through the installed bundle patch did not complete (stream: $OUT)"; }
grep '"type":"tool_result"' "$OUT" | grep -q '"tool":"screenshot"\|"callId"' || fail "no screenshot tool result in the headless run (stream: $OUT)"
grep '"type":"tool_result"' "$OUT" | grep -q 'Error:' && fail "the headless run's tool call errored (bridge not connected?) — stream: $OUT"
echo "[install-check]    headless ok: $(grep '"type":"final"' "$OUT" | head -1 | cut -c1-140)…"

echo "[install-check] PASS: jeromy-dsh installs into a fresh profile and runs (log: $LOG)"
