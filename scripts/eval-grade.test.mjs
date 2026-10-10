// ADR-0020: a run's grade holds every claim to its proof step and reports
// the distribution per line, never a scalar. Rows are shaped like
// scripts/score-mapping.mjs output; only the fields read here matter.
import { describe, expect, it } from "vitest";
import { applyJudgments, compareRuns, distribution, finalVerdict } from "./eval-grade.mjs";

describe("eval-grade", () => {
  it("applies Claude's picture verdicts by record id, never over a reference verdict or a missing proof", () => {
    const rows = [
      { id: "chr:0x145", line: "A3.bush", reference_verdict: "needs-judge", final: "needs-judge", proof: "look", grader: "claude" },
      { id: "chr:0x146", line: "A3.hill", reference_verdict: "needs-judge", final: "needs-judge", proof: null, grader: "claude" },
      { id: "0x075A", line: "C1.lives", reference_verdict: "agrees", final: "agrees", proof: "write+look", grader: "reference" },
    ];
    const unused = applyJudgments(rows, [
      { id: "chr:0x145", verdict: "confirmed", line: "A3.brick", image: "a.png", why: "brown brick at (64,176)" },
      { id: "chr:0x146", verdict: "confirmed", image: "b.png", why: "green hill" },
      { id: "0x075A", verdict: "rejected" },
    ]);
    expect(rows[0]).toMatchObject({ line: "A3.brick", final: "confirmed", grader: "claude", image: "a.png" });
    expect(rows[1].final).toBe("unproven");
    expect(rows[2].final).toBe("agrees");
    expect(unused.map((j) => j.id)).toEqual(["0x075A"]);
  });

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
      { line: "a", name: "a1", proof: "write+look", promoted: true, derived: true, final: "agrees" },
      { line: "a", name: "a2", proof: null, promoted: false, final: "unproven" },
      { line: "b", name: "b1", proof: "write+look", promoted: false, final: "disagrees" },
      { line: "c", name: "c1", proof: null, promoted: true, final: "unproven" },
      { line: null, name: "stray", proof: null, promoted: false, final: "unknown-to-reference" },
    ];
    const { stages, per } = distribution(lines, rows);
    expect(stages).toEqual({ in_scope: 4, reached_proof: 2, recorded: 3, derived: 1, promoted: 2, right: 1, wrong: 1, unproven: 1 });
    expect(per[0].best.name).toBe("a1");
    expect(per[3]).toMatchObject({ recorded: false, best: null });
  });

  it("compares a re-run with the run it redoes, line by line", () => {
    const lines = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    const before = [
      { line: "a", name: "a", proof: "write+look", final: "agrees" },
      { line: "b", name: "b", proof: "write+look", final: "disagrees" },
      { line: "d", name: "d", proof: "write+look", final: "agrees" },
    ];
    const after = [
      { line: "a", name: "a", proof: "write+look", final: "agrees", derived: true },
      { line: "b", name: "b", proof: "write+look", final: "agrees" },
      { line: "c", name: "c", proof: "write+look", final: "agrees" },
      { line: "d", name: "d", proof: null, final: "unproven" },
    ];
    expect(compareRuns(lines, before, after).map((c) => [c.id, c.change, c.now])).toEqual([
      ["a", "same", "agrees, derived"], ["b", "better", "agrees"], ["c", "new", "agrees"], ["d", "worse", "unproven"],
    ]);
  });
});
