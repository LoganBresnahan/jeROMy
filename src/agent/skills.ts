/**
 * The curated ROM-hacking skills shipped with the plugin (ADR-0008): one
 * `skills/<name>/SKILL.md` per procedure, YAML frontmatter in the dsh skill
 * format (`name`, `description`, optional `whenToUse`, `user-invocable`,
 * `disable-model-invocation`). Host-agnostic: this parses and lists; the
 * dsh adapter registers them with `ctx.skills`.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export interface SkillFile {
  name: string;
  description: string;
  whenToUse?: string;
  modelInvocable: boolean;
  userInvocable: boolean;
  /** Markdown body after the frontmatter. */
  content: string;
  /** Absolute path of the SKILL.md. */
  path: string;
  metadata?: Record<string, unknown>;
}

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseBool(raw: string | undefined, dflt: boolean): boolean {
  if (raw === undefined) return dflt;
  const v = raw.trim().toLowerCase();
  if (["true", "yes", "on", "1"].includes(v)) return true;
  if (["false", "no", "off", "0"].includes(v)) return false;
  throw new Error(`not a boolean: ${raw}`);
}

function unquote(v: string): string {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  return t;
}

/** Parse one SKILL.md. Frontmatter is flat `key: value` lines; that is all the shipped skills use. */
export function parseSkillFile(text: string, path: string): SkillFile {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error(`${path}: missing frontmatter`);
  const fields: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!kv) throw new Error(`${path}: unparseable frontmatter line: ${line}`);
    fields[kv[1]] = unquote(kv[2]);
  }
  const name = fields.name;
  if (!name || !SKILL_NAME.test(name)) throw new Error(`${path}: name must be kebab-case, got ${JSON.stringify(name)}`);
  if (!fields.description) throw new Error(`${path}: description is required`);
  const known = new Set(["name", "description", "whenToUse", "user-invocable", "disable-model-invocation"]);
  const metadata: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) if (!known.has(k)) metadata[k] = v;
  return {
    name,
    description: fields.description,
    ...(fields.whenToUse ? { whenToUse: fields.whenToUse } : {}),
    modelInvocable: !parseBool(fields["disable-model-invocation"], false),
    userInvocable: parseBool(fields["user-invocable"], true),
    content: m[2],
    path,
    ...(Object.keys(metadata).length ? { metadata } : {}),
  };
}

/** Every `<dir>/<name>/SKILL.md`, sorted by name. A malformed file throws: a shipped skill must parse. */
export function loadSkillFiles(dir: string): SkillFile[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const out: SkillFile[] = [];
  for (const entry of entries.sort()) {
    const file = join(dir, entry, "SKILL.md");
    try {
      if (!statSync(file).isFile()) continue;
    } catch {
      continue;
    }
    const skill = parseSkillFile(readFileSync(file, "utf8"), file);
    if (skill.name !== entry) throw new Error(`${file}: frontmatter name "${skill.name}" must match its directory "${entry}"`);
    out.push(skill);
  }
  return out;
}

/** Tool-looking tokens (`snake_case` inside backticks) a skill body mentions, for the tool↔skill parity check. */
export function toolNamesMentioned(content: string): string[] {
  const names = new Set<string>();
  for (const m of content.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)) names.add(m[1]);
  return [...names].sort();
}
