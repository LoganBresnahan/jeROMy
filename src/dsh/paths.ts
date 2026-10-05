/**
 * Where the plugin's files and the user's state live (ADR-0012). The plugin
 * entry sits at <root>/src/dsh/index.ts in the repository and at
 * <root>/dist/dsh/index.js when built, so the package root is two levels up
 * either way; whether that root is under a node_modules directory decides
 * whether user state may live beside it.
 */
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export interface PluginPaths {
  packageRoot: string;
  installed: boolean;
  userRoot: string;
  seedMappingsDir: string;
  mappingsDir: string;
  hacksDir: string;
  skillsDir: string;
  luaScript: string;
}

export function pluginPaths(entryUrl: string, env: NodeJS.ProcessEnv = process.env, home: string = homedir()): PluginPaths {
  const packageRoot = resolve(dirname(fileURLToPath(entryUrl)), "..", "..");
  const installed = packageRoot.split(sep).includes("node_modules");
  const userRoot = installed ? join(env.DSH_HOME ?? join(home, ".dsh"), "jeromy") : packageRoot;
  return {
    packageRoot,
    installed,
    userRoot,
    seedMappingsDir: join(packageRoot, "mappings"),
    mappingsDir: join(userRoot, "mappings"),
    hacksDir: join(userRoot, "hacks"),
    skillsDir: join(packageRoot, "skills"),
    luaScript: join(packageRoot, "mesen", "bridge.lua"),
  };
}

/** The path as Mesen on Windows needs it when this runs under WSL; otherwise the path itself. */
export function luaScriptPathForMesen(path: string, env: NodeJS.ProcessEnv = process.env): string {
  const distro = env.WSL_DISTRO_NAME;
  if (!distro || !path.startsWith("/")) return path;
  return `\\\\wsl.localhost\\${distro}${path.replace(/\//g, "\\")}`;
}
