/**
 * @file Deterministic graders (Phase 3A evaluation harness).
 *
 * A deterministic grader answers a question that is objectively true or false
 * about a pipeline response. It never scores writing quality, never judges
 * whether a recommendation was *wise*, and never stands in for the human
 * rubric. Where a check cannot be made honestly from the available data, the
 * grader returns `skip` with the reason rather than a confident pass.
 *
 * Severity:
 *   - `required` — a failure is a defect. The run fails and the CLI exits
 *     nonzero.
 *   - `advisory` — a signal worth reading. It does not gate the exit status,
 *     because the check is either heuristic or observational.
 *
 * The unsupported-claim checks in particular are deliberately conservative.
 * Keyword matching is not a reliable way to detect overclaiming, and treating
 * it as authoritative would be its own form of overclaiming. They target a
 * small set of specific, high-confidence phrases and are scoped to
 * model-authored narrative fields only, so the pipeline's own honest
 * "has not been measured" wording can never trip them.
 */
import {
  completedPipelineResponseSchema,
  pipelineStageProgressEventSchema,
  runMetadataSchema,
} from "../../shared/contracts/decisionApi.js";
import {
  computeExecutionRisk,
  computeCultureRisk,
  computeTimeRisk,
  computeAdaptabilityScore,
  computeExpectedOutcomeScore,
  computeRiskAdjustedScore,
} from "../../server/domain/scoring.js";
import { canonicalPairKey } from "../schemas/benchmarkCase.js";

/** Bumped when a grader's meaning changes, so old reports stay interpretable. */
export const GRADER_SUITE_VERSION = "1.0.0";

const EPSILON = 1e-9;

function outcome(status, summary, details = [], findingCodes = [], observations = []) {
  // Findings are the source of truth. Existing graders still supply their
  // concise detail strings, but every one is represented exactly once here.
  // A structured observation is assigned only to its corresponding detail;
  // extra details become explicit unmatched findings and cannot be suppressed.
  const findings = details.map((message, index) => ({
    ...(observations[index] ?? { kind: "detail", code: "unclassified" }),
    message,
  }));
  return {
    status,
    summary,
    finding_codes: findingCodes,
    observations,
    findings,
    details: findings.map((finding) => finding.message),
  };
}
const pass = (summary, details = [], findingCodes = [], observations = []) => outcome("pass", summary, details, findingCodes, observations);
const fail = (summary, details = [], findingCodes = [], observations = []) => outcome("fail", summary, details, findingCodes, observations);
const skip = (summary, details = [], findingCodes = [], observations = []) => outcome("skip", summary, details, findingCodes, observations);

function near(actual, expected) {
  return typeof actual === "number" && Math.abs(actual - expected) <= EPSILON;
}

/** The response field the deterministic ranking actually sorted on. */
function sortFieldForMode(decisionMode) {
  if (decisionMode === "best_fit") return "weighted_fit_score";
  if (decisionMode === "lowest_risk") return "risk_adjusted_score";
  return "expected_outcome_score";
}

/** Model-authored narrative fields only — never deterministic pipeline text. */
function modelAuthoredText(response) {
  const decision = response.decision_result;
  const summary = response.executive_summary;
  return [
    decision.key_reason,
    decision.executive_interpretation,
    decision.final_label,
    ...response.candidate_evaluations.flatMap((candidate) => [
      candidate.winner_reason ?? "",
      candidate.trade_off_note ?? "",
    ]),
    ...response.trade_offs.flatMap((tradeOff) => [tradeOff.title, tradeOff.description]),
    summary.recommendation,
    summary.reason,
    summary.trade_off,
    summary.opportunity_cost,
    summary.adaptability,
    summary.alternative,
  ].filter((text) => typeof text === "string" && text.length > 0);
}

// ===== EXECUTION-SCOPE GRADERS =====

const contractValidity = {
  id: "contract-validity",
  version: "1.0.0",
  severity: "required",
  scope: "execution",
  description: "The response and every stage event validate against the public production contract.",
  run({ response, stageSnapshots }) {
    const details = [];
    const findingCodes = [];
    const observations = [];

    const responseResult = completedPipelineResponseSchema.safeParse(response);
    if (!responseResult.success) {
      details.push(
        ...responseResult.error.issues.map(
          (issue) => `response.${issue.path.join(".") || "(root)"}: ${issue.message}`,
        ),
      );
    }

    const metadataResult = runMetadataSchema.safeParse(response.run_metadata);
    if (!metadataResult.success) {
      details.push(
        ...metadataResult.error.issues.map(
          (issue) => `run_metadata.${issue.path.join(".")}: ${issue.message}`,
        ),
      );
    }

    stageSnapshots.forEach((snapshot, index) => {
      const stageResult = pipelineStageProgressEventSchema.safeParse(snapshot);
      if (!stageResult.success) {
        details.push(
          ...stageResult.error.issues.map(
            (issue) => `stage event ${index}.${issue.path.join(".")}: ${issue.message}`,
          ),
        );
      }
    });

    // A number that serialises but is NaN/Infinity passes many schemas and
    // then poisons every downstream calculation, so it is checked explicitly.
    const malformed = [];
    const walk = (value, path) => {
      if (typeof value === "number" && !Number.isFinite(value)) {
        malformed.push(path);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item, index) => walk(item, `${path}[${index}]`));
        return;
      }
      if (value && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`);
      }
    };
    walk(response, "response");
    details.push(...malformed.map((path) => `non-finite number at ${path}`));

    for (const candidate of response.candidate_evaluations ?? []) {
      if (candidate.risk_adjusted_score < 0) {
        findingCodes.push("negative-risk-adjusted-score");
        observations.push({
          kind: "schema_issue",
          path_pattern: "candidate_evaluations.*.risk_adjusted_score",
          code: "too_small",
          minimum: 0,
          subject_candidate_id: candidate.candidate_id,
        });
      }
    }

    return details.length === 0
      ? pass("Response, run metadata, and every stage event validate against the public contract.")
      : fail(`${details.length} contract violation(s).`, details, findingCodes, observations);
  },
};

const candidateCoverage = {
  id: "candidate-coverage",
  version: "1.0.0",
  severity: "required",
  scope: "execution",
  description: "Every submitted candidate is evaluated exactly once, and no unknown candidate appears.",
  run({ benchmarkCase, response, trace }) {
    const expected = benchmarkCase.deterministic_expectations.expected_candidate_ids;
    const evaluated = response.candidate_evaluations.map((candidate) => candidate.candidate_id);
    const details = [];

    const seen = new Map();
    for (const id of evaluated) seen.set(id, (seen.get(id) ?? 0) + 1);

    for (const id of expected) {
      const count = seen.get(id) ?? 0;
      if (count === 0) details.push(`candidate "${id}" is missing from candidate_evaluations`);
      if (count > 1) details.push(`candidate "${id}" appears ${count} times`);
    }
    for (const id of seen.keys()) {
      if (!expected.includes(id)) details.push(`unknown candidate "${id}" appears in the response`);
    }

    const ranks = response.candidate_evaluations.map((candidate) => candidate.rank).sort((a, b) => a - b);
    const expectedRanks = expected.map((_, index) => index + 1);
    if (JSON.stringify(ranks) !== JSON.stringify(expectedRanks)) {
      details.push(`ranks are ${ranks.join(", ")}; expected a contiguous 1..${expected.length}`);
    }

    // Duplicate display names must stay distinguishable by ID. This is why
    // case-015 exists: names are labels, IDs are identity.
    const nameCounts = new Map();
    for (const candidate of response.candidate_evaluations) {
      nameCounts.set(candidate.candidate_name, (nameCounts.get(candidate.candidate_name) ?? 0) + 1);
    }
    for (const [name, count] of nameCounts) {
      if (count > 1) {
        const ids = response.candidate_evaluations
          .filter((candidate) => candidate.candidate_name === name)
          .map((candidate) => candidate.candidate_id);
        if (new Set(ids).size !== ids.length) {
          details.push(`display name "${name}" is shared by entries that are not distinguishable by ID`);
        }
      }
    }

    if (trace?.requestedCandidateIds) {
      const requested = [...trace.requestedCandidateIds].sort();
      if (JSON.stringify(requested) !== JSON.stringify([...expected].sort())) {
        details.push(
          `the scoring stage requested [${requested.join(", ")}] but the case submitted [${[...expected].sort().join(", ")}]`,
        );
      }
    }

    return details.length === 0
      ? pass(`All ${expected.length} candidates evaluated exactly once, with no unknown candidate.`)
      : fail(`${details.length} candidate-coverage problem(s).`, details);
  },
};

const rankingConsistency = {
  id: "ranking-consistency",
  version: "1.0.0",
  severity: "required",
  scope: "execution",
  description: "The reported winner is the highest deterministic score, and ranking order agrees with those scores.",
  run({ benchmarkCase, response }) {
    const details = [];
    const sortField = sortFieldForMode(benchmarkCase.input.decision_mode);
    const ranked = [...response.candidate_evaluations].sort((a, b) => a.rank - b.rank);
    const submissionOrder = benchmarkCase.input.candidates.map((candidate) => candidate.id);

    for (let index = 1; index < ranked.length; index += 1) {
      const previous = ranked[index - 1];
      const current = ranked[index];
      if (current[sortField] > previous[sortField] + EPSILON) {
        details.push(
          `rank ${current.rank} (${current.candidate_id}, ${sortField}=${current[sortField]}) outscores rank ${previous.rank} (${previous.candidate_id}, ${sortField}=${previous[sortField]})`,
        );
      } else if (near(current[sortField], previous[sortField])) {
        // Documented tie-break: the production ranking is a stable sort over
        // the submitted candidate array, so an exact tie keeps submission
        // order. This is observed behaviour, not a designed guarantee — see
        // docs/evaluation/BENCHMARK_V1.md, "Known limitations".
        const previousPosition = submissionOrder.indexOf(previous.candidate_id);
        const currentPosition = submissionOrder.indexOf(current.candidate_id);
        if (currentPosition < previousPosition) {
          details.push(
            `tie on ${sortField} between "${previous.candidate_id}" and "${current.candidate_id}" was not resolved by submission order`,
          );
        }
      }
    }

    const topRanked = ranked[0];
    if (response.decision_result.recommended_candidate_id !== topRanked.candidate_id) {
      details.push(
        `decision_result recommends "${response.decision_result.recommended_candidate_id}" but rank 1 is "${topRanked.candidate_id}"`,
      );
    }
    if (response.decision_result.recommended_candidate_name !== topRanked.candidate_name) {
      details.push(
        `decision_result names "${response.decision_result.recommended_candidate_name}" but rank 1 is "${topRanked.candidate_name}"`,
      );
    }

    const best = ranked.reduce(
      (bestSoFar, candidate) => (candidate[sortField] > bestSoFar[sortField] ? candidate : bestSoFar),
      ranked[0],
    );
    if (!near(best[sortField], topRanked[sortField])) {
      details.push(
        `rank 1 (${topRanked.candidate_id}) does not hold the highest ${sortField}; "${best.candidate_id}" does`,
      );
    }

    return details.length === 0
      ? pass(`Ranking agrees with deterministic ${sortField}, and the winner is rank 1.`)
      : fail(`${details.length} ranking-consistency problem(s).`, details);
  },
};

const scoreIntegrity = {
  id: "score-integrity",
  version: "1.0.0",
  severity: "required",
  scope: "execution",
  description: "Scores stay in range and every recomputable deterministic value matches a fresh recomputation.",
  run({ response }) {
    const details = [];
    const findingCodes = [];
    const observations = [];

    for (const candidate of response.candidate_evaluations) {
      const label = candidate.candidate_id;
      const scores = Object.fromEntries(
        Object.entries(candidate.criteria_scores).map(([key, value]) => [key, value.score]),
      );
      const confidences = Object.fromEntries(
        Object.entries(candidate.criteria_scores).map(([key, value]) => [key, value.confidence]),
      );

      for (const [key, criterion] of Object.entries(candidate.criteria_scores)) {
        if (criterion.score < 1 || criterion.score > 10) {
          details.push(`${label}.${key}.score=${criterion.score} is outside 1-10`);
        }
        if (criterion.confidence < 0 || criterion.confidence > 1) {
          details.push(`${label}.${key}.confidence=${criterion.confidence} is outside 0-1`);
        }
      }
      for (const field of ["weighted_fit_score", "risk_adjusted_score", "expected_outcome_score"]) {
        if (candidate[field] < 0 || candidate[field] > 100) {
          details.push(`${label}.${field}=${candidate[field]} is outside 0-100`);
          if (field === "risk_adjusted_score" && candidate[field] < 0) {
            findingCodes.push("negative-risk-adjusted-score");
            observations.push({
              kind: "score_bound_violation",
              metric: "risk_adjusted_score",
              operator: "lt",
              bound: 0,
              subject_candidate_id: label,
            });
          }
        }
      }

      // Recomputation. `weighted_fit_score` is deliberately excluded: the
      // normalised criterion weights are not part of the public response, so
      // it cannot be recomputed from the response alone. Everything derived
      // *from* it can be, and is.
      const wfs = candidate.weighted_fit_score;
      const overallConfidence = candidate.overall_confidence;
      const executionRisk = computeExecutionRisk(scores);
      const cultureRisk = computeCultureRisk(scores, confidences);
      const timeRisk = computeTimeRisk(scores, wfs);
      const confidenceRisk = Math.round((1 - overallConfidence) * 100 * 100) / 100;
      const adaptabilityScore = computeAdaptabilityScore(scores);
      const opportunityCostRisk =
        Math.round(((executionRisk + cultureRisk + timeRisk) / 3) * 100) / 100;

      const recomputed = {
        "risk_profile.execution_risk": executionRisk / 100,
        "risk_profile.culture_risk": cultureRisk / 100,
        "risk_profile.time_risk": timeRisk / 100,
        "risk_profile.confidence_risk": confidenceRisk / 100,
        "risk_profile.adaptability_risk": (100 - adaptabilityScore) / 100,
        "risk_profile.opportunity_cost_risk": opportunityCostRisk / 100,
        "outcome_model.adaptability_score": adaptabilityScore / 100,
      };
      for (const [path, expected] of Object.entries(recomputed)) {
        const [group, field] = path.split(".");
        const actual = candidate[group][field];
        if (!near(actual, expected)) {
          details.push(`${label}.${path}=${actual} but recomputation gives ${expected}`);
        }
      }

      const expectedOutcome = computeExpectedOutcomeScore({
        wfs,
        adapt: adaptabilityScore,
        exec: executionRisk,
        cult: cultureRisk,
        time: timeRisk,
        conf: overallConfidence,
      });
      if (!near(candidate.expected_outcome_score, expectedOutcome)) {
        details.push(
          `${label}.expected_outcome_score=${candidate.expected_outcome_score} but recomputation gives ${expectedOutcome}`,
        );
      }

      const riskAdjusted = computeRiskAdjustedScore({
        wfs,
        exec: executionRisk,
        cult: cultureRisk,
        time: timeRisk,
        conf: overallConfidence,
        adapt: adaptabilityScore,
        opp: opportunityCostRisk,
      });
      if (!near(candidate.risk_adjusted_score, riskAdjusted)) {
        details.push(
          `${label}.risk_adjusted_score=${candidate.risk_adjusted_score} but recomputation gives ${riskAdjusted}`,
        );
      }
    }

    return details.length === 0
      ? pass("All scores in range; every recomputable deterministic value matches a fresh recomputation.")
      : fail(`${details.length} score-integrity problem(s).`, details, [...new Set(findingCodes)], observations);
  },
};

const pairingIntegrity = {
  id: "pairing-integrity",
  version: "1.0.0",
  severity: "required",
  scope: "execution",
  description: "Pairing covers every expected pair exactly once, is canonicalised, and is never fabricated when disabled.",
  run({ benchmarkCase, response, trace }) {
    const expectations = benchmarkCase.deterministic_expectations;
    const pairing = response.pairing_result;
    const details = [];

    if (!expectations.pairing_enabled) {
      if (pairing !== undefined) {
        details.push(`pairing is disabled for this case but pairing_result is present (status "${pairing.status}")`);
      }
      return details.length === 0
        ? pass("Pairing is disabled and no pair result was fabricated.")
        : fail("A pair result appeared for a case with pairing disabled.", details);
    }

    if (pairing === undefined) {
      return fail("Pairing is enabled for this case but the response has no pairing_result.", []);
    }

    // Requested-pair coverage is checked from the provider request trace: the
    // response only exposes the top three pairs, so completeness of the
    // evaluated set cannot be read from the response alone.
    if (trace?.requestedPairKeys) {
      const requested = trace.requestedPairKeys;
      const unique = new Set(requested);
      if (unique.size !== requested.length) {
        details.push("the pairing stage requested the same unordered pair more than once");
      }
      if (unique.size !== expectations.expected_pair_count) {
        details.push(
          `the pairing stage requested ${unique.size} unique pair(s); the case expects ${expectations.expected_pair_count}`,
        );
      }
    } else {
      details.push("no pair request trace was available, so pair coverage could not be verified");
    }

    if (pairing.status !== "ok") {
      return fail(
        `Pairing reported "${pairing.status}" for a case that expects complete pair coverage.`,
        [...details, `reason: ${pairing.reason}`],
      );
    }

    const candidatesById = new Map(
      response.candidate_evaluations.map((candidate) => [candidate.candidate_id, candidate]),
    );
    const seenKeys = new Set();
    for (const pair of pairing.top_pairs) {
      const key = canonicalPairKey(pair.candidate_id_a, pair.candidate_id_b);
      if (seenKeys.has(key)) {
        details.push(`top_pairs contains a duplicate or reversed duplicate of pair ${key}`);
      }
      seenKeys.add(key);

      for (const [candidateId, displayName] of [
        [pair.candidate_id_a, pair.pair[0]],
        [pair.candidate_id_b, pair.pair[1]],
      ]) {
        const candidate = candidatesById.get(candidateId);
        if (!candidate) {
          details.push(`pair ${key} references candidate "${candidateId}", which is not in candidate_evaluations`);
        } else if (candidate.candidate_name !== displayName) {
          details.push(
            `pair ${key} labels "${candidateId}" as "${displayName}" but that ID belongs to "${candidate.candidate_name}"`,
          );
        }
      }
    }

    const bestKey = canonicalPairKey(pairing.best_pair.candidate_id_a, pairing.best_pair.candidate_id_b);
    if (!seenKeys.has(bestKey)) {
      details.push(`best_pair ${bestKey} does not appear in top_pairs`);
    }

    for (let index = 1; index < pairing.top_pairs.length; index += 1) {
      if (pairing.top_pairs[index].pair_score > pairing.top_pairs[index - 1].pair_score + EPSILON) {
        details.push("top_pairs is not ordered by descending pair_score");
      }
    }
    if (pairing.best_pair.pair_score < pairing.top_pairs[0].pair_score - EPSILON) {
      details.push("best_pair does not hold the highest pair_score in top_pairs");
    }

    if (expectations.expected_best_pair_ids) {
      const expectedKey = canonicalPairKey(...expectations.expected_best_pair_ids);
      if (bestKey !== expectedKey) {
        details.push(`best pair is ${bestKey}; the case expects ${expectedKey}`);
      }
    }

    return details.length === 0
      ? pass(`Pairing covered ${expectations.expected_pair_count} pair(s) with canonical, consistent identities.`)
      : fail(`${details.length} pairing-integrity problem(s).`, details);
  },
};

const pipelineAccounting = {
  id: "pipeline-accounting",
  version: "1.0.0",
  severity: "required",
  scope: "execution",
  description: "Logical stage count, provider attempts, and token/cost metadata are internally coherent.",
  run({ benchmarkCase, response }) {
    const expectations = benchmarkCase.deterministic_expectations;
    const metadata = response.run_metadata;
    const details = [];

    if (metadata.logicalProviderStageCount !== expectations.required_stage_count) {
      details.push(
        `logicalProviderStageCount=${metadata.logicalProviderStageCount}; this case requires ${expectations.required_stage_count} (${expectations.pairing_enabled ? "pairing enabled" : "pairing disabled"})`,
      );
    }
    if (metadata.providerAttemptCount < metadata.logicalProviderStageCount) {
      details.push(
        `providerAttemptCount=${metadata.providerAttemptCount} is below logicalProviderStageCount=${metadata.logicalProviderStageCount}; every logical stage makes at least one attempt`,
      );
    }
    if (metadata.providerAttemptCount > expectations.maximum_provider_attempts) {
      details.push(
        `providerAttemptCount=${metadata.providerAttemptCount} exceeds this case's maximum of ${expectations.maximum_provider_attempts}`,
      );
    }

    const attemptSum = Object.values(metadata.attempts).reduce((total, value) => total + value, 0);
    if (attemptSum !== metadata.providerAttemptCount) {
      details.push(
        `per-stage attempts sum to ${attemptSum} but providerAttemptCount is ${metadata.providerAttemptCount}`,
      );
    }

    if (metadata.reasoningTokens > metadata.outputTokens) {
      details.push(
        `reasoningTokens=${metadata.reasoningTokens} exceeds outputTokens=${metadata.outputTokens}; reasoning tokens are a subset of output tokens`,
      );
    }
    if (metadata.cachedInputTokens > metadata.inputTokens) {
      details.push(
        `cachedInputTokens=${metadata.cachedInputTokens} exceeds inputTokens=${metadata.inputTokens}`,
      );
    }
    if (metadata.totalTokens > 0 && metadata.totalTokens < metadata.inputTokens + metadata.outputTokens) {
      details.push(
        `totalTokens=${metadata.totalTokens} is below inputTokens+outputTokens=${metadata.inputTokens + metadata.outputTokens}`,
      );
    }
    if (metadata.estimatedCostUsd !== null && metadata.estimatedCostUsd < 0) {
      details.push(`estimatedCostUsd=${metadata.estimatedCostUsd} is negative`);
    }
    if (metadata.totalTokens === 0 && metadata.estimatedCostUsd !== null && metadata.estimatedCostUsd > 0) {
      details.push("a nonzero cost was estimated for a run that reported no tokens");
    }

    return details.length === 0
      ? pass(
          `${metadata.logicalProviderStageCount} logical stage(s), ${metadata.providerAttemptCount} provider attempt(s), coherent token accounting.`,
        )
      : fail(`${details.length} pipeline-accounting problem(s).`, details);
  },
};

const notMeasuredFields = {
  id: "not-measured-fields",
  version: "1.0.0",
  severity: "required",
  scope: "execution",
  description: "Concepts the pipeline never measures are reported as not_measured, not as a number or a claim.",
  run({ benchmarkCase, response }) {
    const details = [];
    const required = benchmarkCase.deterministic_expectations.required_not_measured_fields;

    const checks = {
      "outcome_models[].cross_scenario_consistency": () =>
        response.outcome_models.map((model, index) => [
          `outcome_models[${index}].cross_scenario_consistency`,
          model.cross_scenario_consistency,
        ]),
      "adaptability_profiles[].best_scenario": () =>
        response.adaptability_profiles.map((profile, index) => [
          `adaptability_profiles[${index}].best_scenario`,
          profile.best_scenario,
        ]),
      "adaptability_profiles[].worst_scenario": () =>
        response.adaptability_profiles.map((profile, index) => [
          `adaptability_profiles[${index}].worst_scenario`,
          profile.worst_scenario,
        ]),
    };

    for (const field of required) {
      const check = checks[field];
      if (!check) {
        details.push(`no check is implemented for required_not_measured_field "${field}"`);
        continue;
      }
      for (const [path, value] of check()) {
        if (value !== "not_measured") {
          details.push(`${path}=${JSON.stringify(value)}; expected the literal "not_measured"`);
        }
      }
    }

    for (const [index, candidate] of response.candidate_evaluations.entries()) {
      const value = candidate.outcome_model.cross_scenario_consistency;
      if (value !== "not_measured") {
        details.push(
          `candidate_evaluations[${index}].outcome_model.cross_scenario_consistency=${JSON.stringify(value)}; expected "not_measured"`,
        );
      }
    }

    return details.length === 0
      ? pass("Every unmeasured concept is reported as not_measured.")
      : fail(`${details.length} not_measured violation(s).`, details);
  },
};

const winnerExpectation = {
  id: "winner-expectation",
  version: "1.0.0",
  severity: "required",
  scope: "execution",
  description: "The winner is one the case considers defensible, and is not one it rules out.",
  run({ benchmarkCase, response }) {
    const expectations = benchmarkCase.deterministic_expectations;
    const winnerId = response.decision_result.recommended_candidate_id;
    const details = [];

    if (expectations.forbidden_winner_ids.includes(winnerId)) {
      details.push(`"${winnerId}" is listed as a forbidden winner for this case`);
    }
    if (expectations.allowed_winner_ids === null) {
      return details.length === 0
        ? skip("This case deliberately makes no winner claim; only forbidden winners are checked.")
        : fail("A forbidden winner was selected.", details);
    }
    if (!expectations.allowed_winner_ids.includes(winnerId)) {
      details.push(
        `winner "${winnerId}" is not among the allowed winners [${expectations.allowed_winner_ids.join(", ")}]`,
      );
    }

    return details.length === 0
      ? pass(`Winner "${winnerId}" is an allowed outcome for this case.`)
      : fail(`${details.length} winner-expectation problem(s).`, details);
  },
};

/**
 * Conservative, phrase-level checks for claims the system cannot support.
 * Scoped to model-authored narrative only. Each pattern targets a specific
 * overclaim seen in practice; the list is intentionally short, because a long
 * keyword list produces false positives that make the grader untrustworthy.
 */
const UNSUPPORTED_CLAIM_PATTERNS = Object.freeze([
  { id: "fairness", pattern: /\b(bias[-\s]free|unbiased|free from bias|objectively fair|proven fair|demographically neutral)\b/i, why: "asserts a fairness or bias property that was never measured" },
  { id: "validation", pattern: /\b(scientifically|empirically|statistically)\s+(validated|proven|significant)\b/i, why: "asserts empirical validation that has not been performed" },
  { id: "calibration", pattern: /\bcalibrated\s+(probability|probabilities|confidence)\b/i, why: "asserts calibrated confidence; model confidence in this system is not calibrated" },
  { id: "guarantee", pattern: /\b(guarantees?|guaranteed)\s+(the\s+)?(best|correct|optimal|right)\b/i, why: "asserts a guarantee the system cannot make" },
]);

const CROSS_SCENARIO_CLAIM_PATTERNS = Object.freeze([
  { id: "cross-scenario", pattern: /\bcross[-\s]scenario\s+(consistency|performance|results?)\s+(is|was|shows?|demonstrates?)\b/i },
  { id: "every-scenario", pattern: /\b(?:performs?|performed|ranked|scored)\s+\w*\s*(?:across|in)\s+(?:all|every)\s+scenarios?\b/i },
]);

const STABILITY_CLAIM_PATTERNS = Object.freeze([
  { id: "stability", pattern: /\b(stable|consistent|reproducible)\s+across\s+(runs|repetitions|executions)\b/i },
  { id: "variance", pattern: /\b(low|minimal|no)\s+(run[-\s]to[-\s]run\s+)?variance\b/i },
]);

const unsupportedClaims = {
  id: "unsupported-claims",
  version: "1.0.0",
  severity: "required",
  scope: "execution",
  description: "Narrative text avoids fairness, calibration, cross-scenario, and stability claims the system cannot support, and does not contradict the structured result.",
  run({ response, repetitions }) {
    const details = [];
    const texts = modelAuthoredText(response);
    const joined = texts.join("\n");

    for (const { pattern, why } of UNSUPPORTED_CLAIM_PATTERNS) {
      const match = joined.match(pattern);
      if (match) details.push(`"${match[0]}" ${why}`);
    }

    const crossScenarioUnmeasured = response.outcome_models.every(
      (model) => model.cross_scenario_consistency === "not_measured",
    );
    if (crossScenarioUnmeasured) {
      for (const { pattern } of CROSS_SCENARIO_CLAIM_PATTERNS) {
        const match = joined.match(pattern);
        if (match) {
          details.push(
            `"${match[0]}" claims observed cross-scenario behaviour while cross_scenario_consistency is "not_measured"`,
          );
        }
      }
    }

    if (repetitions < 2) {
      for (const { pattern } of STABILITY_CLAIM_PATTERNS) {
        const match = joined.match(pattern);
        if (match) {
          details.push(`"${match[0]}" claims measured stability, but this run executed a single repetition`);
        }
      }
    }

    // Narrative/structure contradiction. Name-based, so it is deliberately
    // skipped where the winner's display name is shared by another candidate:
    // in that case the text genuinely cannot distinguish them, and reporting a
    // confident pass or fail would both be wrong.
    const winner = response.candidate_evaluations.find(
      (candidate) => candidate.candidate_id === response.decision_result.recommended_candidate_id,
    );
    const winnerNameIsShared =
      response.candidate_evaluations.filter(
        (candidate) => candidate.candidate_name === winner?.candidate_name,
      ).length > 1;

    let contradictionChecked = false;
    if (winner && !winnerNameIsShared) {
      contradictionChecked = true;
      const others = response.candidate_evaluations
        .filter((candidate) => candidate.candidate_id !== winner.candidate_id)
        .map((candidate) => candidate.candidate_name)
        .filter((name) => name !== winner.candidate_name);

      const recommendationFields = {
        "decision_result.key_reason": response.decision_result.key_reason,
        "decision_result.executive_interpretation": response.decision_result.executive_interpretation,
        "executive_summary.recommendation": response.executive_summary.recommendation,
      };
      for (const [path, text] of Object.entries(recommendationFields)) {
        if (typeof text !== "string" || text.length === 0) continue;
        const namesOther = others.some((name) => text.includes(name));
        const namesWinner = text.includes(winner.candidate_name);
        if (namesOther && !namesWinner) {
          details.push(
            `${path} presents a candidate other than the ranked winner "${winner.candidate_name}" as the recommendation`,
          );
        }
      }
    }

    if (details.length > 0) {
      return fail(`${details.length} unsupported or contradictory claim(s).`, details);
    }
    const note = contradictionChecked
      ? "No unsupported claims; narrative agrees with the structured recommendation."
      : "No unsupported claims. Narrative/structure contradiction was not checked: the winner's display name is shared by another candidate.";
    return pass(note);
  },
};

const uncertaintyAcknowledgement = {
  id: "uncertainty-acknowledgement",
  version: "1.0.0",
  severity: "required",
  scope: "execution",
  description: "Candidates whose evidence the case marks as thin or conflicting are flagged for human review.",
  run({ benchmarkCase, response }) {
    const expected = benchmarkCase.deterministic_expectations.expect_human_review_for_candidate_ids;
    if (expected.length === 0) {
      return skip("This case makes no uncertainty claim, so no human-review flag is required.");
    }

    const reviewsById = new Map(
      response.confidence_evidence_reviews.map((review) => [review.candidate_id, review]),
    );
    const details = [];
    for (const candidateId of expected) {
      const review = reviewsById.get(candidateId);
      if (!review) {
        details.push(`no confidence/evidence review was produced for "${candidateId}"`);
        continue;
      }
      if (!review.recommend_human_review) {
        details.push(
          `"${candidateId}" was not flagged for human review despite thin or conflicting evidence (overall_confidence=${review.overall_confidence}, weak evidence on ${review.weak_evidence_flags.length} criteria)`,
        );
      }
    }

    return details.length === 0
      ? pass(`${expected.length} candidate(s) with thin or conflicting evidence were flagged for human review.`)
      : fail(`${details.length} uncertainty-acknowledgement problem(s).`, details);
  },
};

// ===== CASE-SCOPE GRADERS =====

const scenarioCoverage = {
  id: "scenario-coverage",
  version: "1.0.0",
  severity: "required",
  scope: "case",
  description: "Every committed scenario is executed and correctly reflected in its response; none is silently ignored.",
  run({ benchmarkCase, executions, repetitions }) {
    const scenarios = benchmarkCase.deterministic_expectations.required_scenario_coverage;
    const details = [];

    scenarios.forEach((scenario, index) => {
      const matching = executions.filter((execution) => execution.scenario_index === index);
      if (matching.length !== repetitions) {
        details.push(
          `scenario ${index} produced ${matching.length} execution(s); ${repetitions} expected for this repetition count`,
        );
      }
      for (const execution of matching) {
        if (execution.status === "skipped") {
          details.push(`scenario ${index} was not executed: ${execution.skip_reason ?? "unknown reason"}`);
          continue;
        }
        if (execution.scenario !== scenario) {
          details.push(`scenario ${index} executed with the wrong scenario text`);
        }
        if (execution.status !== "completed" || !execution.response) continue;
        if (execution.response.scenario_analysis.scenario !== scenario) {
          details.push(`scenario ${index}: scenario_analysis.scenario does not match the submitted scenario`);
        }
        if (execution.response.decision_result.scenario !== scenario) {
          details.push(`scenario ${index}: decision_result.scenario does not match the submitted scenario`);
        }
      }
    });

    const unexpected = executions.filter(
      (execution) => execution.scenario_index >= scenarios.length,
    );
    if (unexpected.length > 0) {
      details.push(`${unexpected.length} execution(s) reference a scenario index this case does not declare`);
    }

    return details.length === 0
      ? pass(`All ${scenarios.length} scenario(s) executed and correctly reflected in their responses.`)
      : fail(`${details.length} scenario-coverage problem(s).`, details);
  },
};

// ===== REGISTRY =====

export const EXECUTION_GRADERS = Object.freeze([
  contractValidity,
  candidateCoverage,
  rankingConsistency,
  scoreIntegrity,
  pairingIntegrity,
  pipelineAccounting,
  notMeasuredFields,
  winnerExpectation,
  unsupportedClaims,
  uncertaintyAcknowledgement,
]);

export const CASE_GRADERS = Object.freeze([scenarioCoverage]);

export const ALL_GRADERS = Object.freeze([...EXECUTION_GRADERS, ...CASE_GRADERS]);

/** grader_id -> grader_version, recorded in every run manifest. */
export function graderVersions() {
  return Object.fromEntries(ALL_GRADERS.map((grader) => [grader.id, grader.version]));
}

/**
 * Runs a grader list, converting an unexpected throw into an `error` result
 * rather than losing the whole run. A grader that crashes is itself a defect,
 * so `error` is treated exactly like `fail` for exit-status purposes.
 * @param {readonly object[]} graders
 * @param {object} context
 */
export function runGraders(graders, context) {
  return graders.map((grader) => {
    let outcome;
    try {
      outcome = grader.run(context);
    } catch (error) {
      outcome = {
        status: "error",
        summary: `Grader "${grader.id}" threw while evaluating this result.`,
        finding_codes: [],
        observations: [],
        findings: [{ kind: "grader_error", code: "threw", message: error.message }],
        details: [error.message],
      };
    }
    return {
      grader_id: grader.id,
      grader_version: grader.version,
      severity: grader.severity,
      status: outcome.status,
      summary: outcome.summary,
      finding_codes: outcome.finding_codes ?? [],
      observations: outcome.observations ?? [],
      findings: outcome.findings ?? (outcome.details ?? []).map((message) => ({ kind: "detail", code: "unclassified", message })),
      details: (outcome.findings ?? (outcome.details ?? []).map((message) => ({ message }))).map((finding) => finding.message),
    };
  });
}

/** A required grader that failed or errored is what makes a run fail. */
export function countFailures(graderResults) {
  let required = 0;
  let advisory = 0;
  for (const result of graderResults) {
    if (result.status !== "fail" && result.status !== "error") continue;
    if (result.severity === "required") required += 1;
    else advisory += 1;
  }
  return { required, advisory };
}

/**
 * Reclassifies a single execution's grader results against a case's documented
 * known defects.
 *
 * A failure that matches a known defect becomes `expected_failure` and stops
 * gating the exit status — the finding stays visible in every report, but a
 * documented pre-existing product defect does not hold the whole baseline red.
 *
 * This function only ever downgrades. Whether a defect has *stopped*
 * reproducing is deliberately not decided here: a defect can legitimately
 * reproduce in one scenario of a case and not another (case-006 is exactly
 * that shape), so judging it per execution would raise a false alarm on every
 * execution that happens not to trigger it. That judgment belongs to
 * `checkKnownDefectsStillReproduce`, which sees the whole case.
 *
 * @param {object[]} graderResults
 * @param {Array<{id: string, grader_id: string, summary: string, reference: string}>} knownDefects
 */
export function applyKnownDefects(graderResults, knownDefects, { execution, benchmarkCase } = {}) {
  if (!knownDefects || knownDefects.length === 0) return graderResults;

  return graderResults.map((result) => {
    if (result.status !== "fail" || !execution || !benchmarkCase) return result;
    const matches = knownDefects.flatMap((defect) => {
      const scope = defect.execution_scope;
      const scoped = defect.case_id === benchmarkCase.case_id &&
        scope.execution_id === execution.execution_id &&
        scope.scenario_id === `scenario-${execution.scenario_index + 1}` &&
        scope.scenario_index === execution.scenario_index &&
        scope.variant_id === benchmarkCase.variant_kind &&
        scope.repetition === execution.repetition;
      if (!scoped) return [];
      return defect.expected_observations
        .map((expected, index) => ({ defect, expected, index }))
        .filter(({ expected }) => expected.grader_id === result.grader_id && result.findings?.some((finding) => {
          const actual = { ...finding };
          delete actual.message;
          return JSON.stringify(actual) === JSON.stringify(expected.signature);
        }));
    });
    const actualFindings = result.findings ?? [];
    const derivedDetails = actualFindings.map((finding) => finding.message);
    // A result may be downgraded only when findings are a faithful, complete
    // source for the human details and every actual failure finding is named
    // by the scoped defect record.
    if (matches.length === 0 || matches.length !== actualFindings.length || JSON.stringify(result.details) !== JSON.stringify(derivedDetails)) return result;
    const defectIds = [...new Set(matches.map(({ defect }) => defect.defect_id))];
    if (defectIds.length !== 1) return result;
    const defect = matches[0].defect;
    return {
      ...result,
      status: "expected_failure",
      known_defect_id: defect.defect_id,
      known_defect_observation_ids: matches.map(({ expected, index }) => `${defect.defect_id}:${execution.execution_id}:${expected.grader_id}:${index}`),
      summary: `Known defect ${defect.defect_id}: ${result.summary}`,
      details: [
        ...result.details,
        `known defect ${defect.defect_id} — ${defect.summary} (see ${defect.reference})`,
      ],
      findings: [
        ...actualFindings,
        { kind: "known_defect_reference", code: defect.defect_id, message: `known defect ${defect.defect_id} — ${defect.summary} (see ${defect.reference})` },
      ],
    };
  });
}

/**
 * Case-level check that every documented known defect still reproduces
 * somewhere in the case.
 *
 * This is the half that makes the known-defect mechanism safe to use at all.
 * Without it, a `known_defects` entry would be an ordinary suppression: it
 * would keep hiding a grader long after the underlying problem was fixed, and
 * nobody would find out. Here, a defect that has stopped reproducing raises a
 * required failure demanding the record be removed.
 *
 * @param {object[]} executions
 * @param {object[]} caseGraderResults
 * @param {Array<{id: string, grader_id: string, summary: string, reference: string}>} knownDefects
 */
export function checkKnownDefectsStillReproduce(executions, caseGraderResults, knownDefects) {
  if (!knownDefects || knownDefects.length === 0) return [];

  return knownDefects.flatMap((defect) => defect.expected_observations
    .map((expected, index) => ({ defect, expected, index }))
    .filter(({ defect, expected, index }) => !executions.some((execution) =>
      execution.execution_id === defect.execution_scope.execution_id &&
      execution.grader_results.some((result) => result.known_defect_observation_ids?.includes(`${defect.defect_id}:${execution.execution_id}:${expected.grader_id}:${index}`)),
    ))
    .map(({ defect, expected }) => ({
      grader_id: `unexpected-defect-resolution:${defect.defect_id}:${expected.grader_id}`,
      grader_version: "1.0.0",
      severity: "required",
      status: "fail",
      summary: `Expected known defect ${defect.defect_id} no longer reproduces via "${expected.grader_id}" in ${defect.execution_scope.execution_id}.`,
      details: [
        `${defect.summary} (see ${defect.reference})`,
        "If this was fixed deliberately, remove the known_defects entry from this benchmark case and update the referenced documentation. A known-defect record must never outlive the defect it describes.",
      ],
      finding_codes: [],
      observations: [],
      findings: [
        { kind: "unexpected_defect_resolution", code: defect.defect_id, message: defect.summary },
        { kind: "remediation", code: "review_required", message: "If this was fixed deliberately, remove the known_defects entry from this benchmark case and update the referenced documentation. A known-defect record must never outlive the defect it describes." },
      ],
      unexpected_defect_resolution: true,
    })));
}
