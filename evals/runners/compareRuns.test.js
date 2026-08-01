/**
 * Comparison tests: verdicts, incompatibility refusals, and the limits the
 * comparison is required to state rather than paper over.
 */
import { describe, it, expect } from "vitest";

import { compareRuns, IncompatibleRunsError, COMPARISON_LIMITATIONS } from "./compareRuns.js";
import { renderComparisonMarkdown } from "../reporters/markdownReporter.js";

function makeRun({
  runId = "run-a",
  requiredFailures = 0,
  advisoryFailures = 0,
  passedCases = 1,
  winner = "cand-a",
  ranking = ["cand-a", "cand-b"],
  bestPair = null,
  keyReason = "Highest score.",
  benchmarkVersion = "1.0.0",
  benchmarkId = "decision-benchmark-v1",
  mode = "fixtures",
  repetitions = 1,
  stabilityAssessed = false,
  tokens = 100,
  cost = 0.01,
  duration = 1000,
  humanReview = null,
  caseIds = ["case-001"],
  contractValidityStatus = "pass",
} = {}) {
  return {
    manifest: {
      run_id: runId,
      schema_version: "1.0.0",
      benchmark_id: benchmarkId,
      benchmark_version: benchmarkVersion,
      mode,
      repetitions,
      total_tokens: tokens,
      estimated_cost_usd: cost,
      duration_ms: duration,
    },
    summary: {
      required_failures: requiredFailures,
      advisory_failures: advisoryFailures,
      passed_cases: passedCases,
      stability: stabilityAssessed
        ? { assessed: true, reason: "assessed", winner_agreement: 1, ranking_agreement: 1 }
        : { assessed: false, reason: "single repetition", winner_agreement: null, ranking_agreement: null },
    },
    caseResults: caseIds.map((caseId) => ({
      case_id: caseId,
      required_failures: requiredFailures,
      advisory_failures: advisoryFailures,
      executions: [
        {
          status: "completed",
          scenario: "A fictional scenario.",
          scenario_index: 0,
          outcome: { winner_id: winner, ranking, best_pair_key: bestPair },
          grader_results: [
            { grader_id: "contract-validity", severity: "required", status: contractValidityStatus, summary: "", details: [] },
          ],
          response: {
            candidate_evaluations: ranking.map((id) => ({ candidate_id: id })),
            decision_result: { key_reason: keyReason },
            executive_summary: { recommendation: `${winner} recommended.` },
          },
        },
      ],
    })),
    humanReview,
  };
}

function reviewWith(scores) {
  return {
    schema_version: "1.0.0",
    run_id: "r",
    benchmark_id: "decision-benchmark-v1",
    benchmark_version: "1.0.0",
    rubric_version: "1.0.0",
    instructions: "x".repeat(50),
    scale_legend: { 0: "unacceptable" },
    entries: [
      {
        execution_id: "e",
        case_id: "case-001",
        scenario_index: 0,
        repetition: 1,
        reviewer: "reviewer",
        reviewed_at: "2026-08-02",
        dimensions: Object.entries(scores).map(([id, score]) => ({
          dimension_id: id,
          label: id,
          what_is_judged: "judged",
          anchors: { 0: "bad" },
          score,
          reviewer_notes: "",
        })),
        overall_notes: "",
      },
    ],
  };
}

describe("comparison verdicts", () => {
  it("reports unchanged for two identical runs", () => {
    const report = compareRuns(makeRun(), makeRun({ runId: "run-b" }));
    expect(report.verdict).toBe("unchanged");
    expect(report.verdict_reasons.join(" ")).toContain("identical");
  });

  it("reports improved when required failures fall", () => {
    const report = compareRuns(
      makeRun({ requiredFailures: 3, passedCases: 0 }),
      makeRun({ runId: "run-b", requiredFailures: 0, passedCases: 1 }),
    );
    expect(report.verdict).toBe("improved");
    expect(report.invariants.required_failures.delta).toBe(-3);
  });

  it("reports regressed when required failures rise", () => {
    const report = compareRuns(
      makeRun({ requiredFailures: 0 }),
      makeRun({ runId: "run-b", requiredFailures: 2 }),
    );
    expect(report.verdict).toBe("regressed");
    expect(report.invariants.required_failures.delta).toBe(2);
  });

  it("reports inconclusive when the winner changes without an invariant change", () => {
    const report = compareRuns(
      makeRun(),
      makeRun({ runId: "run-b", winner: "cand-b", ranking: ["cand-b", "cand-a"] }),
    );
    expect(report.verdict).toBe("inconclusive");
    expect(report.winner_changes).toEqual(["case-001"]);
    expect(report.ranking_changes).toEqual(["case-001"]);
  });

  it("reports inconclusive when only the explanation text changed", () => {
    const report = compareRuns(makeRun(), makeRun({ runId: "run-b", keyReason: "Different wording." }));
    expect(report.verdict).toBe("inconclusive");
    expect(report.cases[0].explanation_changed).toBe(true);
    expect(report.cases[0].winner_changed).toBe(false);
  });

  it("detects a changed best pair", () => {
    const report = compareRuns(
      makeRun({ bestPair: "a::b" }),
      makeRun({ runId: "run-b", bestPair: "a::c" }),
    );
    expect(report.pair_changes).toEqual(["case-001"]);
  });

  it("detects a schema failure change", () => {
    const report = compareRuns(
      makeRun(),
      makeRun({ runId: "run-b", contractValidityStatus: "fail", requiredFailures: 1 }),
    );
    expect(report.invariants.schema_failures.delta).toBe(1);
    expect(report.verdict).toBe("regressed");
  });

  it("reports inconclusive when the runs share no cases", () => {
    const report = compareRuns(
      makeRun({ caseIds: ["case-001"] }),
      makeRun({ runId: "run-b", caseIds: ["case-002"] }),
    );
    expect(report.verdict).toBe("inconclusive");
    expect(report.verdict_reasons.join(" ")).toContain("share no cases");
  });

  it("notes when only some cases overlap", () => {
    const report = compareRuns(
      makeRun({ caseIds: ["case-001", "case-002"] }),
      makeRun({ runId: "run-b", caseIds: ["case-001"] }),
    );
    expect(report.verdict_reasons.join(" ")).toContain("case selections differ");
  });

  it("notes when a fixture run is compared against a live run", () => {
    const report = compareRuns(makeRun(), makeRun({ runId: "run-b", mode: "live" }));
    expect(report.verdict_reasons.join(" ")).toContain("different modes");
  });
});

describe("comparison refusals", () => {
  it("refuses different benchmarks", () => {
    expect(() =>
      compareRuns(makeRun(), makeRun({ runId: "run-b", benchmarkId: "other-benchmark-v1" })),
    ).toThrow(IncompatibleRunsError);
  });

  it("refuses different benchmark versions", () => {
    expect(() =>
      compareRuns(makeRun(), makeRun({ runId: "run-b", benchmarkVersion: "2.0.0" })),
    ).toThrow(/A benchmark version change alters what the cases mean/);
  });

  it("refuses different run schema versions", () => {
    const candidate = makeRun({ runId: "run-b" });
    candidate.manifest.schema_version = "2.0.0";
    expect(() => compareRuns(makeRun(), candidate)).toThrow(/run schema versions/);
  });
});

describe("cost, tokens, and duration", () => {
  it("reports raw deltas and never claims significance", () => {
    const report = compareRuns(
      makeRun({ cost: 0.02, tokens: 200, duration: 2000 }),
      makeRun({ runId: "run-b", cost: 0.01, tokens: 100, duration: 1000 }),
    );
    expect(report.cost.delta).toBeCloseTo(-0.01, 10);
    expect(report.tokens.delta).toBe(-100);
    expect(report.duration_ms.delta).toBe(-1000);
    for (const entry of [report.cost, report.tokens, report.duration_ms]) {
      expect(entry.significance).toBe("not_assessed");
    }
  });

  it("does not let a cost change alter the verdict", () => {
    const report = compareRuns(makeRun({ cost: 10 }), makeRun({ runId: "run-b", cost: 0.0001 }));
    expect(report.verdict).toBe("unchanged");
  });

  it("reports a null delta when a cost is unavailable", () => {
    const report = compareRuns(makeRun({ cost: null }), makeRun({ runId: "run-b", cost: 0.01 }));
    expect(report.cost.delta).toBeNull();
  });
});

describe("rubric comparison", () => {
  it("declines to compare when neither run carries a review", () => {
    const report = compareRuns(makeRun(), makeRun({ runId: "run-b" }));
    expect(report.rubric.compared).toBe(false);
    expect(report.rubric.reason).toContain("baseline and candidate");
  });

  it("declines to compare when only one run carries a review", () => {
    const report = compareRuns(
      makeRun({ humanReview: reviewWith({ clarity: 3 }) }),
      makeRun({ runId: "run-b" }),
    );
    expect(report.rubric.compared).toBe(false);
  });

  it("declines to compare two blank templates", () => {
    const blank = reviewWith({ clarity: null });
    const report = compareRuns(
      makeRun({ humanReview: blank }),
      makeRun({ runId: "run-b", humanReview: blank }),
    );
    expect(report.rubric.compared).toBe(false);
  });

  it("compares dimension means when both runs carry real scores", () => {
    const report = compareRuns(
      makeRun({ humanReview: reviewWith({ clarity: 2, evidence_grounding: 3 }) }),
      makeRun({ runId: "run-b", humanReview: reviewWith({ clarity: 4, evidence_grounding: 3 }) }),
    );
    expect(report.rubric.compared).toBe(true);
    expect(report.rubric.dimensions.clarity.delta).toBe(2);
    expect(report.rubric.dimensions.evidence_grounding.delta).toBe(0);
  });

  it("does not let a rubric change alter the verdict", () => {
    const report = compareRuns(
      makeRun({ humanReview: reviewWith({ clarity: 0 }) }),
      makeRun({ runId: "run-b", humanReview: reviewWith({ clarity: 4 }) }),
    );
    expect(report.verdict).toBe("unchanged");
  });
});

describe("stability comparison", () => {
  it("declines when either run used a single repetition", () => {
    const report = compareRuns(
      makeRun({ stabilityAssessed: true, repetitions: 3 }),
      makeRun({ runId: "run-b" }),
    );
    expect(report.stability.compared).toBe(false);
    expect(report.stability.reason).toContain("single repetition");
  });

  it("compares when both runs assessed stability", () => {
    const report = compareRuns(
      makeRun({ stabilityAssessed: true, repetitions: 3 }),
      makeRun({ runId: "run-b", stabilityAssessed: true, repetitions: 3 }),
    );
    expect(report.stability.compared).toBe(true);
    expect(report.stability.baseline_winner_agreement).toBe(1);
  });
});

describe("comparison report shape", () => {
  it("always states its limitations", () => {
    const report = compareRuns(makeRun(), makeRun({ runId: "run-b" }));
    expect(report.limitations).toEqual([...COMPARISON_LIMITATIONS]);
    expect(report.limitations.join(" ")).toContain("cannot establish statistical significance");
  });

  it("renders to markdown without ANSI escapes", () => {
    const markdown = renderComparisonMarkdown(compareRuns(makeRun(), makeRun({ runId: "run-b" })));
    expect(markdown).toContain("**Verdict: unchanged**");
    expect(markdown).toContain("## Limitations");
    // eslint-disable-next-line no-control-regex
    expect(/\u001b\[/.test(markdown)).toBe(false);
  });
});
