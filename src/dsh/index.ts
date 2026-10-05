/**
 * dsh-jeromy: the plugin entry (ADR-0001, ADR-0005). Mounts the Mesen service,
 * registers every core emulator tool against it through one mapper plus the
 * dsh-specific `promote_mappings`, contributes the jeROMy system prompt
 * section, and serves the emulator view page (ADR-0004). Everything
 * emulator-specific lives in src/bridge, src/agent and src/mappings (core);
 * this layer only adapts it to dsh.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Context } from "@deepseek-ai/cordis";
import Schema from "@deepseek-ai/schemastery";
import { createUserMessage, type MessageSource } from "@deepseek-ai/dsh-llm";
import type {} from "@deepseek-ai/dsh-tools";
import type {} from "@deepseek-ai/dsh-attachment";
import type {} from "@deepseek-ai/dsh-system-prompt";
import type {} from "@deepseek-ai/dsh-agent";
import type {} from "@deepseek-ai/dsh-skill";
import { Disassembler } from "../agent/disassembler.js";
import { loadSkillFiles } from "../agent/skills.js";
import { MesenService } from "./mesen-service.js";
import { makeCoreTools } from "./tools/core-tools.js";
import { makePromoteMappingsTool } from "./tools/promote-mappings.js";
import { createEmulatorViewServer } from "./emulator-view.js";
import { JEROMY_SECTION_NAME, JEROMY_SECTION_ORDER, jeromySectionText } from "./prompt.js";

declare module "@deepseek-ai/dsh-llm" {
  interface MessageSourceMap {
    /** Context injected by the emulator view's pixel picker. */
    "jeromy-view": { kind: "jeromy-view" };
  }
}

/** Producer source stamped on every context the emulator view injects. */
const VIEW_SOURCE: MessageSource = { kind: "jeromy-view" };

export const name = "jeromy";

export interface Config {
  port: number;
  requestTimeout: number;
  mappingsDir?: string;
  viewPort: number;
}

const REPO_MAPPINGS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "mappings");
const REPO_SKILLS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "skills");

export const Config: Schema<Config> = Schema.object({
  port: Schema.number().default(9001).description("TCP port mesen/bridge.lua connects to"),
  requestTimeout: Schema.number().default(15_000).description("Bridge request timeout (ms)"),
  mappingsDir: Schema.string().description("Directory of sha1-*.json game mappings (default: the plugin's mappings/)"),
  viewPort: Schema.number().default(9002).description("Loopback port for the emulator view page (open it in the sidebar Browser)"),
});

export function apply(ctx: Context, config: Config): void {
  ctx.plugin(MesenService, {
    port: config.port,
    requestTimeout: config.requestTimeout,
    mappingsDir: config.mappingsDir ?? REPO_MAPPINGS_DIR,
  });

  // Capstone is optional: without the WASM build `disassemble` says so.
  let disassembler: Disassembler | null = null;
  void Disassembler.init().then((d) => { disassembler = d; });

  // Tools and the prompt section need the bridge service plus dsh's registries.
  // ctx.inject holds this scope PENDING until all services exist and unwinds
  // it (tools unregister, section removed, view server closed) if any goes away.
  ctx.inject(["mesen", "tools", "attachments", "systemPrompt", "agents"], (scope) => {
    const tools = makeCoreTools({
      mesen: () => scope.mesen.adapter,
      attachments: () => scope.get("attachments"),
      waitForConnection: (ms, signal) => scope.mesen.waitForConnection(ms, signal),
      disassembler: () => disassembler,
      mapping: () => scope.mesen.mapping,
      onResult: (toolName, result) => scope.mesen.observeToolResult(toolName, result),
    });
    for (const tool of tools) scope.tools.register(tool);
    scope.tools.register(makePromoteMappingsTool({
      romInfo: () => scope.mesen.romInfo,
      discoveries: () => scope.mesen.discoveries,
      onPromoted: (merged) => scope.mesen.adoptMapping(merged),
      mappingsDir: () => config.mappingsDir ?? REPO_MAPPINGS_DIR,
    }));

    scope.systemPrompt.section({
      name: JEROMY_SECTION_NAME,
      order: JEROMY_SECTION_ORDER,
      text: () => jeromySectionText(scope.mesen),
      interpolate: false,
    });

    // The emulator view hands pixel clicks to whichever agent the person is
    // driving: the current initiator, else the most recently created one.
    const inject = (text: string): boolean => {
      const agent = scope.agents.currentInitiator() ?? scope.agents.list().at(-1);
      if (!agent) return false;
      agent.inject(createUserMessage({ content: [{ type: "text", text }], source: VIEW_SOURCE }));
      return true;
    };
    const view = createEmulatorViewServer(
      { mesen: () => scope.mesen.adapter, inject, log: (m) => scope.logger.warn(m) },
      () => scope.mesen.romInfo?.name ?? null,
      (tileId) => scope.mesen.mappingNameFor(tileId),
    );
    scope.effect(() => {
      view.server.listen(config.viewPort, "127.0.0.1", () => {
        scope.logger.info(`jeromy: emulator view at http://127.0.0.1:${config.viewPort}/`);
      });
      view.server.on("error", (error) => scope.logger.warn(`jeromy: emulator view server error: ${error.message}`));
      // Disposal order matters: a browser tab keeps the event stream open, so
      // the pump must stop BEFORE the scope becomes inactive, or its next
      // tick reads scope.mesen and crashes the host at shutdown (seen in
      // headless runs with the sidebar view open, 2026-10-05).
      return () => { view.shutdown(); };
    });

    scope.logger.info(`jeromy: ${tools.length + 1} tools, prompt section and emulator view registered`);
  });

  // Curated ROM-hacking skills (ADR-0008): embedded registrations in the host
  // layer, so every agent preset's `skill` tool and the user's skill commands
  // see them. Separate inject: a profile without the skill registry still
  // gets the tools above.
  ctx.inject(["skills"], (scope) => {
    const files = loadSkillFiles(REPO_SKILLS_DIR);
    for (const skill of files) {
      scope.effect(() => scope.skills.register({
        name: skill.name,
        description: skill.description,
        ...(skill.whenToUse ? { whenToUse: skill.whenToUse } : {}),
        content: skill.content,
        path: skill.path,
        source: "bundled",
        resourceBase: { kind: "directory", path: dirname(skill.path) },
        invocation: { modelInvocable: skill.modelInvocable, userInvocable: skill.userInvocable },
        ...(skill.metadata ? { metadata: skill.metadata } : {}),
      }));
    }
    scope.logger.info(`jeromy: ${files.length} skills registered (${files.map((f) => f.name).join(", ")})`);
  });
}
