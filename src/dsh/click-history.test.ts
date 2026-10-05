import { describe, it, expect } from "vitest";
import { ClickHistory, HISTORY_CAP } from "./click-history.js";

const box = { x: 0, y: 0, width: 8, height: 8 };
const click = (mode: "pixel" | "tile" | "color" | "object", x = 1, y = 1) => ({ mode, x, y, label: `${mode} (${x}, ${y})`, text: `[emulator view] The user clicked pixel (${x}, ${y}) in ${mode} mode`, overlay: { box } });

describe("ClickHistory (ADR-0015)", () => {
  it("checks the newest click per mode by default and unchecks the previous one of that mode only", () => {
    const h = new ClickHistory();
    const c1 = h.add(click("color", 10, 10));
    const t1 = h.add(click("tile", 20, 20));
    const c2 = h.add(click("color", 30, 30));
    expect(h.list().map((r) => [r.id, r.selected])).toEqual([[c2.id, true], [t1.id, true], [c1.id, false]]);
    expect(h.selectedCount()).toBe(2);
    expect(h.rev).toBe(3);
  });

  it("takeSelected hands over the checked records oldest first, marks them sent and unchecks them", () => {
    const h = new ClickHistory();
    const a = h.add(click("color"));
    h.add(click("object"));
    h.setSelected(a.id, true);
    const sent = h.takeSelected(7);
    expect(sent.map((r) => r.mode)).toEqual(["color", "object"]);
    expect(h.list().every((r) => !r.selected && r.sent_turn === 7)).toBe(true);
    expect(h.takeSelected(8)).toEqual([]);
    // A sent record can be re-checked and goes again.
    h.setSelected(a.id, true);
    expect(h.takeSelected(9).map((r) => r.id)).toEqual([a.id]);
    expect(h.get(a.id)?.sent_turn).toBe(9);
  });

  it("setSelected reports unknown ids, bumps rev only on change, and clear empties everything", () => {
    const h = new ClickHistory();
    const a = h.add(click("pixel"));
    const rev = h.rev;
    expect(h.setSelected(999, true)).toBe(false);
    expect(h.setSelected(a.id, true)).toBe(true);
    expect(h.rev).toBe(rev);
    expect(h.setSelected(a.id, false)).toBe(true);
    expect(h.rev).toBe(rev + 1);
    h.clear();
    expect(h.list()).toEqual([]);
    expect(h.rev).toBe(rev + 2);
  });

  it("drops the oldest unchecked record past the cap, never a checked one", () => {
    const h = new ClickHistory();
    for (let i = 0; i < HISTORY_CAP + 3; i++) h.add(click("pixel", i, 0));
    expect(h.list()).toHaveLength(HISTORY_CAP);
    expect(h.list()[0].x).toBe(HISTORY_CAP + 2);
    expect(h.selectedCount()).toBe(1);
  });
});
