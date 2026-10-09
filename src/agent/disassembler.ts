/**
 * Capstone WASM disassembler wrapper.
 *
 * Supports:
 *   - MOS65XX: 6502 (NES), 65C02, W65816 (SNES)
 *   - ARM: ARM7TDMI (GBA) + Thumb mode
 *
 * Build the WASM module with: cd capstone && ./build.sh
 * If the WASM module is not present, init() returns a stub that throws on use.
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WASM_PATH = resolve(__dirname, "../../capstone/capstone.js");
const require = createRequire(import.meta.url);

// Capstone constants, copied from capstone/capstone-src/include/capstone/capstone.h (cs_arch, cs_mode).
// Never retype these from memory: MOS65XX was written as 14 (BPF in this build), so every 6502 disassemble
// failed with CS_ERR_ARCH until eval/runs/20261009-1135-sheet3-hud-position hit it.
const CS_ARCH_ARM = 0;
const CS_ARCH_MOS65XX = 12;
const CS_MODE_ARM = 0;
const CS_MODE_THUMB = 1 << 4;
const CS_MODE_MOS65XX_6502 = 1 << 1;
const CS_MODE_MOS65XX_65C02 = 1 << 2;
const CS_MODE_MOS65XX_65816 = 1 << 4;

// cs_insn struct offsets (Capstone 5.x)
const INSN_SIZE = 240; // sizeof(cs_insn)
const INSN_ID_OFF = 0;
const INSN_ADDR_OFF = 8; // uint64_t at offset 8
const INSN_SIZE_OFF = 16; // uint16_t at offset 16
const INSN_BYTES_OFF = 18; // uint8_t[24] at offset 18
const INSN_MNEMONIC_OFF = 42; // char[32] at offset 42
const INSN_OP_STR_OFF = 74; // char[160] at offset 74

export interface DisasmInstruction {
  address: number;
  bytes: number[];
  mnemonic: string;
  op_str: string;
}

export type Arch =
  | "6502"
  | "65c02"
  | "w65816"
  | "arm"
  | "thumb";

interface CapstoneModule {
  ccall: (name: string, returnType: string, argTypes: string[], args: any[]) => any;
  cwrap: (name: string, returnType: string, argTypes: string[]) => (...args: any[]) => any;
  getValue: (ptr: number, type: string) => number;
  setValue: (ptr: number, value: number, type: string) => void;
  HEAPU8: Uint8Array;
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
  UTF8ToString: (ptr: number) => string;
}

/**
 * A NUL-terminated ASCII string from WASM memory. The build exports only
 * ccall/cwrap/getValue/setValue (capstone/build.sh), never HEAPU8 or
 * UTF8ToString: reading those returned undefined and every disassemble threw.
 */
function cString(M: CapstoneModule, ptr: number, max = 160): string {
  let s = "";
  for (let i = 0; i < max; i++) {
    const c = M.getValue(ptr + i, "i8") & 0xff;
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

export class Disassembler {
  private module: CapstoneModule;
  private handles = new Map<string, number>(); // arch key → cs_handle

  private constructor(module: CapstoneModule) {
    this.module = module;
  }

  /**
   * Load the Capstone WASM module.
   * Returns null if the WASM file hasn't been built yet.
   */
  static async init(): Promise<Disassembler | null> {
    if (!existsSync(WASM_PATH)) {
      console.warn(
        "[Disassembler] capstone.js not found — run `cd capstone && ./build.sh` to enable disassembly"
      );
      return null;
    }

    try {
      // Load the Emscripten-generated CJS module via require
      const factory = require(WASM_PATH);
      const module: CapstoneModule = await factory();
      return new Disassembler(module);
    } catch (err) {
      console.error("[Disassembler] Failed to load Capstone WASM:", err);
      return null;
    }
  }

  /**
   * Disassemble bytes at a given address.
   * @param bytes Raw bytes to disassemble
   * @param address Starting address for the disassembly listing
   * @param arch Architecture (default: "6502" for NES)
   * @returns Array of disassembled instructions
   */
  disassemble(
    bytes: Uint8Array,
    address: number,
    arch: Arch = "6502"
  ): DisasmInstruction[] {
    const handle = this.getHandle(arch);
    const M = this.module;

    // Allocate memory for the input bytes
    const codePtr = M._malloc(bytes.length);
    bytes.forEach((b, i) => M.setValue(codePtr + i, b, "i8"));

    // Allocate pointer for output (cs_disasm returns a pointer to cs_insn array)
    const insnPtrPtr = M._malloc(4);

    const count = M.ccall(
      "cs_disasm",
      "number",
      ["number", "number", "number", "number", "number", "number"],
      // cs_disasm's address is uint64_t; this build passes i64 as BigInt (WASM_BIGINT), and a plain number throws.
      [handle, codePtr, bytes.length, BigInt(address), 0, /* count=0 means all */ insnPtrPtr]
    );

    const instructions: DisasmInstruction[] = [];

    if (count > 0) {
      const insnPtr = M.getValue(insnPtrPtr, "i32");

      for (let i = 0; i < count; i++) {
        const base = insnPtr + i * INSN_SIZE;

        const instrAddress = M.getValue(base + INSN_ADDR_OFF, "i32"); // lower 32 bits
        const instrSize = M.getValue(base + INSN_SIZE_OFF, "i16");

        const instrBytes: number[] = [];
        for (let j = 0; j < instrSize; j++) {
          instrBytes.push(M.getValue(base + INSN_BYTES_OFF + j, "i8") & 0xff);
        }

        const mnemonic = cString(M, base + INSN_MNEMONIC_OFF);
        const op_str = cString(M, base + INSN_OP_STR_OFF);

        instructions.push({
          address: instrAddress,
          bytes: instrBytes,
          mnemonic,
          op_str,
        });
      }

      // Free the instruction array
      M.ccall("cs_free", "void", ["number", "number"], [insnPtr, count]);
    }

    M._free(codePtr);
    M._free(insnPtrPtr);

    return instructions;
  }

  /** Close all open Capstone handles. */
  close(): void {
    for (const [, handle] of this.handles) {
      const handlePtr = this.module._malloc(4);
      this.module.setValue(handlePtr, handle, "i32");
      this.module.ccall("cs_close", "number", ["number"], [handlePtr]);
      this.module._free(handlePtr);
    }
    this.handles.clear();
  }

  /** Get or create a Capstone handle for the given architecture. */
  private getHandle(arch: Arch): number {
    if (this.handles.has(arch)) {
      return this.handles.get(arch)!;
    }

    const [csArch, csMode] = archToCapstone(arch);
    const handlePtr = this.module._malloc(4);

    const err = this.module.ccall(
      "cs_open",
      "number",
      ["number", "number", "number"],
      [csArch, csMode, handlePtr]
    );

    if (err !== 0) {
      this.module._free(handlePtr);
      throw new Error(`cs_open failed for arch=${arch}: error code ${err}`);
    }

    const handle = this.module.getValue(handlePtr, "i32");
    this.module._free(handlePtr);
    this.handles.set(arch, handle);
    return handle;
  }
}

function archToCapstone(arch: Arch): [number, number] {
  switch (arch) {
    case "6502":
      return [CS_ARCH_MOS65XX, CS_MODE_MOS65XX_6502];
    case "65c02":
      return [CS_ARCH_MOS65XX, CS_MODE_MOS65XX_65C02];
    case "w65816":
      return [CS_ARCH_MOS65XX, CS_MODE_MOS65XX_65816];
    case "arm":
      return [CS_ARCH_ARM, CS_MODE_ARM];
    case "thumb":
      return [CS_ARCH_ARM, CS_MODE_THUMB];
    default:
      throw new Error(`Unknown architecture: ${arch}`);
  }
}
