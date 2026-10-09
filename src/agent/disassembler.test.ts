import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Disassembler } from "./disassembler.js";

// Fixture: the first ten bytes of Super Mario Bros. (World) PRG ($8000, the reset vector's target), read from the
// ROM file and decoded by hand by Claude 2026-10-09 (78 SEI, D8 CLD, A9 LDA #, 8D STA abs, A2 LDX #, 9A TXS).
const SMB_RESET = new Uint8Array([0x78, 0xd8, 0xa9, 0x10, 0x8d, 0x00, 0x20, 0xa2, 0xff, 0x9a]);
const built = existsSync(resolve(import.meta.dirname, "../../capstone/capstone.js"));

describe.skipIf(!built)("disassemble against the real Capstone WASM", () => {
  it("decodes 6502 at a CPU address (the arch and mode constants match capstone.h)", async () => {
    const d = await Disassembler.init();
    const out = d!.disassemble(SMB_RESET, 0x8000);
    expect(out.map((i) => [i.address, i.mnemonic, i.op_str])).toEqual([
      [0x8000, "sei", ""],
      [0x8001, "cld", ""],
      [0x8002, "lda", "#0x10"],
      [0x8004, "sta", "0x2000"],
      [0x8007, "ldx", "#0xff"],
      [0x8009, "txs", ""],
    ]);
    expect(out[3].bytes).toEqual([0x8d, 0x00, 0x20]);
    d!.close();
  });
});
