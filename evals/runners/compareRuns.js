/**
 * @file Run comparison (Phase 3A evaluation harness).
 *
 * Compares two recorded runs and returns one of four verdicts:
 * `improved | regressed | unchanged | inconclusive`.
 *
 * Three rules keep this honest:
 *
 *  1. **Invariants decide the verdict.** Required-grader failures are the only
 *     thing that can make a comparison say "improved" or "regressed". They are
 *     the only measure in the report that is objectively better or worse.
 *
 *  2. **Numeric deltas never imply significance.** Cost, tokens, and duration
 *     are reported with `significance: "not_assessed"`. Two runs cannot
 *     support a significance claim, so none is offered.
 *
 *  3. **Output changes without invariant changes are `inconclusive`, not
 *     `unchanged`.** If a candidate run picks a different winner while failing
 *     exactly as many invariants, the honest answer is that the benchmark
 *     cannot tell you which is better — not that nothing happened.
 */
import {
  comparisonReportSchema,
  numericDelta,
  EVALUATION_REPORT_SCHEMA_VERSION,
} from "../schemas/evaluationReport.js";
import { aggregateHumanReview, hasAnyScores } from "../graders/humanReview.js";

export const COMPARISON_LIMITATIONS = Object.freeze([
  "A comparison of two runs cannot establish statistical significance. Numeric differences in cost, tokens, and duration are reported as raw deltas and are explicitly not assessed for significance.",
  "Only required-grader invariants determine the improved/regressed verdict. Everything else is reported for a human to interpret.",
  "Rubric dimensions are compared only when both runs carry a completed human review with at least one real score. Two blank templates are never reported as agreement.",
  "Run-to-run stability is only comparable when both runs used more than one repetition.",
  "A changed winner is not automatically a regression: several benchmark cases have more than one legitimately defensible winner.",
]);

class IncompatibleRunsError extends Error {
  constructor(message) {
    super(message);
    this.name = "IncompatibleRunsError";
  }
}

/**
 * Refuses to compare runs of different benchmarks or benchmark versions.
 * Comparing across a benchmark version change would silently attribute a
 * benchmark edit to a pipeline change.
 */
function assertComparable(baseline, candidate) {
  if (baseline.manifest.benchmark_id !== candidate.manifest.benchmark_id) {
    throw new IncompatibleRunsError(
      `Refusing to compare different benchmarks: "${baseline.manifest.benchmark_id}" vs "${candidate.manifest.benchmark_id}".`,
    );
  }
  if (baseline.manifest.benchmark_version !== candidate.manifest.benchmark_version) {
    throw new IncompatibleRunsError(
      `Refusing to compare benchmark versions ${baseline.manifest.benchmark_version} and ${candidate.manifest.benchmark_version}. ` +
        "A benchmark version change alters what the cases mean, so the difference could not be attributed to the pipeline.",
    );
  }
  if (baseline.manifest.schema_version !== candidate.manifest.schema_version) {
    throw new IncompatibleRunsError(
      `Refusing to compare run schema versions ${baseline.manifest.schema_version} and ${candidate.manifest.schema_version}.`,
    );
  }
}

function schemaFailureCount(caseResults) {
  return caseResults.reduce(
    (total, caseResult) =>
      total +
      caseResult.executions.reduce(
        (executionTotal, execution) =>
          executionTotal +
          execution.grader_results.filter(
            (result) => result.grader_id === "contract-validity" && result.status !== "pass",
          ).length,
        0,
      ),
    0,
  );
}

function expectedFailureCount(caseResults) {
  return caseResults.reduce(
    (total, caseResult) =>
      total +
      [...caseResult.executions.flatMap((execution) => execution.grader_results ?? []), ...(caseResult.grader_results ?? [])].filter(
        (result) => result.status === "expected_failure",
      ).length,
    0,
  );
}

function observationIdentity(observation, includeSignature = true) {
  const fields = {
    defect_id: observation.defect_id,
    case_id: observation.case_id,
    execution_id: observation.execution_id,
    scenario_id: observation.scenario_id,
    variant_id: observation.variant_id,
    repetition: observation.repetition,
    grader_id: observation.grader_id,
    ...(includeSignature ? { signature: observation.signature } : {}),
  };
  return JSON.stringify(fields);
}

function compareDefectObservations(baseline, candidate) {
  const before = baseline.summary.known_defect_observations ?? [];
  const after = candidate.summary.known_defect_observations ?? [];
  const beforeKeys = new Set(before.map((entry) => observationIdentity(entry)));
  const afterKeys = new Set(after.map((entry) => observationIdentity(entry)));
  const disappeared = [...beforeKeys].filter((key) => !afterKeys.has(key));
  const appeared = [...afterKeys].filter((key) => !beforeKeys.has(key));
  const beforeScope = new Map(before.map((entry) => [observationIdentity(entry, false), observationIdentity(entry)]));
  const afterScope = new Map(after.map((entry) => [observationIdentity(entry, false), observationIdentity(entry)]));
  const changedSignature = [...beforeScope.keys()].filter((key) => afterScope.has(key) && beforeScope.get(key) !== afterScope.get(key));
  const bySignature = (entry) => JSON.stringify({ defect_id: entry.defect_id, case_id: entry.case_id, grader_id: entry.grader_id, signature: entry.signature });
  const beforePlacement = new Map(before.map((entry) => [bySignature(entry), observationIdentity(entry, false)]));
  const afterPlacement = new Map(after.map((entry) => [bySignature(entry), observationIdentity(entry, false)]));
  const moved = [...beforePlacement.keys()].filter((key) => afterPlacement.has(key) && beforePlacement.get(key) !== afterPlacement.get(key));
  return { unchanged: [...beforeKeys].filter((key) => afterKeys.has(key)), disappeared, appeared, changed_signature: changedSignature, moved };
}

/** First completed execution per case+scenario; enough to detect a change. */
function outcomesByScenario(caseResult) {
  const map = new Map();
  for (const execution of caseResult.executions) {
    if (execution.status !== "completed") continue;
    if (!map.has(execution.scenario)) map.set(execution.scenario, execution);
  }
  return map;
}

function compareCase(baselineCase, candidateCase) {
  const reasons = [];
  let winnerChanged = false;
  let rankingChanged = false;
  let pairChanged = false;
  let evidenceChanged = false;
  let explanationChanged = false;

  const baselineByScenario = outcomesByScenario(baselineCase);
  const candidateByScenario = outcomesByScenario(candidateCase);

  for (const [scenario, candidateExecution] of candidateByScenario) {
    const baselineExecution = baselineByScenario.get(scenario);
    if (!baselineExecution) {
      reasons.push("a scenario present in the candidate run has no counterpart in the baseline");
      continue;
    }
    if (candidateExecution.outcome.winner_id !== baselineExecution.outcome.winner_id) winnerChanged = true;
    if (
      JSON.stringify(candidateExecution.outcome.ranking) !==
      JSON.stringify(baselineExecution.outcome.ranking)
    ) {
      rankingChanged = true;
    }
    if (candidateExecution.outcome.best_pair_key !== baselineExecution.outcome.best_pair_key) {
      pairChanged = true;
    }
    if (
      JSON.stringify(candidateExecution.response?.candidate_evaluations ?? null) !==
      JSON.stringify(baselineExecution.response?.candidate_evaluations ?? null)
    ) {
      evidenceChanged = true;
    }
    if (
      JSON.stringify(candidateExecution.response?.executive_summary ?? null) !==
        JSON.stringify(baselineExecution.response?.executive_summary ?? null) ||
      candidateExecution.response?.decision_result.key_reason !==
        baselineExecution.response?.decision_result.key_reason
    ) {
      explanationChanged = true;
    }
  }

  const requiredDelta = numericDelta(baselineCase.required_failures, candidateCase.required_failures);
  let verdict;
  if (requiredDelta.delta !== null && requiredDelta.delta < 0) {
    verdict = "improved";
    reasons.push(`required failures fell from ${baselineCase.required_failures} to ${candidateCase.required_failures}`);
  } else if (requiredDelta.delta !== null && requiredDelta.delta > 0) {
    verdict = "regressed";
    reasons.push(`required failures rose from ${baselineCase.required_failures} to ${candidateCase.required_failures}`);
  } else if (winnerChanged || rankingChanged || pairChanged || evidenceChanged) {
    verdict = "inconclusive";
    reasons.push("the decision output changed while required invariants stayed the same; the benchmark cannot say which output is better");
  } else if (explanationChanged) {
    verdict = "inconclusive";
    reasons.push("only the explanation text changed; explanation quality is a human-review judgment, not a deterministic one");
  } else {
    verdict = "unchanged";
    reasons.push("no invariant, decision, or explanation difference was detected");
  }

  return {
    case_id: candidateCase.case_id,
    verdict,
    reasons,
    winner_changed: winnerChanged,
    ranking_changed: rankingChanged,
    best_pair_changed: pairChanged,
    structured_evidence_changed: evidenceChanged,
    explanation_changed: explanationChanged,
    required_failures: requiredDelta,
    advisory_failures: numericDelta(baselineCase.advisory_failures, candidateCase.advisory_failures),
    expected_failures: numericDelta(
      expectedFailureCount([baselineCase]),
      expectedFailureCount([candidateCase]),
    ),
    schema_failures: numericDelta(
      schemaFailureCount([baselineCase]),
      schemaFailureCount([candidateCase]),
    ),
  };
}

function compareRubric(baseline, candidate) {
  const usable = (run) => run.humanReview && hasAnyScores(run.humanReview);
  if (!usable(baseline) || !usable(candidate)) {
    const missing = [
      usable(baseline) ? null : "baseline",
      usable(candidate) ? null : "candidate",
    ].filter(Boolean);
    return {
      compared: false,
      reason: `Rubric dimensions were not compared: no completed human review with real scores for the ${missing.join(" and ")} run.`,
      dimensions: {},
    };
  }

  const baselineAggregate = aggregateHumanReview(baseline.humanReview);
  const candidateAggregate = aggregateHumanReview(candidate.humanReview);
  const dimensionIds = new Set([
    ...Object.keys(baselineAggregate.dimension_scores),
    ...Object.keys(candidateAggregate.dimension_scores),
  ]);

  return {
    compared: true,
    reason: "Both runs carry a completed human review with at least one real score. Dimension means are reported individually and are never collapsed into a single quality number.",
    dimensions: Object.fromEntries(
      [...dimensionIds].sort().map((id) => [
        id,
        numericDelta(
          baselineAggregate.dimension_scores[id]?.mean ?? undefined,
          candidateAggregate.dimension_scores[id]?.mean ?? undefined,
        ),
      ]),
    ),
  };
}

function compareStability(baseline, candidate) {
  const baselineStability = baseline.summary.stability;
  const candidateStability = candidate.summary.stability;
  if (!baselineStability.assessed || !candidateStability.assessed) {
    return {
      compared: false,
      reason: "Stability was not compared: at least one run used a single repetition, which cannot demonstrate run-to-run behaviour.",
      baseline_winner_agreement: baselineStability.winner_agreement,
      candidate_winner_agreement: candidateStability.winner_agreement,
    };
  }
  return {
    compared: true,
    reason: "Both runs assessed stability across more than one repetition. Agreement rates are reported without a significance claim.",
    baseline_winner_agreement: baselineStability.winner_agreement,
    candidate_winner_agreement: candidateStability.winner_agreement,
  };
}

/**
 * @param {object} baseline result of readRunArtifacts()
 * @param {object} candidate result of readRunArtifacts()
 * @returns {object} validated comparison report
 */
export function compareRuns(baseline, candidate) {
  assertComparable(baseline, candidate);

  const baselineById = new Map(baseline.caseResults.map((entry) => [entry.case_id, entry]));
  const shared = candidate.caseResults.filter((entry) => baselineById.has(entry.case_id));
  const onlyInCandidate = candidate.caseResults.length - shared.length;
  const onlyInBaseline = baseline.caseResults.length - shared.length;

  const cases = shared.map((candidateCase) =>
    compareCase(baselineById.get(candidateCase.case_id), candidateCase),
  );

  const invariants = {
    required_failures: numericDelta(
      baseline.summary.required_failures,
      candidate.summary.required_failures,
    ),
    advisory_failures: numericDelta(
      baseline.summary.advisory_failures,
      candidate.summary.advisory_failures,
    ),
    expected_failures: numericDelta(
      baseline.summary.expected_failures,
      candidate.summary.expected_failures,
    ),
    schema_failures: numericDelta(
      schemaFailureCount(baseline.caseResults),
      schemaFailureCount(candidate.caseResults),
    ),
    passed_cases: numericDelta(baseline.summary.passed_cases, candidate.summary.passed_cases),
  };
  const defectObservations = compareDefectObservations(baseline, candidate);

  const verdictReasons = [];
  let verdict;

  if (shared.length === 0) {
    verdict = "inconclusive";
    verdictReasons.push("the two runs share no cases, so nothing could be compared");
  } else if (invariants.required_failures.delta > 0 || defectObservations.appeared.length > 0) {
    verdict = "regressed";
    verdictReasons.push(defectObservations.appeared.length > 0
      ? `${defectObservations.appeared.length} additional exact known-defect observation(s) appeared`
      : `required-grader failures rose from ${baseline.summary.required_failures} to ${candidate.summary.required_failures}`);
  } else if (defectObservations.disappeared.length > 0 || defectObservations.changed_signature.length > 0 || defectObservations.moved.length > 0) {
    verdict = "baseline_change_required";
    verdictReasons.push("known-defect observations changed; review and deliberately update the production baseline");
  } else if (invariants.required_failures.delta < 0) {
    verdict = "improved";
    verdictReasons.push(
      `required-grader failures fell from ${baseline.summary.required_failures} to ${candidate.summary.required_failures}`,
    );
  } else if (cases.some((entry) => entry.verdict === "inconclusive")) {
    verdict = "inconclusive";
    verdictReasons.push(
      `${cases.filter((entry) => entry.verdict === "inconclusive").length} case(s) changed their output without changing any required invariant`,
    );
  } else {
    verdict = "unchanged";
    verdictReasons.push("required invariants, decisions, and explanations are identical across the two runs");
  }

  if (onlyInBaseline > 0 || onlyInCandidate > 0) {
    verdictReasons.push(
      `case selections differ: ${onlyInBaseline} case(s) only in the baseline, ${onlyInCandidate} only in the candidate; only the ${shared.length} shared case(s) were compared`,
    );
  }
  if (baseline.manifest.mode !== candidate.manifest.mode) {
    verdictReasons.push(
      `the runs used different modes (${baseline.manifest.mode} vs ${candidate.manifest.mode}); a fixture run and a live run are not directly comparable`,
    );
  }

  const report = {
    schema_version: EVALUATION_REPORT_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    baseline_run_id: baseline.manifest.run_id,
    candidate_run_id: candidate.manifest.run_id,
    benchmark_id: candidate.manifest.benchmark_id,
    benchmark_version: candidate.manifest.benchmark_version,
    verdict,
    verdict_reasons: verdictReasons,
    invariants,
    defect_observations: defectObservations,
    cost: numericDelta(baseline.manifest.estimated_cost_usd, candidate.manifest.estimated_cost_usd),
    tokens: numericDelta(baseline.manifest.total_tokens, candidate.manifest.total_tokens),
    duration_ms: numericDelta(baseline.manifest.duration_ms, candidate.manifest.duration_ms),
    rubric: compareRubric(baseline, candidate),
    stability: compareStability(baseline, candidate),
    winner_changes: cases.filter((entry) => entry.winner_changed).map((entry) => entry.case_id),
    ranking_changes: cases.filter((entry) => entry.ranking_changed).map((entry) => entry.case_id),
    pair_changes: cases.filter((entry) => entry.best_pair_changed).map((entry) => entry.case_id),
    cases,
    limitations: [...COMPARISON_LIMITATIONS],
  };

  return comparisonReportSchema.parse(report);
}

export { IncompatibleRunsError };
