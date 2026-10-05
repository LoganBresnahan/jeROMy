/**
 * The jeROMy system-prompt section: the full NES reference and tool guidance
 * from core (src/agent/prompts.ts), with ROM identity, loaded mapping and
 * pause state from the Mesen service. Order 3100 places it after dsh's own
 * tool sections (TOOL_COMPUTER_USE is 3000). Prompt text providers are
 * synchronous, which is why the service caches that state.
 */
import { buildSystemPrompt } from "../agent/prompts.js";
import type { MesenService } from "./mesen-service.js";

export const JEROMY_SECTION_NAME = "jeromy:emulator";
export const JEROMY_SECTION_ORDER = 3100;

export function jeromySectionText(mesen: MesenService): string {
  const body = buildSystemPrompt({
    romInfo: mesen.romInfo ?? undefined,
    mapping: mesen.mapping,
    emulatorPaused: mesen.paused ?? undefined,
  });
  const link = mesen.isConnected
    ? ""
    : "\n\n## Bridge status\nThe Mesen2 bridge was not connected when this prompt was assembled. The Lua side reconnects every ~2 s and every emulator tool waits up to 10 s for it, so call the tool you need; only if it fails with a connection error should you ask the user to load mesen/bridge.lua in Mesen2's Script Window.";
  return body + link;
}
