/**
 * @file Benchmark runner (Phase 3A evaluation harness).
 *
 * Orchestrates a whole benchmark run: case selection, execution, grading,
 * stability accounting, permutation analysis, and summary assembly. It is
 * transport-agnostic — writing artifacts is the reporters' job, and choosing a
 * provider is the caller's job, which is what keeps fixture mode and live mode
 * on exactly the same code path.
 */
import { execFileSync } from "node:child_process";

import { EVALUATION_RUN_SCHEMA_VERSION } from "../schemas/evaluationRun.js";
import { graderVersions, GRADER_SUITE_VERSION } from "../graders/deterministicGraders.js";
import { runCase, structuredEvidenceFingerprint, explanationFingerprint } from "./runCase.js";

export { GRADER_SUITE_VERSION };

/**
 * Carried into every artifact so a report can never be read as a stronger
 * claim than it is.
 */
export const RUN_DISCLAIMER =
  "This is a development benchmark result. It is not scientifically validated, not representative of real hiring decisions, not evidence of fairness or demographic neutrality, not a legal-compliance test, not a calibrated-confidence benchmark, and not a production service-level objective. All benchmark data is synthetic.";

/**
 * Reads the current commit and branch. Returns nulls outside a git checkout
 * rather than failing the run — the harness is useful in a plain directory,
 * it just cannot say which commit produced the numbers.
 * @param {string} cwd
 */
export function readGitContext(cwd = process.cwd()) {
  const read = (args) => {
    try {
      return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
    } catch {
      return null;
    }
  };
  return { commit: read(["rev-parse", "HEAD"]), branch: read(["rev-parse", "--abbrev-ref", "HEAD"]) };
}

/**
 * Winner and ranking agreement across repetitions of the same case+scenario.
 *
 * With a single repetition this returns `assessed: false` and null agreements.
 * Reporting "100% stable" from one sample would be exactly the kind of
 * unsupported claim this phase exists to prevent.
 * @param {object[]} caseResults
 * @param {number} repetitions
 */
export function computeStability(caseResults, repetitions) {
  if (repetitions < 2) {
    return {
      assessed: false,
      reason: `Stability was not assessed: ${repetitions} repetition per case is not enough to observe run-to-run variation.`,
      winner_agreement: null,
      ranking_agreement: null,
    };
  }

  const groups = new Map();
  for (const caseResult of caseResults) {
    for (const execution of caseResult.executions) {
      if (execution.status !== "completed") continue;
      const key = `${execution.case_id}#${execution.scenario_index}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(execution.outcome);
    }
  }

  const comparable = [...groups.values()].filter((outcomes) => outcomes.length > 1);
  if (comparable.length === 0) {
    return {
      assessed: false,
      reason: "Stability was not assessed: no case+scenario produced more than one completed execution.",
      winner_agreement: null,
      ranking_agreement: null,
    };
  }

  const agreeing = (outcomes, pick) =>
    outcomes.every((outcome) => JSON.stringify(pick(outcome)) === JSON.stringify(pick(outcomes[0])));

  const winnerAgreeing = comparable.filter((outcomes) => agreeing(outcomes, (o) => o.winner_id)).length;
  const rankingAgreeing = comparable.filter((outcomes) => agreeing(outcomes, (o) => o.ranking)).length;

  return {
    assessed: true,
    reason: `Assessed across ${comparable.length} case+scenario group(s) at ${repetitions} repetitions each.`,
    winner_agreement: Number((winnerAgreeing / comparable.length).toFixed(4)),
    ranking_agreement: Number((rankingAgreeing / comparable.length).toFixed(4)),
  };
}

/**
 * Compares each variant case against the original it was derived from.
 *
 * Reported, never gated: a difference here is information, not automatically a
 * defect. Under the offline fixture a wording variant cannot differ at all
 * (the fixture ignores description text), so a green result here says nothing
 * about a real model's sensitivity to wording.
 * @param {object[]} caseResults
 */
export function analysePermutations(caseResults) {
  const byId = new Map(caseResults.map((caseResult) => [caseResult.case_id, caseResult]));
  const findings = [];

  for (const caseResult of caseResults) {
    if (!caseResult.variant_of) continue;
    const original = byId.get(caseResult.variant_of);
    if (!original) {
      findings.push({
        case_id: caseResult.case_id,
        variant_of: caseResult.variant_of,
        variant_kind: caseResult.variant_kind,
        compared: false,
        reason: "The original case was not part of this run's case selection.",
        winner_changed: null,
        ranking_changed: null,
        best_pair_changed: null,
        structured_evidence_changed: null,
        explanation_changed: null,
      });
      continue;
    }

    // Scenarios are matched by their text first, so a scenario-order variant
    // compares like with like regardless of position.
    const originalCompleted = original.executions.filter(
      (execution) => execution.status === "completed",
    );
    const originalByScenario = new Map(
      originalCompleted.map((execution) => [execution.scenario, execution]),
    );
    // Index fallback for variants whose scenario text legitimately differs
    // (a wording variant may reword the scenario too). Never applied to a
    // scenario-order variant, where position is precisely what changed and
    // matching by it would compare the wrong pairs.
    const originalByIndex = new Map(
      originalCompleted.map((execution) => [execution.scenario_index, execution]),
    );
    const matchFor = (execution) =>
      originalByScenario.get(execution.scenario) ??
      (caseResult.variant_kind === "scenario-order"
        ? undefined
        : originalByIndex.get(execution.scenario_index));

    let compared = 0;
    let winnerChanged = false;
    let rankingChanged = false;
    let pairChanged = false;
    let evidenceChanged = false;
    let explanationChanged = false;

    for (const execution of caseResult.executions) {
      if (execution.status !== "completed") continue;
      const counterpart = matchFor(execution);
      if (!counterpart) continue;
      compared += 1;

      if (execution.outcome.winner_id !== counterpart.outcome.winner_id) winnerChanged = true;
      if (JSON.stringify(execution.outcome.ranking) !== JSON.stringify(counterpart.outcome.ranking)) {
        rankingChanged = true;
      }
      if (execution.outcome.best_pair_key !== counterpart.outcome.best_pair_key) pairChanged = true;
      if (
        structuredEvidenceFingerprint(execution.response) !==
        structuredEvidenceFingerprint(counterpart.response)
      ) {
        evidenceChanged = true;
      }
      if (
        explanationFingerprint(execution.response) !== explanationFingerprint(counterpart.response)
      ) {
        explanationChanged = true;
      }
    }

    findings.push(
      compared === 0
        ? {
            case_id: caseResult.case_id,
            variant_of: caseResult.variant_of,
            variant_kind: caseResult.variant_kind,
            compared: false,
            reason: "No scenario matched between the variant and its original.",
            winner_changed: null,
            ranking_changed: null,
            best_pair_changed: null,
            structured_evidence_changed: null,
            explanation_changed: null,
          }
        : {
            case_id: caseResult.case_id,
            variant_of: caseResult.variant_of,
            variant_kind: caseResult.variant_kind,
            compared: true,
            reason: `Compared ${compared} matching scenario execution(s).`,
            winner_changed: winnerChanged,
            ranking_changed: rankingChanged,
            best_pair_changed: pairChanged,
            structured_evidence_changed: evidenceChanged,
            explanation_changed: explanationChanged,
          },
    );
  }

  return findings;
}

function aggregateGraderTotals(caseResults) {
  const totals = {};
  const record = (result) => {
    if (!totals[result.grader_id]) {
      totals[result.grader_id] = {
        pass: 0,
        fail: 0,
        skip: 0,
        error: 0,
        expected_failure: 0,
        severity: result.severity,
      };
    }
    totals[result.grader_id][result.status] += 1;
  };
  for (const caseResult of caseResults) {
    for (const execution of caseResult.executions) execution.grader_results.forEach(record);
    caseResult.grader_results.forEach(record);
  }
  return totals;
}

/**
 * Runs a benchmark end to end.
 *
 * @param {object} options
 * @param {object} options.benchmark loaded via evals/datasets/loadBenchmark.js
 * @param {string[]} options.caseIds cases to execute, in run order
 * @param {"fixtures"|"live"} options.mode
 * @param {(context: object) => object} options.createProvider provider factory
 * @param {string} options.provider provider label for the manifest
 * @param {string} options.model model label for the manifest
 * @param {number} [options.repetitions]
 * @param {string} [options.runId]
 * @param {(execution: object) => void} [options.onExecution] budget hook
 * @param {(context: object) => boolean} [options.beforeExecution] live budget gate
 * @param {(caseResult: object) => void} [options.onCase] progress hook
 */
export async function runBenchmark({
  benchmark,
  caseIds,
  mode,
  createProvider,
  provider,
  model,
  repetitions = 1,
  runId,
  onExecution,
  beforeExecution,
  onCase,
}) {
  const selected = caseIds.map((caseId) => {
    const benchmarkCase = benchmark.cases.find((entry) => entry.case_id === caseId);
    if (!benchmarkCase) {
      throw new Error(
        `Case "${caseId}" is not part of benchmark "${benchmark.manifest.benchmark_id}".`,
      );
    }
    return benchmarkCase;
  });

  const startedAt = Date.now();
  const timestamp = new Date().toISOString();
  const resolvedRunId = runId ?? `${benchmark.manifest.benchmark_id}-${mode}-${timestamp.replace(/[:.]/g, "-")}`;
  const git = readGitContext();

  const caseResults = [];
  for (const benchmarkCase of selected) {
    const caseResult = await runCase({
      benchmarkCase,
      createProvider,
      model,
      repetitions,
      beforeExecution,
      onExecution,
    });
    caseResults.push(caseResult);
    onCase?.(caseResult);
  }
  const durationMs = Date.now() - startedAt;

  const executions = caseResults.flatMap((caseResult) => caseResult.executions);
  const completed = executions.filter((execution) => execution.status === "completed");
  const sum = (pick) => completed.reduce((total, execution) => total + pick(execution.response.run_metadata), 0);

  const anyCostKnown = completed.some(
    (execution) => execution.response.run_metadata.estimatedCostUsd !== null,
  );
  const estimatedCostUsd = anyCostKnown
    ? Number(
        completed
          .reduce((total, execution) => total + (execution.response.run_metadata.estimatedCostUsd ?? 0), 0)
          .toFixed(6),
      )
    : null;

  const requiredFailures = caseResults.reduce((total, caseResult) => total + caseResult.required_failures, 0);
  const advisoryFailures = caseResults.reduce((total, caseResult) => total + caseResult.advisory_failures, 0);
  const expectedFailures = caseResults.reduce(
    (total, caseResult) =>
      total +
      [...caseResult.executions.flatMap((execution) => execution.grader_results), ...caseResult.grader_results].filter(
        (result) => result.status === "expected_failure",
      ).length,
    0,
  );
  const allGraderResults = caseResults.flatMap((caseResult) => [
    ...caseResult.executions.flatMap((execution) => execution.grader_results),
    ...caseResult.grader_results,
  ]);
  const unexpectedDefectResolutions = allGraderResults.filter(
    (result) => result.unexpected_defect_resolution,
  ).length;
  const unexpectedFailures = Math.max(0, requiredFailures - unexpectedDefectResolutions);
  const expectedResults = caseResults.flatMap((caseResult) =>
    caseResult.executions.flatMap((execution) =>
      execution.grader_results
        .filter((result) => result.status === "expected_failure")
        .map((result) => ({ execution, result })),
    ),
  );
  const affectedDefectIds = [...new Set(expectedResults.map(({ result }) => result.known_defect_id).filter(Boolean))].sort();
  const affectedExecutionIds = [...new Set(expectedResults.map(({ execution }) => execution.execution_id))].sort();
  const knownDefectObservations = expectedResults.flatMap(({ execution, result }) =>
    result.observations.map((signature) => ({
      defect_id: result.known_defect_id,
      case_id: execution.case_id,
      execution_id: execution.execution_id,
      scenario_id: `scenario-${execution.scenario_index + 1}`,
      variant_id: caseResults.find((entry) => entry.case_id === execution.case_id)?.variant_kind ?? null,
      repetition: execution.repetition,
      grader_id: result.grader_id,
      signature,
    })),
  );
  // A genuine failure is never hidden by a simultaneous XPASS/baseline
  // change. Review still receives the disappeared observation separately.
  const runState = requiredFailures > 0
    ? "unexpected_failure"
    : unexpectedDefectResolutions > 0
      ? "baseline_change_required"
      : expectedFailures > 0
        ? "pass_with_known_defects"
        : "clean_pass";

  const manifest = {
    run_id: resolvedRunId,
    schema_version: EVALUATION_RUN_SCHEMA_VERSION,
    timestamp,
    mode,
    benchmark_id: benchmark.manifest.benchmark_id,
    benchmark_version: benchmark.manifest.benchmark_version,
    benchmark_schema_version: benchmark.manifest.schema_version,
    rubric_version: benchmark.rubric.rubric_version,
    git_commit: git.commit,
    git_branch: git.branch,
    provider,
    model,
    case_selection: caseIds,
    repetitions,
    pairing_cases: selected.filter((entry) => entry.deterministic_expectations.pairing_enabled).length,
    logical_provider_stages: completed.length === 0 ? 0 : sum((meta) => meta.logicalProviderStageCount),
    provider_attempts: completed.length === 0 ? 0 : sum((meta) => meta.providerAttemptCount),
    input_tokens: completed.length === 0 ? 0 : sum((meta) => meta.inputTokens),
    output_tokens: completed.length === 0 ? 0 : sum((meta) => meta.outputTokens),
    total_tokens: completed.length === 0 ? 0 : sum((meta) => meta.totalTokens),
    estimated_cost_usd: estimatedCostUsd,
    duration_ms: durationMs,
    grader_versions: { ...graderVersions(), "grader-suite": GRADER_SUITE_VERSION },
    artifact_policy: {
      synthetic_data_only: true,
      secrets_recorded: false,
      absolute_paths_recorded: false,
    },
  };

  const summary = {
    run_id: resolvedRunId,
    schema_version: EVALUATION_RUN_SCHEMA_VERSION,
    benchmark_id: benchmark.manifest.benchmark_id,
    benchmark_version: benchmark.manifest.benchmark_version,
    mode,
    git_commit: git.commit,
    repetitions,
    case_count: caseResults.length,
    execution_count: executions.length,
    passed_cases: caseResults.filter((caseResult) => caseResult.passed).length,
    failed_cases: caseResults.filter((caseResult) => !caseResult.passed).length,
    required_failures: requiredFailures,
    advisory_failures: advisoryFailures,
    run_state: runState,
    grader_totals: aggregateGraderTotals(caseResults),
    expected_failures: expectedFailures,
    clean_pass_count: caseResults.filter((caseResult) => caseResult.passed && !caseResult.executions.some((execution) => execution.grader_results.some((result) => result.status === "expected_failure"))).length,
    affected_defect_ids: affectedDefectIds,
    affected_execution_ids: affectedExecutionIds,
    unexpected_failures: unexpectedFailures,
    unexpected_defect_resolutions: unexpectedDefectResolutions,
    known_defect_observations: knownDefectObservations,
    stability: computeStability(caseResults, repetitions),
    totals: {
      logical_provider_stages: manifest.logical_provider_stages,
      provider_attempts: manifest.provider_attempts,
      total_tokens: manifest.total_tokens,
      estimated_cost_usd: manifest.estimated_cost_usd,
      duration_ms: durationMs,
    },
    disclaimer: RUN_DISCLAIMER,
  };

  return {
    manifest,
    summary,
    caseResults,
    permutations: analysePermutations(caseResults),
    passed: requiredFailures === 0,
  };
}
