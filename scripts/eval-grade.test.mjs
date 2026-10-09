// ADR-0020: a run's grade holds every claim to its proof step and reports
// the distribution per line, never a scalar. Rows are shaped like
// scripts/score-mapping.mjs output; only the fields read here matter.
import { describe, expect, it } from "vitest";
import { distribution, finalVerdict } from "./eval-grade.mjs";

describe("eval-grade", () => {
  it("a reference agreement without its proof step is unproven", () => {
    expect(finalVerdict({ verdict: "agrees", proof: "write+look" })).toBe("agrees");
    expect(finalVerdict({ verdict: "agrees", proof: null })).toBe("unproven");
    expect(finalVerdict({ verdict: "agrees", proof: "write-no-look" })).toBe("unproven");
    expect(finalVerdict({ verdict: "disagrees", proof: "watch" })).toBe("disagrees");
    expect(finalVerdict({ verdict: "needs-judge", proof: null })).toBe("needs-judge");
  });

  it("counts each line once per stage, a right claim outranking a wrong one", () => {
    const lines = [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }, { id: "d", name: "D" }];
    const rows = [
      { line: "a", name: "a1", proof: "write+look", promoted: true, final: "agrees" },
      { line: "a", name: "a2", proof: null, promoted: false, final: "unproven" },
      { line: "b", name: "b1", proof: "write+look", promoted: false, final: "disagrees" },
      { line: "c", name: "c1", proof: null, promoted: true, final: "unproven" },
      { line: null, name: "stray", proof: null, promoted: false, final: "unknown-to-reference" },
    ];
    const { stages, per } = distribution(lines, rows);
    expect(stages).toEqual({ in_scope: 4, reached_proof: 2, recorded: 3, promoted: 2, right: 1, wrong: 1, unproven: 1 });
    expect(per[0].best.name).toBe("a1");
    expect(per[3]).toMatchObject({ recorded: false, best: null });
  });
});
