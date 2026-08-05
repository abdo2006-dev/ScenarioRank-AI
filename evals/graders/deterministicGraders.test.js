/**
 * Deterministic grader tests.
 *
 * Every grader is proven twice: once that it passes a genuinely good result,
 * and once that it catches a specific, realistic defect. A grader that has
 * only ever been seen to pass is not evidence of anything.
 *
 * Good results come from executing the real pipeline with the offline fixture
 * provider, so the "pass" side is never a hand-built object that happens to
 * satisfy the grader.
 */
import { describe, it, expect, beforeAll } from "vitest";

import { loadBenchmark } from "../datasets/loadBenchmark.js";
import { createEvalFakeProvider } from "../fixtures/fakeProviderProfiles.js";
import { runCase } from "../runners/runCase.js";
import {
  EXECUTION_GRADERS,
  CASE_GRADERS,
  ALL_GRADERS,
  runGraders,
  countFailures,
  applyKnownDefects,
  checkKnownDefectsStillReproduce,
  graderVersions,
} from "./deterministicGraders.js";

const graderById = new Map(ALL_GRADERS.map((grader) => [grader.id, grader]));

let benchmark;
let caseById;

beforeAll(async () => {
  benchmark = await loadBenchmark();
  caseById = new Map(benchmark.cases.map((entry) => [entry.case_id, entry]));
});

/** Executes a case with the fixture provider and returns a grading context. */
async function contextFor(caseId, { profile } = {}) {
  const benchmarkCase = caseById.get(caseId);
  const result = await runCase({
    benchmarkCase,
    model: "fixture:test",
    createProvider: ({ scenarioIndex }) =>
      createEvalFakeProvider({ benchmarkCase, scenarioIndex, profile }),
  });
  const execution = result.executions[0];
  return {
    benchmarkCase,
    caseResult: result,
    execution,
    response: structuredClone(execution.response),
    // The trace is not carried on the execution record, so it is rebuilt here
    // from the case's own expectations for the graders that consume it.
    trace: {
      requestedCandidateIds: benchmarkCase.input.candidates.map((candidate) => candidate.id),
      requestedPairKeys: benchmarkCase.deterministic_expectations.expected_pair_count
        ? buildExpectedPairKeys(benchmarkCase)
        : null,
    },
    stageSnapshots: [],
    repetitions: 1,
  };
}

function buildExpectedPairKeys(benchmarkCase) {
  const ids = benchmarkCase.input.candidates.slice(0, 4).map((candidate) => candidate.id);
  const keys = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) keys.push([ids[i], ids[j]].sort().join("::"));
  }
  return keys;
}

const run = (graderId, context) => graderById.get(graderId).run(context);

describe("grader registry", () => {
  it("registers every grader exactly once with a version", () => {
    const ids = ALL_GRADERS.map((grader) => grader.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const grader of ALL_GRADERS) {
      expect(grader.version, grader.id).toMatch(/^\d+\.\d+\.\d+$/);
      expect(["required", "advisory"], grader.id).toContain(grader.severity);
    }
  });

  it("exposes grader versions for the run manifest", () => {
    expect(Object.keys(graderVersions())).toHaveLength(ALL_GRADERS.length);
  });

  it("converts a throwing grader into an error result instead of losing the run", () => {
    const results = runGraders(
      [{ id: "boom", version: "1.0.0", severity: "required", run: () => { throw new Error("kaboom"); } }],
      {},
    );
    expect(results[0].status).toBe("error");
    expect(results[0].details[0]).toContain("kaboom");
  });

  it("counts only required failures and errors toward the gate", () => {
    const counts = countFailures([
      { status: "fail", severity: "required" },
      { status: "error", severity: "required" },
      { status: "fail", severity: "advisory" },
      { status: "pass", severity: "required" },
      { status: "skip", severity: "required" },
      { status: "expected_failure", severity: "required" },
    ]);
    expect(counts).toEqual({ required: 2, advisory: 1 });
  });
});

describe("contract-validity", () => {
  it("passes a real, well-formed response", async () => {
    const context = await contextFor("case-007");
    expect(run("contract-validity", context).status).toBe("pass");
  });

  it("catches a response that violates the public contract", async () => {
    const context = await contextFor("case-007");
    context.response.candidate_evaluations[0].overall_confidence = 5;
    const result = run("contract-validity", context);
    expect(result.status).toBe("fail");
    expect(result.details.join(" ")).toContain("overall_confidence");
  });

  it("catches a non-finite number that a schema would accept", async () => {
    const context = await contextFor("case-007");
    context.response.candidate_evaluations[0].weighted_fit_score = Number.NaN;
    expect(run("contract-validity", context).details.join(" ")).toContain("non-finite");
  });

  it("catches a malformed stage event", async () => {
    const context = await contextFor("case-007");
    context.stageSnapshots = [[{ id: "input", label: "Input", status: "not-a-status" }]];
    expect(run("contract-validity", context).status).toBe("fail");
  });

  it("accepts the committed signed negative score while enforcing the contract boundary", async () => {
    const context = await contextFor("case-001");
    expect(context.response.candidate_evaluations.some((candidate) => candidate.risk_adjusted_score === -30)).toBe(true);
    expect(run("contract-validity", context).status).toBe("pass");

    context.response.candidate_evaluations[0].risk_adjusted_score = -100.01;
    expect(run("contract-validity", context).details.join(" ")).toContain("risk_adjusted_score");
  });
});

describe("candidate-coverage", () => {
  it("passes complete coverage", async () => {
    const context = await contextFor("case-007");
    expect(run("candidate-coverage", context).status).toBe("pass");
  });

  it("catches a missing candidate", async () => {
    const context = await contextFor("case-007");
    context.response.candidate_evaluations.pop();
    const result = run("candidate-coverage", context);
    expect(result.status).toBe("fail");
    expect(result.details.join(" ")).toContain("is missing from candidate_evaluations");
  });

  it("catches an unknown candidate", async () => {
    const context = await contextFor("case-007");
    context.response.candidate_evaluations[0].candidate_id = "ghost";
    expect(run("candidate-coverage", context).details.join(" ")).toContain('unknown candidate "ghost"');
  });

  it("catches a duplicated candidate", async () => {
    const context = await contextFor("case-007");
    context.response.candidate_evaluations[1].candidate_id =
      context.response.candidate_evaluations[0].candidate_id;
    expect(run("candidate-coverage", context).details.join(" ")).toContain("appears 2 times");
  });

  it("catches non-contiguous ranks", async () => {
    const context = await contextFor("case-007");
    context.response.candidate_evaluations[2].rank = 9;
    expect(run("candidate-coverage", context).details.join(" ")).toContain("contiguous");
  });

  it("catches a scoring stage that requested the wrong candidate set", async () => {
    const context = await contextFor("case-007");
    context.trace.requestedCandidateIds = ["dagny-holloway"];
    expect(run("candidate-coverage", context).details.join(" ")).toContain("scoring stage requested");
  });

  it("accepts duplicate display names that remain distinct by ID", async () => {
    const context = await contextFor("case-015");
    expect(run("candidate-coverage", context).status).toBe("pass");
  });
});

describe("ranking-consistency", () => {
  it("passes a correctly ordered ranking", async () => {
    const context = await contextFor("case-007");
    expect(run("ranking-consistency", context).status).toBe("pass");
  });

  it("catches a ranking that disagrees with the deterministic score", async () => {
    const context = await contextFor("case-007");
    const [first, second] = context.response.candidate_evaluations;
    [first.rank, second.rank] = [second.rank, first.rank];
    const result = run("ranking-consistency", context);
    expect(result.status).toBe("fail");
    expect(result.details.join(" ")).toContain("outscores rank");
  });

  it("catches a winner that is not rank 1", async () => {
    const context = await contextFor("case-007");
    const other = context.response.candidate_evaluations.find((c) => c.rank !== 1);
    context.response.decision_result.recommended_candidate_id = other.candidate_id;
    context.response.decision_result.recommended_candidate_name = other.candidate_name;
    expect(run("ranking-consistency", context).details.join(" ")).toContain("but rank 1 is");
  });

  it("catches a winner name that disagrees with the winner ID", async () => {
    const context = await contextFor("case-007");
    context.response.decision_result.recommended_candidate_name = "Someone Else";
    expect(run("ranking-consistency", context).details.join(" ")).toContain("but rank 1 is");
  });

  it("accepts a tie resolved by submission order, the documented behaviour", async () => {
    const context = await contextFor("case-007");
    const ranked = [...context.response.candidate_evaluations].sort((a, b) => a.rank - b.rank);
    // Force an exact tie between rank 1 and rank 2, keeping submission order.
    ranked[1].weighted_fit_score = ranked[0].weighted_fit_score;
    const submission = context.benchmarkCase.input.candidates.map((c) => c.id);
    if (submission.indexOf(ranked[0].candidate_id) < submission.indexOf(ranked[1].candidate_id)) {
      expect(run("ranking-consistency", context).status).toBe("pass");
    }
  });

  it("catches a tie resolved against submission order", async () => {
    const context = await contextFor("case-007");
    const ranked = [...context.response.candidate_evaluations].sort((a, b) => a.rank - b.rank);
    ranked[1].weighted_fit_score = ranked[0].weighted_fit_score;
    // Swap identities so the later-submitted candidate holds the better rank.
    const submission = context.benchmarkCase.input.candidates.map((c) => c.id);
    const firstPos = submission.indexOf(ranked[0].candidate_id);
    const secondPos = submission.indexOf(ranked[1].candidate_id);
    if (firstPos < secondPos) {
      [ranked[0].candidate_id, ranked[1].candidate_id] = [ranked[1].candidate_id, ranked[0].candidate_id];
      context.response.decision_result.recommended_candidate_id = ranked[0].candidate_id;
      expect(run("ranking-consistency", context).details.join(" ")).toContain("submission order");
    }
  });
});

describe("score-integrity", () => {
  it("passes real pipeline output", async () => {
    const context = await contextFor("case-007");
    expect(run("score-integrity", context).status).toBe("pass");
  });

  it("catches an out-of-range criterion score", async () => {
    const context = await contextFor("case-007");
    context.response.candidate_evaluations[0].criteria_scores.domain_expertise.score = 42;
    expect(run("score-integrity", context).details.join(" ")).toContain("outside 1-10");
  });

  it("catches an out-of-range confidence", async () => {
    const context = await contextFor("case-007");
    context.response.candidate_evaluations[0].criteria_scores.domain_expertise.confidence = 4;
    expect(run("score-integrity", context).details.join(" ")).toContain("outside 0-1");
  });

  it("catches a deterministic value that does not survive recomputation", async () => {
    const context = await contextFor("case-007");
    context.response.candidate_evaluations[0].risk_profile.execution_risk = 0.999;
    const result = run("score-integrity", context);
    expect(result.status).toBe("fail");
    expect(result.details.join(" ")).toContain("recomputation gives");
  });

  it("catches a model-authored value replacing a deterministic outcome score", async () => {
    const context = await contextFor("case-007");
    context.response.candidate_evaluations[0].expected_outcome_score = 99;
    expect(run("score-integrity", context).details.join(" ")).toContain("expected_outcome_score");
  });

  it("accepts signed values and rejects risk-adjusted scores outside -100 through 100", async () => {
    const context = await contextFor("case-001");
    expect(run("score-integrity", context).status).toBe("pass");
    context.response.candidate_evaluations[0].risk_adjusted_score = 100.01;
    expect(run("score-integrity", context).details.join(" ")).toContain("outside -100-100");
  });
});

describe("pairing-integrity", () => {
  it("passes complete, canonical pair coverage", async () => {
    const context = await contextFor("case-015");
    expect(run("pairing-integrity", context).status).toBe("pass");
  });

  it("passes a pairing-disabled case with no pairing result", async () => {
    const context = await contextFor("case-007");
    expect(run("pairing-integrity", context).status).toBe("pass");
  });

  it("catches a fabricated pair result when pairing is disabled", async () => {
    const context = await contextFor("case-007");
    context.response.pairing_result = { status: "ok", best_pair: {}, top_pairs: [] };
    expect(run("pairing-integrity", context).status).toBe("fail");
  });

  it("catches an incomplete requested pair set", async () => {
    const context = await contextFor("case-015");
    context.trace.requestedPairKeys = context.trace.requestedPairKeys.slice(0, 3);
    expect(run("pairing-integrity", context).details.join(" ")).toContain("requested 3 unique pair(s)");
  });

  it("catches a reversed duplicate pair", async () => {
    const context = await contextFor("case-015");
    const pairs = context.response.pairing_result.top_pairs;
    pairs[1].candidate_id_a = pairs[0].candidate_id_b;
    pairs[1].candidate_id_b = pairs[0].candidate_id_a;
    pairs[1].pair = [pairs[0].pair[1], pairs[0].pair[0]];
    expect(run("pairing-integrity", context).details.join(" ")).toContain("duplicate or reversed duplicate");
  });

  it("catches a best pair missing from top_pairs", async () => {
    const context = await contextFor("case-015");
    context.response.pairing_result.top_pairs = context.response.pairing_result.top_pairs.slice(1);
    expect(run("pairing-integrity", context).details.join(" ")).toContain("does not appear in top_pairs");
  });

  it("catches a pair display name that disagrees with its candidate ID", async () => {
    const context = await contextFor("case-015");
    context.response.pairing_result.top_pairs[0].pair[0] = "Wrong Name";
    expect(run("pairing-integrity", context).details.join(" ")).toContain("but that ID belongs to");
  });

  it("catches an unexpected best pair", async () => {
    const context = await contextFor("case-016");
    context.benchmarkCase = {
      ...context.benchmarkCase,
      deterministic_expectations: {
        ...context.benchmarkCase.deterministic_expectations,
        expected_best_pair_ids: ["giselle-varga", "isolde-marchetti"],
      },
    };
    expect(run("pairing-integrity", context).details.join(" ")).toContain("the case expects");
  });

  it("fails when pairing reports unavailable for a case expecting coverage", async () => {
    const context = await contextFor("case-015");
    context.response.pairing_result = {
      status: "unavailable",
      reason: "Complete pair analysis was unavailable.",
      best_pair: null,
      top_pairs: [],
    };
    expect(run("pairing-integrity", context).status).toBe("fail");
  });
});

describe("pipeline-accounting", () => {
  it("passes 3 logical stages without pairing", async () => {
    const context = await contextFor("case-007");
    expect(context.response.run_metadata.logicalProviderStageCount).toBe(3);
    expect(run("pipeline-accounting", context).status).toBe("pass");
  });

  it("passes 4 logical stages with pairing", async () => {
    const context = await contextFor("case-015");
    expect(context.response.run_metadata.logicalProviderStageCount).toBe(4);
    expect(run("pipeline-accounting", context).status).toBe("pass");
  });

  it("catches a stage count that disagrees with the case", async () => {
    const context = await contextFor("case-007");
    context.response.run_metadata.logicalProviderStageCount = 4;
    expect(run("pipeline-accounting", context).details.join(" ")).toContain("this case requires 3");
  });

  it("catches per-stage attempts that do not sum to the total", async () => {
    const context = await contextFor("case-007");
    context.response.run_metadata.providerAttemptCount = 99;
    expect(run("pipeline-accounting", context).details.join(" ")).toContain("attempts sum to");
  });

  it("catches reasoning tokens exceeding output tokens", async () => {
    const context = await contextFor("case-007");
    context.response.run_metadata.outputTokens = 10;
    context.response.run_metadata.reasoningTokens = 50;
    expect(run("pipeline-accounting", context).details.join(" ")).toContain("reasoning tokens are a subset");
  });

  it("catches cached input tokens exceeding input tokens", async () => {
    const context = await contextFor("case-007");
    context.response.run_metadata.inputTokens = 5;
    context.response.run_metadata.cachedInputTokens = 50;
    expect(run("pipeline-accounting", context).details.join(" ")).toContain("cachedInputTokens");
  });

  it("catches a cost estimated for a run that reported no tokens", async () => {
    const context = await contextFor("case-007");
    context.response.run_metadata.estimatedCostUsd = 1.5;
    expect(run("pipeline-accounting", context).details.join(" ")).toContain("no tokens");
  });

  it("catches attempts beyond the case's ceiling", async () => {
    const context = await contextFor("case-007");
    context.response.run_metadata.attempts = { context: 40 };
    context.response.run_metadata.providerAttemptCount = 40;
    expect(run("pipeline-accounting", context).details.join(" ")).toContain("exceeds this case's maximum");
  });
});

describe("not-measured-fields", () => {
  it("passes real pipeline output", async () => {
    const context = await contextFor("case-007");
    expect(run("not-measured-fields", context).status).toBe("pass");
  });

  it("catches a fabricated cross-scenario consistency value", async () => {
    const context = await contextFor("case-007");
    context.response.outcome_models[0].cross_scenario_consistency = 75;
    expect(run("not-measured-fields", context).details.join(" ")).toContain("cross_scenario_consistency");
  });

  it("catches a fabricated best_scenario claim", async () => {
    const context = await contextFor("case-007");
    context.response.adaptability_profiles[0].best_scenario = "Rapid crisis/pivot scenario";
    expect(run("not-measured-fields", context).details.join(" ")).toContain("best_scenario");
  });
});

describe("winner-expectation", () => {
  it("passes an allowed winner", async () => {
    const context = await contextFor("case-007");
    expect(run("winner-expectation", context).status).toBe("pass");
  });

  it("catches a winner outside the allowed set", async () => {
    const context = await contextFor("case-007");
    context.response.decision_result.recommended_candidate_id = "farrah-lindgren";
    expect(run("winner-expectation", context).details.join(" ")).toContain("not among the allowed winners");
  });

  it("catches a forbidden winner", async () => {
    const context = await contextFor("case-007");
    context.response.decision_result.recommended_candidate_id = "farrah-lindgren";
    expect(run("winner-expectation", context).details.join(" ")).toContain("forbidden winner");
  });

  it("skips a case that deliberately makes no winner claim", async () => {
    const context = await contextFor("case-008");
    expect(run("winner-expectation", context).status).toBe("skip");
  });
});

describe("unsupported-claims", () => {
  it("passes the fixture's honest narrative", async () => {
    const context = await contextFor("case-007");
    expect(run("unsupported-claims", context).status).toBe("pass");
  });

  it("catches a fairness claim", async () => {
    const context = await contextFor("case-007");
    context.response.executive_summary.reason = "This is an unbiased assessment.";
    expect(run("unsupported-claims", context).details.join(" ")).toContain("fairness");
  });

  it("catches a calibration claim", async () => {
    const context = await contextFor("case-007");
    context.response.decision_result.key_reason = "Backed by calibrated confidence across criteria.";
    expect(run("unsupported-claims", context).details.join(" ")).toContain("calibrated");
  });

  it("catches an empirical-validation claim", async () => {
    const context = await contextFor("case-007");
    context.response.executive_summary.reason = "This ranking is statistically significant.";
    expect(run("unsupported-claims", context).status).toBe("fail");
  });

  it("catches a stability claim from a single repetition", async () => {
    const context = await contextFor("case-007");
    context.response.executive_summary.adaptability = "Results are stable across runs.";
    expect(run("unsupported-claims", context).details.join(" ")).toContain("single repetition");
  });

  it("catches a cross-scenario claim while the field is not_measured", async () => {
    const context = await contextFor("case-007");
    context.response.executive_summary.adaptability =
      "Cross-scenario consistency is strong for this candidate.";
    expect(run("unsupported-claims", context).details.join(" ")).toContain("not_measured");
  });

  it("does not flag the pipeline's own honest not-measured wording", async () => {
    const context = await contextFor("case-007");
    const note = context.response.adaptability_profiles[0].resilience_note;
    expect(note).toContain("has not been measured");
    expect(run("unsupported-claims", context).status).toBe("pass");
  });

  it("catches a narrative that recommends a different candidate", async () => {
    const context = await contextFor("case-007", { profile: "contradictory-explanation" });
    const result = run("unsupported-claims", context);
    expect(result.status).toBe("fail");
    expect(result.details.join(" ")).toContain("other than the ranked winner");
  });

  it("declines the name-based contradiction check when the winner's name is shared", async () => {
    const context = await contextFor("case-015");
    const result = run("unsupported-claims", context);
    expect(result.status).toBe("pass");
    expect(result.summary).toContain("display name is shared");
  });
});

describe("uncertainty-acknowledgement", () => {
  it("passes when thin-evidence candidates are flagged for human review", async () => {
    const context = await contextFor("case-008");
    expect(run("uncertainty-acknowledgement", context).status).toBe("pass");
  });

  it("catches a thin-evidence candidate that was not flagged", async () => {
    const context = await contextFor("case-008");
    for (const review of context.response.confidence_evidence_reviews) {
      review.recommend_human_review = false;
    }
    expect(run("uncertainty-acknowledgement", context).details.join(" ")).toContain("not flagged");
  });

  it("skips a case that makes no uncertainty claim", async () => {
    const context = await contextFor("case-007");
    expect(run("uncertainty-acknowledgement", context).status).toBe("skip");
  });
});

describe("scenario-coverage", () => {
  it("passes a multi-scenario case in which every scenario ran", async () => {
    const benchmarkCase = caseById.get("case-004");
    const result = await runCase({
      benchmarkCase,
      model: "fixture:test",
      createProvider: ({ scenarioIndex }) =>
        createEvalFakeProvider({ benchmarkCase, scenarioIndex }),
    });
    const grader = CASE_GRADERS.find((entry) => entry.id === "scenario-coverage");
    expect(
      grader.run({ benchmarkCase, executions: result.executions, repetitions: 1 }).status,
    ).toBe("pass");
  });

  it("catches a silently ignored scenario", async () => {
    const benchmarkCase = caseById.get("case-004");
    const result = await runCase({
      benchmarkCase,
      model: "fixture:test",
      createProvider: ({ scenarioIndex }) =>
        createEvalFakeProvider({ benchmarkCase, scenarioIndex }),
    });
    const grader = CASE_GRADERS.find((entry) => entry.id === "scenario-coverage");
    const outcome = grader.run({
      benchmarkCase,
      executions: result.executions.slice(0, 1),
      repetitions: 1,
    });
    expect(outcome.status).toBe("fail");
    expect(outcome.details.join(" ")).toContain("produced 0 execution(s)");
  });

  it("catches a response whose scenario does not match the submitted one", async () => {
    const benchmarkCase = caseById.get("case-004");
    const result = await runCase({
      benchmarkCase,
      model: "fixture:test",
      createProvider: ({ scenarioIndex }) =>
        createEvalFakeProvider({ benchmarkCase, scenarioIndex }),
    });
    const executions = structuredClone(result.executions);
    executions[0].response.decision_result.scenario = "A scenario nobody submitted.";
    const grader = CASE_GRADERS.find((entry) => entry.id === "scenario-coverage");
    expect(grader.run({ benchmarkCase, executions, repetitions: 1 }).details.join(" ")).toContain(
      "decision_result.scenario does not match",
    );
  });
});

describe("known-defect handling", () => {
  const defect = {
    defect_id: "SR-TEST-001",
    title: "A structured test defect with a scoped contract observation.",
    case_id: "case-001",
    execution_scope: { execution_id: "case-001#s1#r1", scenario_id: "scenario-2", scenario_index: 1, variant_id: null, repetition: 1 },
    expected_observations: [{
      grader_id: "contract-validity",
      signature: { kind: "schema_issue", path_pattern: "candidate_evaluations.*.risk_adjusted_score", code: "too_small", minimum: 0, subject_candidate_id: "priya-tallow" },
    }],
    summary: "A documented, pre-existing defect used only by this test suite.",
    reference: "docs/evaluation/BENCHMARK_V1.md",
  };

  it("downgrades a matching failure to expected_failure", () => {
    const results = applyKnownDefects(
      [{ grader_id: "contract-validity", severity: "required", status: "fail", summary: "broken", details: ["negative"], finding_codes: ["negative-risk-adjusted-score"], observations: [{ kind: "schema_issue", path_pattern: "candidate_evaluations.*.risk_adjusted_score", code: "too_small", minimum: 0, subject_candidate_id: "priya-tallow" }], findings: [{ kind: "schema_issue", path_pattern: "candidate_evaluations.*.risk_adjusted_score", code: "too_small", minimum: 0, subject_candidate_id: "priya-tallow", message: "negative" }] }],
      [defect],
      { execution: { execution_id: "case-001#s1#r1", scenario_index: 1, repetition: 1 }, benchmarkCase: { case_id: "case-001", variant_kind: null } },
    );
    expect(results[0].status).toBe("expected_failure");
    expect(results[0].summary).toContain("SR-TEST-001");
  });

  it("leaves unrelated graders untouched", () => {
    const results = applyKnownDefects(
      [{ grader_id: "ranking-consistency", severity: "required", status: "fail", summary: "x", details: [] }],
      [defect],
      { execution: { execution_id: "case-001#s1#r1", scenario_index: 1, repetition: 1 }, benchmarkCase: { case_id: "case-001", variant_kind: null } },
    );
    expect(results[0].status).toBe("fail");
  });

  it("stops an expected failure from gating the exit status", () => {
    const results = applyKnownDefects(
      [{ grader_id: "contract-validity", severity: "required", status: "fail", summary: "x", details: ["negative"], finding_codes: ["negative-risk-adjusted-score"], observations: [{ kind: "schema_issue", path_pattern: "candidate_evaluations.*.risk_adjusted_score", code: "too_small", minimum: 0, subject_candidate_id: "priya-tallow" }], findings: [{ kind: "schema_issue", path_pattern: "candidate_evaluations.*.risk_adjusted_score", code: "too_small", minimum: 0, subject_candidate_id: "priya-tallow", message: "negative" }] }],
      [defect],
      { execution: { execution_id: "case-001#s1#r1", scenario_index: 1, repetition: 1 }, benchmarkCase: { case_id: "case-001", variant_kind: null } },
    );
    expect(countFailures(results).required).toBe(0);
  });

  it("raises a required failure when a known defect stops reproducing", () => {
    const executions = [
      { execution_id: "case-001#s1#r1", scenario_index: 1, grader_results: [{ grader_id: "contract-validity", severity: "required", status: "pass", summary: "ok", details: [] }] },
    ];
    const resurrections = checkKnownDefectsStillReproduce(executions, [], [defect]);
    expect(resurrections).toHaveLength(1);
    expect(resurrections[0].severity).toBe("required");
    expect(resurrections[0].summary).toContain("no longer reproduces");
  });

  it("does not raise an alarm when the defect reproduces in any execution of the case", () => {
    const executions = [
      { execution_id: "case-001#s0#r1", scenario_index: 0, grader_results: [{ grader_id: "contract-validity", severity: "required", status: "pass", summary: "ok", details: [] }] },
      { execution_id: "case-001#s1#r1", scenario_index: 1, grader_results: [{ grader_id: "contract-validity", known_defect_id: "SR-TEST-001", known_defect_observation_ids: ["SR-TEST-001:case-001#s1#r1:contract-validity:0"], severity: "required", status: "expected_failure", summary: "known", details: [] }] },
    ];
    expect(checkKnownDefectsStillReproduce(executions, [], [defect])).toHaveLength(0);
  });

  it("does not suppress a different failure from the same grader", () => {
    const results = applyKnownDefects(
      [{ grader_id: "contract-validity", severity: "required", status: "fail", summary: "different schema break", details: [], finding_codes: ["different-finding"], observations: [{ kind: "schema_issue", path_pattern: "other", code: "too_small", minimum: 0, subject_candidate_id: "priya-tallow" }] }],
      [defect],
      { execution: { execution_id: "case-001#s1#r1", scenario_index: 1, repetition: 1 }, benchmarkCase: { case_id: "case-001", variant_kind: null } },
    );
    expect(results[0].status).toBe("fail");
  });

  it("does not suppress the defect outside its declared scenario", () => {
    const results = applyKnownDefects(
      [{ grader_id: "contract-validity", severity: "required", status: "fail", summary: "negative score", details: [], finding_codes: ["negative-risk-adjusted-score"], observations: [{ kind: "schema_issue", path_pattern: "candidate_evaluations.*.risk_adjusted_score", code: "too_small", minimum: 0, subject_candidate_id: "priya-tallow" }] }],
      [defect],
      { execution: { execution_id: "case-001#s0#r1", scenario_index: 0, repetition: 1 }, benchmarkCase: { case_id: "case-001", variant_kind: null } },
    );
    expect(results[0].status).toBe("fail");
  });
});

describe("grader coverage of the documented checklist", () => {
  it("implements a grader for every category Phase 3A committed to", () => {
    const ids = new Set(EXECUTION_GRADERS.concat(CASE_GRADERS).map((grader) => grader.id));
    for (const required of [
      "contract-validity",
      "candidate-coverage",
      "scenario-coverage",
      "ranking-consistency",
      "score-integrity",
      "pairing-integrity",
      "pipeline-accounting",
      "unsupported-claims",
    ]) {
      expect(ids, required).toContain(required);
    }
  });
});
