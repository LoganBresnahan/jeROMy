#!/bin/bash
# Build Capstone disassembly engine as WASM module.
#
# Prerequisites:
#   - Emscripten SDK (emsdk) installed and activated
#   - git
#
# Usage:
#   cd capstone && ./build.sh
#
# Output:
#   capstone.js    — Emscripten glue code (Node.js module)
#   capstone.wasm  — WASM binary (~500KB-1MB)

set -euo pipefail

CAPSTONE_VERSION="5.0.6"
CAPSTONE_DIR="capstone-src"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Clone Capstone if not already present
if [ ! -d "$SCRIPT_DIR/$CAPSTONE_DIR" ]; then
  echo "[build] Cloning Capstone $CAPSTONE_VERSION..."
  git clone --depth 1 --branch "$CAPSTONE_VERSION" \
    https://github.com/capstone-engine/capstone.git \
    "$SCRIPT_DIR/$CAPSTONE_DIR"
fi

cd "$SCRIPT_DIR/$CAPSTONE_DIR"

echo "[build] Building Capstone WASM (ARM + MOS65XX only)..."

# Build only the architectures we need
# ARM: ARM7TDMI (GBA) + Thumb mode
# MOS65XX: 6502 (NES), 65C02, W65816 (SNES)
emcc \
  -O2 \
  -s WASM=1 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME="createCapstone" \
  -s EXPORTED_FUNCTIONS='["_cs_open","_cs_option","_cs_disasm","_cs_free","_cs_close","_cs_errno","_cs_strerror","_malloc","_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","getValue","setValue"]' \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s INITIAL_MEMORY=2097152 \
  -s ENVIRONMENT=node \
  -DCAPSTONE_HAS_ARM \
  -DCAPSTONE_HAS_MOS65XX \
  -DCAPSTONE_USE_SYS_DYN_MEM \
  -I include \
  cs.c \
  MCInst.c \
  MCInstrDesc.c \
  MCRegisterInfo.c \
  Mapping.c \
  SStream.c \
  utils.c \
  arch/ARM/ARMDisassembler.c \
  arch/ARM/ARMInstPrinter.c \
  arch/ARM/ARMMapping.c \
  arch/ARM/ARMModule.c \
  arch/MOS65XX/MOS65XXDisassembler.c \
  arch/MOS65XX/MOS65XXModule.c \
  -o "$SCRIPT_DIR/capstone.js"

echo "[build] Done!"
echo "[build] Output: $SCRIPT_DIR/capstone.js + $SCRIPT_DIR/capstone.wasm"
ls -lh "$SCRIPT_DIR/capstone.js" "$SCRIPT_DIR/capstone.wasm"
