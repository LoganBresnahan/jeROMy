import { describe, it, expect } from "vitest";
import { luaScriptPathForMesen, pluginPaths } from "./paths.js";

describe("plugin paths (ADR-0012)", () => {
  it("treats a checkout as its own user root, source and built alike", () => {
    for (const entry of ["file:///home/oof/jeROMy/src/dsh/index.ts", "file:///home/oof/jeROMy/dist/dsh/index.js"]) {
      const p = pluginPaths(entry, {}, "/home/oof");
      expect(p.packageRoot).toBe("/home/oof/jeROMy");
      expect(p.installed).toBe(false);
      expect(p.mappingsDir).toBe("/home/oof/jeROMy/mappings");
      expect(p.hacksDir).toBe("/home/oof/jeROMy/hacks");
      expect(p.luaScript).toBe("/home/oof/jeROMy/mesen/bridge.lua");
    }
  });

  it("keeps user state out of an installed package: $DSH_HOME/jeromy, seed mappings from the package", () => {
    const p = pluginPaths("file:///home/oof/.dsh/profiles/jeromy/node_modules/jeromy-dsh/dist/dsh/index.js", { DSH_HOME: "/x/dsh" }, "/home/oof");
    expect(p.installed).toBe(true);
    expect(p.userRoot).toBe("/x/dsh/jeromy");
    expect(p.mappingsDir).toBe("/x/dsh/jeromy/mappings");
    expect(p.hacksDir).toBe("/x/dsh/jeromy/hacks");
    expect(p.seedMappingsDir).toBe("/home/oof/.dsh/profiles/jeromy/node_modules/jeromy-dsh/mappings");
    expect(pluginPaths("file:///a/node_modules/jeromy-dsh/dist/dsh/index.js", {}, "/home/oof").userRoot).toBe("/home/oof/.dsh/jeromy");
  });

  it("renders the Lua path the way Mesen on Windows needs it under WSL", () => {
    expect(luaScriptPathForMesen("/home/oof/jeROMy/mesen/bridge.lua", { WSL_DISTRO_NAME: "Ubuntu" }))
      .toBe("\\\\wsl.localhost\\Ubuntu\\home\\oof\\jeROMy\\mesen\\bridge.lua");
    expect(luaScriptPathForMesen("/home/oof/x.lua", {})).toBe("/home/oof/x.lua");
    expect(luaScriptPathForMesen("C:\\x.lua", { WSL_DISTRO_NAME: "Ubuntu" })).toBe("C:\\x.lua");
  });
});
