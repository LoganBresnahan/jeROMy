import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadSkillFiles, parseSkillFile, toolNamesMentioned } from "./skills.js";
import { agentTools } from "./tools.js";

const SKILLS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "skills");

describe("parseSkillFile (ADR-0008)", () => {
  it("reads the dsh frontmatter fields and defaults both invocation surfaces on", () => {
    const s = parseSkillFile(`---\nname: palette-swap\ndescription: Recolor one object.\nwhenToUse: The user asks for a color change.\n---\n\n# Body\n`, "/x/palette-swap/SKILL.md");
    expect(s).toMatchObject({ name: "palette-swap", description: "Recolor one object.", whenToUse: "The user asks for a color change.", modelInvocable: true, userInvocable: true });
    expect(s.content.trim()).toBe("# Body");
  });

  it("honors disable-model-invocation and user-invocable, in dsh's boolean spellings", () => {
    const s = parseSkillFile(`---\nname: a-b\ndescription: d\ndisable-model-invocation: yes\nuser-invocable: off\n---\nx`, "/x/a-b/SKILL.md");
    expect(s).toMatchObject({ modelInvocable: false, userInvocable: false });
    expect(() => parseSkillFile(`---\nname: a-b\ndescription: d\nuser-invocable: maybe\n---\nx`, "p")).toThrow(/boolean/);
  });

  it("rejects a missing frontmatter, a non-kebab name and a missing description", () => {
    expect(() => parseSkillFile("# no frontmatter", "p")).toThrow(/frontmatter/);
    expect(() => parseSkillFile(`---\nname: Not_Kebab\ndescription: d\n---\n`, "p")).toThrow(/kebab/);
    expect(() => parseSkillFile(`---\nname: ok-name\n---\n`, "p")).toThrow(/description/);
  });
});

describe("shipped skills directory", () => {
  const skills = loadSkillFiles(SKILLS_DIR);

  it("contains the skills drafted from the 2026-10-05 sessions, each matching its directory name", () => {
    expect(skills.map((s) => s.name)).toEqual(["find-variable", "identify-click", "palette-swap", "persist-edit"]);
    for (const s of skills) {
      expect(s.description.length).toBeGreaterThan(20);
      expect(s.content).toContain("## Steps");
      expect(s.content).toContain("## Report shape");
    }
  });

  it("only names tools that exist (tool↔skill parity)", () => {
    const known = new Set([...agentTools.map((t) => t.name), "promote_mappings"]);
    // Field names and result keys the skills quote in backticks, not tools.
    const notTools = new Set([
      "tile_id", "palette_id", "mapping_type", "color_index", "nes_color", "old_color", "scroll_x", "scroll_y",
      "scroll_source", "scroll_scanline", "stepped_frames", "scroll_ambiguous", "png_base64", "frozen",
      "mem_type", "ledger_warning", "rom_path", "chr_tile", "hit_tile", "sprite_hit",
      // find-variable (ADR-0019): snapshot and diff names, tool parameters.
      "s_start", "s_after1", "s_after2", "d1", "d2", "decreased", "increased", "equals", "value", "changed", "from", "name", "watch", "source", "mapping_type", "id", "category",
      // Example mapping names the skills suggest for record_mapping.
      "pipe_bush_hill_green", "title_logo_box",
    ]);
    for (const s of skills) {
      const unknown = toolNamesMentioned(s.content).filter((n) => !known.has(n) && !notTools.has(n));
      expect(unknown, `${s.name} names tools that do not exist`).toEqual([]);
    }
  });

  it("returns nothing for a missing directory", () => {
    expect(loadSkillFiles("/nonexistent/skills")).toEqual([]);
  });
});
