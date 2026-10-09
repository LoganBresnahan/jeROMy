import { describe, it, expect } from "vitest";
import { unavailableTools } from "./capabilities.js";

describe("unavailableTools (debug_event_types probe, ADR-0019)", () => {
  it("blocks nothing on a build with inputPolled and setInput", () => {
    expect(unavailableTools({ event_types: { endFrame: 1, inputPolled: 5 }, has_set_input: true, has_get_input: true }).size).toBe(0);
  });

  it("blocks play_input when inputPolled is missing", () => {
    const out = unavailableTools({ event_types: { endFrame: 1 }, has_set_input: true, has_get_input: true });
    expect(out.get("play_input")).toMatch(/has no inputPolled event\./);
  });

  it("blocks play_input when setInput is missing, naming both gaps", () => {
    const out = unavailableTools({ event_types: {}, has_set_input: false, has_get_input: false });
    expect(out.get("play_input")).toMatch(/no inputPolled event and no emu\.setInput/);
  });

  it("blocks nothing when the probe failed (older bridge.lua)", () => {
    expect(unavailableTools(null).size).toBe(0);
  });
});
