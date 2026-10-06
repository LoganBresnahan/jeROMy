/**
 * Per-game hack directories (ADR-0009, ADR-0018): `<root>/sha1-<sha1>/` is
 * the game, holding what every hack of it shares (`discoveries.json`, an
 * imported `reference.json`, `game.json` naming the active hack); each hack
 * is a named subdirectory with its own ledger (`edits.json`), manifest
 * (`hack.json`) and versioned exports. Files, not a database: readable,
 * diffable, and meant to live in the person's own git repository. The root
 * belongs to the person; this module writes files there and never runs git.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { DiscoveredEntry } from "../mappings/loader.js";

/** Memory types whose writes are persistent edits; everything else is volatile and never ledgered. */
export type RomMemory = "prgRom" | "chrRom";

export interface EditEntry {
  /** 1-based, stable for the life of the ledger; `undo_edit` addresses entries by it. */
  seq: number;
  /** ISO timestamp. */
  at: string;
  /** Tool that made the write (write_memory, write_tile, write_sprite). */
  tool: string;
  mem: RomMemory;
  /** ROM offset within that memory (no iNES header). */
  offset: number;
  length: number;
  old: number[];
  new: number[];
  reason?: string;
}

export type NewEdit = Omit<EditEntry, "seq" | "at">;

interface EditsFile {
  format: 1;
  rom_sha1: string;
  edits: EditEntry[];
}

interface DiscoveriesFile {
  format: 1;
  rom_sha1: string;
  discoveries: DiscoveredEntry[];
}

/** `game.json`: what the game directory knows that is not a hack's own. */
interface GameFile {
  format: 1;
  rom_sha1: string;
  active: string;
}

export interface HackExport {
  version: number;
  file: string;
  format: "ips" | "bps";
  /** Ledger length the export was cut from, so a version is reproducible. */
  edits: number;
  at: string;
}

/** `hack.json`: the manifest of one named hack. */
export interface HackManifest {
  format: 1;
  name: string;
  description: string;
  created: string;
  exports: HackExport[];
}

export interface HackSummary {
  name: string;
  description: string;
  created: string;
  edits: number;
  exports: number;
  last_export?: HackExport;
  active: boolean;
}

export const DEFAULT_HACK = "default";
/** Hack names are directory names and file-name prefixes: lower-case, digits, dash and underscore. */
export const HACK_NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export function gameDirFor(root: string, sha1: string): string {
  return resolve(root, `sha1-${sha1.toLowerCase()}`);
}

/** @deprecated name kept for readers of ADR-0009; the game directory. */
export const hackDirFor = gameDirFor;

/** Write via a temp file and rename so a crash never leaves a half-written ledger. */
function writeAtomic(file: string, data: unknown): void {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  renameSync(tmp, file);
}

function readJson<T>(file: string): T | null {
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

/** The root is the person's repository: never let a ROM or a cloned disassembly become committable from here (ADR-0018). */
const ROOT_GITIGNORE = "# jeROMy hacks root (ADR-0018): ledgers, manifests and patches are yours to commit; ROMs and references never are.\n*.nes\nreference/\n*.tmp\n";

export class HackStore {
  readonly gameDir: string;
  private active: string;

  /** Open the game's store on its active hack, migrating a pre-ADR-0018 single ledger into `default/`. */
  static open(root: string, sha1: string, log?: (message: string) => void): HackStore {
    const gameDir = gameDirFor(root, sha1);
    const legacyEdits = join(gameDir, "edits.json");
    // Keyed on the manifest, not the directory: a crash between mkdir and the
    // renames must not leave an empty default/ that blocks the migration forever.
    if (existsSync(legacyEdits) && !existsSync(join(gameDir, DEFAULT_HACK, "hack.json"))) {
      const target = join(gameDir, DEFAULT_HACK);
      mkdirSync(target, { recursive: true });
      const moved: string[] = [];
      for (const f of readdirSync(gameDir)) {
        if (f === "edits.json" || /^patch\.(ips|bps)$/.test(f) || /\.hacked\.nes$/i.test(f)) {
          renameSync(join(gameDir, f), join(target, f));
          moved.push(f);
        }
      }
      writeAtomic(join(target, "hack.json"), { format: 1, name: DEFAULT_HACK, description: "Migrated from the single ledger of ADR-0009", created: new Date().toISOString(), exports: [] } satisfies HackManifest);
      writeAtomic(join(gameDir, "game.json"), { format: 1, rom_sha1: sha1, active: DEFAULT_HACK } satisfies GameFile);
      log?.(`hacks: migrated ${moved.join(", ")} into ${target} as hack "${DEFAULT_HACK}" (ADR-0018)`);
    }
    const game = readJson<GameFile>(join(gameDir, "game.json"));
    const active = game?.active && existsSync(join(gameDir, game.active, "hack.json")) ? game.active : DEFAULT_HACK;
    return new HackStore(root, sha1, active);
  }

  constructor(readonly root: string, readonly sha1: string, hackName: string = DEFAULT_HACK) {
    if (!HACK_NAME.test(hackName)) throw new Error(`invalid hack name "${hackName}": use a-z, 0-9, - and _, up to 32 characters`);
    this.gameDir = gameDirFor(root, sha1);
    this.active = hackName;
  }

  /** The active hack's name. */
  get hackName(): string {
    return this.active;
  }

  /** The active hack's directory: ledger and exports live here. */
  get dir(): string {
    return join(this.gameDir, this.active);
  }

  get editsFile(): string {
    return join(this.dir, "edits.json");
  }

  get manifestFile(): string {
    return join(this.dir, "hack.json");
  }

  get discoveriesFile(): string {
    return join(this.gameDir, "discoveries.json");
  }

  /** Create the hack directory (and the root's .gitignore) on first use; reading never creates anything. */
  ensureDir(): void {
    mkdirSync(this.dir, { recursive: true });
    const ignore = join(this.root, ".gitignore");
    if (!existsSync(ignore)) writeFileSync(ignore, ROOT_GITIGNORE, "utf8");
    if (!existsSync(this.manifestFile)) {
      writeAtomic(this.manifestFile, { format: 1, name: this.active, description: "", created: new Date().toISOString(), exports: [] } satisfies HackManifest);
    }
    const gameFile = join(this.gameDir, "game.json");
    if (!existsSync(gameFile)) writeAtomic(gameFile, { format: 1, rom_sha1: this.sha1, active: this.active } satisfies GameFile);
  }

  readManifest(): HackManifest | null {
    return readJson<HackManifest>(this.manifestFile);
  }

  readEdits(): EditEntry[] {
    return readJson<EditsFile>(this.editsFile)?.edits ?? [];
  }

  /** Append one edit and return it with its seq and timestamp. */
  appendEdit(edit: NewEdit, now: Date = new Date()): EditEntry {
    if (edit.old.length !== edit.length || edit.new.length !== edit.length) {
      throw new Error(`edit length ${edit.length} does not match old (${edit.old.length}) / new (${edit.new.length})`);
    }
    this.ensureDir();
    const edits = this.readEdits();
    const seq = edits.reduce((m, e) => Math.max(m, e.seq), 0) + 1;
    const entry: EditEntry = { seq, at: now.toISOString(), ...edit };
    writeAtomic(this.editsFile, { format: 1, rom_sha1: this.sha1, edits: [...edits, entry] } satisfies EditsFile);
    return entry;
  }

  /** Remove an entry by seq (after `undo_edit` wrote its old bytes back). Returns the removed entry. */
  removeEdit(seq: number): EditEntry {
    const edits = this.readEdits();
    const entry = edits.find((e) => e.seq === seq);
    if (!entry) throw new Error(`no edit with seq ${seq}`);
    writeAtomic(this.editsFile, { format: 1, rom_sha1: this.sha1, edits: edits.filter((e) => e.seq !== seq) } satisfies EditsFile);
    return entry;
  }

  /** Every hack of this game, the active one flagged. */
  listHacks(): HackSummary[] {
    if (!existsSync(this.gameDir)) return [];
    const out: HackSummary[] = [];
    for (const name of readdirSync(this.gameDir).sort()) {
      const manifest = readJson<HackManifest>(join(this.gameDir, name, "hack.json"));
      if (!manifest) continue;
      const edits = readJson<EditsFile>(join(this.gameDir, name, "edits.json"))?.edits.length ?? 0;
      const last = manifest.exports.at(-1);
      out.push({ name, description: manifest.description, created: manifest.created, edits, exports: manifest.exports.length, ...(last ? { last_export: last } : {}), active: name === this.active });
    }
    return out;
  }

  /** Create a hack directory with its manifest; does not make it active. */
  createHack(name: string, description = ""): HackSummary {
    if (!HACK_NAME.test(name)) throw new Error(`invalid hack name "${name}": use a-z, 0-9, - and _, up to 32 characters`);
    const dir = join(this.gameDir, name);
    if (existsSync(join(dir, "hack.json"))) throw new Error(`hack "${name}" already exists`);
    mkdirSync(dir, { recursive: true });
    writeAtomic(join(dir, "hack.json"), { format: 1, name, description, created: new Date().toISOString(), exports: [] } satisfies HackManifest);
    const ignore = join(this.root, ".gitignore");
    if (!existsSync(ignore)) writeFileSync(ignore, ROOT_GITIGNORE, "utf8");
    const gameFile = join(this.gameDir, "game.json");
    if (!existsSync(gameFile)) writeAtomic(gameFile, { format: 1, rom_sha1: this.sha1, active: this.active } satisfies GameFile);
    return { name, description, created: new Date().toISOString(), edits: 0, exports: 0, active: false };
  }

  /**
   * Make `name` the active hack and persist the choice in game.json. This
   * only moves the store's pointer: the caller (switchHack, ADR-0018) must
   * revert the previous ledger's bytes and apply the new one's.
   */
  useHack(name: string): void {
    if (!existsSync(join(this.gameDir, name, "hack.json"))) throw new Error(`no hack "${name}" (list_hacks shows them; new_hack creates one)`);
    this.active = name;
    mkdirSync(this.gameDir, { recursive: true });
    writeAtomic(join(this.gameDir, "game.json"), { format: 1, rom_sha1: this.sha1, active: name } satisfies GameFile);
  }

  /** The next export version number for the active hack. */
  nextVersion(): number {
    return (this.readManifest()?.exports.at(-1)?.version ?? 0) + 1;
  }

  /** Record an export the caller just wrote into the hack directory. */
  recordExport(file: string, format: "ips" | "bps", edits: number, now: Date = new Date()): HackExport {
    this.ensureDir();
    const manifest = this.readManifest() ?? { format: 1 as const, name: this.active, description: "", created: now.toISOString(), exports: [] };
    const entry: HackExport = { version: this.nextVersion(), file: basename(file), format, edits, at: now.toISOString() };
    writeAtomic(this.manifestFile, { ...manifest, exports: [...manifest.exports, entry] } satisfies HackManifest);
    return entry;
  }

  readDiscoveries(): DiscoveredEntry[] {
    return readJson<DiscoveriesFile>(this.discoveriesFile)?.discoveries ?? [];
  }

  writeDiscoveries(discoveries: DiscoveredEntry[]): void {
    mkdirSync(this.gameDir, { recursive: true });
    writeAtomic(this.discoveriesFile, { format: 1, rom_sha1: this.sha1, discoveries } satisfies DiscoveriesFile);
  }

  appendDiscovery(entry: DiscoveredEntry): DiscoveredEntry[] {
    const all = [...this.readDiscoveries(), entry];
    this.writeDiscoveries(all);
    return all;
  }

  clearDiscoveries(): void {
    if (existsSync(this.discoveriesFile)) writeAtomic(this.discoveriesFile, { format: 1, rom_sha1: this.sha1, discoveries: [] } satisfies DiscoveriesFile);
  }
}
