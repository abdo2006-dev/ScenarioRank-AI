/**
 * @file Single-case runner (Phase 3A evaluation harness).
 *
 * Executes one benchmark case against the *real* production pipeline
 * (`server/pipeline/runPipeline.js`) — real prompts, real schemas, real
 * deterministic scoring, real batch-identity validation — and grades the
 * result.
 *
 * A case with N scenarios and R repetitions produces N*R executions. They are
 * never collapsed: keeping them separate is what makes per-scenario behaviour
 * and run-to-run stability visible at all.
 *
 * This module imports production code. Production code never imports this
 * module, and a repository-protection test enforces that direction.
 */
import { runPipeline } from "../../server/pipeline/runPipeline.js";
import { DECISION_INPUT_LIMITS } from "../../shared/contracts/decisionInputLimits.js";
import { DEFAULT_AI_MAX_CANDIDATES } from "../../server/config/env.js";
import { createObservingProvider } from "./observingProvider.js";
import {
  EXECUTION_GRADERS,
  CASE_GRADERS,
  runGraders,
  countFailures,
  applyKnownDefects,
  checkKnownDefectsStillReproduce,
} from "../graders/deterministicGraders.js";
import { canonicalPairKey } from "../schemas/benchmarkCase.js";

/**
 * The harness raises the per-run candidate cap to whatever a case actually
 * submits, still bounded by the shared technical ceiling. `AI_MAX_CANDIDATES`
 * is a deployment budget choice, not a property of the benchmark, and letting
 * a local budget setting silently drop benchmark cases would make results
 * incomparable between machines.
 * @param {object} benchmarkCase
 */
export function resolveMaxCandidatesForCase(benchmarkCase) {
  return Math.min(
    DECISION_INPUT_LIMITS.candidates.max,
    Math.max(DEFAULT_AI_MAX_CANDIDATES, benchmarkCase.input.candidates.length),
  );
}

/** Builds the production request shape for one scenario of a case. */
export function buildEvaluationRequest(benchmarkCase, scenarioIndex) {
  return {
    role: benchmarkCase.input.role,
    scenario: benchmarkCase.input.scenarios[scenarioIndex],
    decision_mode: benchmarkCase.input.decision_mode,
    candidates: benchmarkCase.input.candidates,
    options: benchmarkCase.input.options,
  };
}

/**
 * The subset of a response the comparison command diffs. Deliberately excludes
 * `request_id`, timestamps, and stage durations: those differ between any two
 * runs and would make every comparison look like a change.
 */
function extractOutcome(response, durationMs) {
  const ranked = [...response.candidate_evaluations].sort((a, b) => a.rank - b.rank);
  const pairing = response.pairing_result;
  return {
    winner_id: response.decision_result.recommended_candidate_id,
    ranking: ranked.map((candidate) => candidate.candidate_id),
    best_pair_key:
      pairing?.status === "ok"
        ? canonicalPairKey(pairing.best_pair.candidate_id_a, pairing.best_pair.candidate_id_b)
        : null,
    pairing_status: pairing ? pairing.status : "absent",
    logical_provider_stage_count: response.run_metadata.logicalProviderStageCount,
    provider_attempt_count: response.run_metadata.providerAttemptCount,
    total_tokens: response.run_metadata.totalTokens,
    estimated_cost_usd: response.run_metadata.estimatedCostUsd,
    duration_ms: durationMs,
  };
}

/**
 * Structured evidence fingerprint used by the permutation comparison. It
 * covers the parts of the result a permutation must not change — scores,
 * confidences, risk profiles — while excluding narrative text, which is
 * compared separately.
 */
export function structuredEvidenceFingerprint(response) {
  return JSON.stringify(
    [...response.candidate_evaluations]
      .sort((a, b) => a.candidate_id.localeCompare(b.candidate_id))
      .map((candidate) => ({
        id: candidate.candidate_id,
        weighted_fit_score: candidate.weighted_fit_score,
        risk_adjusted_score: candidate.risk_adjusted_score,
        expected_outcome_score: candidate.expected_outcome_score,
        overall_confidence: candidate.overall_confidence,
        criteria: Object.fromEntries(
          Object.entries(candidate.criteria_scores)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => [key, [value.score, value.confidence]]),
        ),
        risk_profile: candidate.risk_profile,
      })),
  );
}

export function explanationFingerprint(response) {
  return JSON.stringify({
    key_reason: response.decision_result.key_reason,
    executive_interpretation: response.decision_result.executive_interpretation,
    executive_summary: response.executive_summary,
    trade_offs: response.trade_offs,
  });
}

/**
 * Executes and grades one benchmark case.
 *
 * @param {object} options
 * @param {object} options.benchmarkCase validated benchmark case
 * @param {(context: { benchmarkCase: object, scenarioIndex: number, repetition: number }) => object} options.createProvider
 *   Returns a provider implementing the production contract. In fixture mode
 *   this builds an offline fake; in live mode it returns the single real
 *   provider instance the caller resolved once.
 * @param {string} options.model model label recorded in run metadata
 * @param {number} [options.repetitions]
 * @param {(context: { benchmarkCase: object, scenarioIndex: number, repetition: number }) => boolean} [options.beforeExecution]
 * @param {(execution: object) => void} [options.onExecution] called after each
 *   execution, so a live runner can enforce its budget between executions.
 * @returns {Promise<object>} a case result matching `caseResultSchema`
 */
export async function runCase({
  benchmarkCase,
  createProvider,
  model,
  repetitions = 1,
  beforeExecution,
  onExecution,
}) {
  const executions = [];
  const maxCandidates = resolveMaxCandidatesForCase(benchmarkCase);

  for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    for (let scenarioIndex = 0; scenarioIndex < benchmarkCase.input.scenarios.length; scenarioIndex += 1) {
      const scenario = benchmarkCase.input.scenarios[scenarioIndex];
      const executionId = `${benchmarkCase.case_id}#s${scenarioIndex}#r${repetition}`;
      if (beforeExecution && !beforeExecution({ benchmarkCase, scenarioIndex, repetition })) {
        const execution = {
          execution_id: executionId,
          case_id: benchmarkCase.case_id,
          scenario_index: scenarioIndex,
          scenario,
          repetition,
          status: "skipped",
          skip_reason: "Execution was not started because the live budget guard would be exceeded.",
          grader_results: [
            {
              grader_id: "execution-completion",
              grader_version: "1.0.0",
              severity: "required",
              status: "fail",
              summary: "The execution was not started.",
              finding_codes: [],
              details: ["The live budget guard stopped this execution before any provider request."],
            },
          ],
        };
        executions.push(execution);
        onExecution?.(execution);
        continue;
      }
      const stageSnapshots = [];
      const { provider, trace } = createObservingProvider(
        createProvider({ benchmarkCase, scenarioIndex, repetition }),
      );

      const startedAt = Date.now();
      let response;
      let failureReason;
      try {
        response = await runPipeline(
          provider,
          model,
          buildEvaluationRequest(benchmarkCase, scenarioIndex),
          (stages) => stageSnapshots.push(stages.map((stage) => ({ ...stage }))),
          { maxCandidates },
        );
      } catch (error) {
        // Only the safe message is kept. A stack trace can contain absolute
        // paths, and a provider error can carry payload fragments — neither
        // belongs in an artifact.
        failureReason = error.message;
      }
      const durationMs = Date.now() - startedAt;

      const execution = {
        execution_id: executionId,
        case_id: benchmarkCase.case_id,
        scenario_index: scenarioIndex,
        scenario,
        repetition,
        status: response ? "completed" : "failed",
        ...(response ? { response } : {}),
        ...(failureReason ? { failure_reason: failureReason } : {}),
        ...(response ? { outcome: extractOutcome(response, durationMs) } : {}),
        grader_results: [],
      };

      execution.grader_results = response
        ? applyKnownDefects(
            runGraders(EXECUTION_GRADERS, {
              benchmarkCase,
              execution,
              response,
              stageSnapshots,
              trace,
              repetitions,
            }),
            benchmarkCase.known_defects,
            { execution, benchmarkCase },
          )
        : [
            {
              grader_id: "execution-completion",
              grader_version: "1.0.0",
              severity: "required",
              status: "fail",
              summary: "The pipeline did not produce a completed response for this execution.",
              finding_codes: [],
              details: [failureReason ?? "unknown failure"],
            },
          ];

      executions.push(execution);
      onExecution?.(execution);
    }
  }

  const caseGraderResults = applyKnownDefects(
    runGraders(CASE_GRADERS, { benchmarkCase, executions, repetitions }),
    benchmarkCase.known_defects,
  );
  caseGraderResults.push(
    ...checkKnownDefectsStillReproduce(executions, caseGraderResults, benchmarkCase.known_defects),
  );

  const allResults = [
    ...executions.flatMap((execution) => execution.grader_results),
    ...caseGraderResults,
  ];
  const { required, advisory } = countFailures(allResults);

  return {
    case_id: benchmarkCase.case_id,
    title: benchmarkCase.title,
    tags: [...benchmarkCase.tags],
    variant_of: benchmarkCase.variant_of,
    variant_kind: benchmarkCase.variant_kind,
    executions,
    grader_results: caseGraderResults,
    required_failures: required,
    advisory_failures: advisory,
    passed: required === 0,
  };
}
