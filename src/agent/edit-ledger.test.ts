import { describe, it, expect } from "vitest";
import { isRomMemory, windowsPathToWsl } from "./edit-ledger.js";

describe("edit-ledger helpers (ADR-0009)", () => {
  it("maps the Windows path Mesen reports onto the WSL mount", () => {
    expect(windowsPathToWsl("C:\\Users\\tarsier\\Documents\\.Super Mario Bros. (World)\\Super Mario Bros. (World).nes"))
      .toBe("/mnt/c/Users/tarsier/Documents/.Super Mario Bros. (World)/Super Mario Bros. (World).nes");
    expect(windowsPathToWsl("D:/roms/x.nes")).toBe("/mnt/d/roms/x.nes");
    expect(windowsPathToWsl("/home/oof/x.nes")).toBe("/home/oof/x.nes");
  });

  it("treats only PRG and CHR ROM as persistent memories", () => {
    expect(isRomMemory("prgRom")).toBe(true);
    expect(isRomMemory("chrRom")).toBe(true);
    for (const m of ["cpu", "palette", "chrRam", "workRam", "ppu"]) expect(isRomMemory(m)).toBe(false);
  });
});
