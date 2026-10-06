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
  const hackName = mesen.hackStore?.hackName;
  const boot = mesen.bootApply;
  const ledger = hackName
    ? `\n\n## Active hack: ${hackName}\nROM writes ledger into this hack and exports version it (list_hacks, new_hack, use_hack switch; ADR-0018). `
      + (mesen.ledgerStatus && mesen.ledgerStatus.total > 0
        ? `${mesen.ledgerStatus.total} ROM edit(s) are ledgered; ${mesen.ledgerStatus.missing.length} of them are not present in the emulator's copy right now${mesen.ledgerStatus.missing.length ? " (Mesen reloaded the ROM, or the bytes conflicted at boot). Call reapply_edits to put them back before judging what you see." : "."}`
          + (boot && boot.applied.length ? ` ${boot.applied.length} were applied automatically when the emulator connected${boot.reset ? " and the game was reset to show them" : ""}.` : "")
          + (boot && boot.conflicts.length ? ` ${boot.conflicts.length} conflicted at boot (the emulator held neither the old nor the new bytes) and were left alone: edits #${boot.conflicts.join(", #")}.` : "")
        : "Its ledger is empty: nothing has been written to ROM yet.")
    : "";
  const link = mesen.isConnected
    ? ""
    : "\n\n## Bridge status\nThe Mesen2 bridge was not connected when this prompt was assembled. The Lua side reconnects every ~2 s and every emulator tool waits up to 10 s for it, so call the tool you need; only if it fails with a connection error should you ask the user to load mesen/bridge.lua in Mesen2's Script Window.";
  return body + ledger + link;
}
