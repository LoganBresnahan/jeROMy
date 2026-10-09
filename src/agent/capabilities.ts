/**
 * Which core tools the connected Mesen build can run, from the bridge's
 * `debug_event_types` probe at connect time. Pure: the dsh service probes,
 * this decides, and a tool with a reason here fails before it reaches Lua.
 */
import type { DebugEventTypesResult } from "../bridge/mesen/protocol.js";

/**
 * Tool name → why this build cannot run it. A null probe (an older
 * bridge.lua without the handler, or a failed call) blocks nothing: the
 * tool's own error is the better report than a guess.
 */
export function unavailableTools(probe: DebugEventTypesResult | null): Map<string, string> {
  const out = new Map<string, string>();
  if (!probe) return out;
  const missing: string[] = [];
  // play_input applies its script from inputPolled with setInput (ADR-0019); without either it would run frames and press nothing.
  if (probe.event_types?.inputPolled === undefined) missing.push("no inputPolled event");
  if (!probe.has_set_input) missing.push("no emu.setInput");
  if (missing.length) out.set("play_input", `play_input is unavailable: this Mesen build's Lua API has ${missing.join(" and ")}. Update Mesen2, or ask the person to play the moment instead.`);
  return out;
}
