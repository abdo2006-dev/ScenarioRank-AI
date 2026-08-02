/**
 * @file Live-mode gating and budget enforcement (Phase 3A evaluation harness).
 *
 * Live mode spends real money against a real OpenAI account. Every guard below
 * exists because its absence has a plausible, expensive failure mode:
 *
 *   - `--live` is required, so no ordinary command can drift into billing.
 *   - `OPENAI_API_KEY` must be present, checked before anything is built.
 *   - CI is refused by default, so a pipeline cannot quietly spend a budget.
 *   - A budget limit is mandatory and must be a positive, finite number.
 *   - The plan (model, cases, repetitions, maximum estimated calls and cost)
 *     is printed before any request is made.
 *   - The pre-flight worst-case estimate must fit inside the budget, or the
 *     run is refused before the first call rather than stopped part-way.
 *   - Spend is re-checked between executions and the run stops *before*
 *     starting one that could exceed the limit.
 *   - Default repetitions is 1, and default case selection is nothing at all —
 *     running the whole benchmark takes a separate explicit flag.
 *   - An unpriced model is refused: a budget that cannot be computed cannot
 *     be enforced, and guessing a price would defeat the purpose.
 *
 * Nothing in this module is exercised against the real API during Phase 3A
 * implementation. Its tests drive the refusal paths and the budget arithmetic
 * with injected values, and no automated test in this repository calls OpenAI.
 */
import { estimateCostUsd, getPricingForModel } from "../../server/ai/pricing/openaiPricing.js";

/**
 * Worst-case output-token budgets per logical stage, mirroring the constants
 * in server/pipeline/runPipeline.js. Kept as a separate, clearly-labelled copy
 * because the harness must not reach into the pipeline's internals, and
 * because an estimate that silently tracked a pipeline change would stop being
 * conservative without anyone noticing.
 */
export const STAGE_OUTPUT_TOKEN_BUDGETS = Object.freeze({
  contextAnalysis: 3000,
  candidateScoringPerCandidate: 1100,
  candidateScoringOverhead: 300,
  pairingPerPair: 380,
  pairingOverhead: 200,
  decisionExplanation: 2200,
});

/**
 * Deliberately pessimistic assumptions. Under-estimating spend is the only
 * error mode that actually costs money, so both are set high.
 */
export const BUDGET_ASSUMPTIONS = Object.freeze({
  /** The production adapter can make an initial request plus one retry. */
  providerAttemptsPerRequest: 2,
  /** Batch scoring and pairing can each issue a corrective second request. */
  batchIntegrityPasses: 2,
  /** A truncation retry may raise its output cap by 1.5x. */
  truncationRetryOutputMultiplier: 1.5,
  /** Assumed prompt size per attempt; real prompts are far smaller. */
  inputTokensPerAttempt: 6000,
});

export class LiveModeRefusedError extends Error {
  constructor(message) {
    super(message);
    this.name = "LiveModeRefusedError";
  }
}

/**
 * Worst-case cost for one execution (one scenario, one repetition) of a case.
 * @param {object} benchmarkCase
 * @param {string} model
 * @returns {{ estimatedCostUsd: number|null, maxAttempts: number, outputTokens: number, inputTokens: number }}
 */
export function estimateExecutionCost(benchmarkCase, model) {
  const candidateCount = benchmarkCase.input.candidates.length;
  const pairingEnabled = benchmarkCase.deterministic_expectations.pairing_enabled;
  const pairCount = benchmarkCase.deterministic_expectations.expected_pair_count ?? 0;
  const requestOutputWorstCase = (cap) =>
    cap * (1 + BUDGET_ASSUMPTIONS.truncationRetryOutputMultiplier);
  const batchMultiplier = BUDGET_ASSUMPTIONS.batchIntegrityPasses;
  const contextOutput = requestOutputWorstCase(STAGE_OUTPUT_TOKEN_BUDGETS.contextAnalysis);
  const scoringOutput = requestOutputWorstCase(
    candidateCount * STAGE_OUTPUT_TOKEN_BUDGETS.candidateScoringPerCandidate +
      STAGE_OUTPUT_TOKEN_BUDGETS.candidateScoringOverhead,
  ) * batchMultiplier;
  const pairingOutput = pairingEnabled
    ? requestOutputWorstCase(
      pairCount * STAGE_OUTPUT_TOKEN_BUDGETS.pairingPerPair + STAGE_OUTPUT_TOKEN_BUDGETS.pairingOverhead,
    ) * batchMultiplier
    : 0;
  const decisionOutput = requestOutputWorstCase(STAGE_OUTPUT_TOKEN_BUDGETS.decisionExplanation);
  const maxAttempts =
    BUDGET_ASSUMPTIONS.providerAttemptsPerRequest *
    (1 + batchMultiplier + (pairingEnabled ? batchMultiplier : 0) + 1);
  const outputTokens = contextOutput + scoringOutput + pairingOutput + decisionOutput;
  const inputTokens = maxAttempts * BUDGET_ASSUMPTIONS.inputTokensPerAttempt;

  return {
    estimatedCostUsd: estimateCostUsd({ model, inputTokens, cachedInputTokens: 0, outputTokens }),
    maxAttempts,
    outputTokens,
    inputTokens,
  };
}

/**
 * Whole-run worst case: every selected case, every scenario, every repetition.
 * @param {object[]} selectedCases
 * @param {string} model
 * @param {number} repetitions
 */
export function estimateRunBudget(selectedCases, model, repetitions) {
  if (getPricingForModel(model) === null) {
    return {
      priced: false,
      model,
      maxEstimatedCostUsd: null,
      maxProviderAttempts: null,
      executionCount: null,
      perCase: [],
    };
  }

  let cost = 0;
  let attempts = 0;
  let executionCount = 0;
  const perCase = [];

  for (const benchmarkCase of selectedCases) {
    const executions = benchmarkCase.input.scenarios.length * repetitions;
    const estimate = estimateExecutionCost(benchmarkCase, model);
    cost += estimate.estimatedCostUsd * executions;
    attempts += estimate.maxAttempts * executions;
    executionCount += executions;
    perCase.push({
      case_id: benchmarkCase.case_id,
      executions,
      max_attempts: estimate.maxAttempts * executions,
      max_cost_usd: Number((estimate.estimatedCostUsd * executions).toFixed(6)),
    });
  }

  return {
    priced: true,
    model,
    maxEstimatedCostUsd: Number(cost.toFixed(6)),
    maxProviderAttempts: attempts,
    executionCount,
    perCase,
  };
}

/**
 * Parses and validates the budget limit from an argument or the environment.
 * @param {{ maxBudgetUsd?: string|number, env?: Record<string, string|undefined> }} options
 */
export function resolveBudgetLimit({ maxBudgetUsd, env = process.env } = {}) {
  const raw = maxBudgetUsd ?? env.EVAL_MAX_BUDGET_USD;
  if (raw === undefined || raw === null || `${raw}`.trim() === "") {
    throw new LiveModeRefusedError(
      "Live mode requires an explicit budget limit. Pass --max-budget-usd <amount> or set EVAL_MAX_BUDGET_USD.",
    );
  }
  const normalized = `${raw}`.trim();
  // Deliberately decimal-only: exponent forms and trailing junk make an
  // operator's budget review harder, and this CLI does not document them.
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    throw new LiveModeRefusedError(
      `Invalid budget limit "${raw}". Use a positive, finite number of US dollars written as a decimal.`,
    );
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new LiveModeRefusedError(
      `Invalid budget limit "${raw}". It must be a positive, finite number of US dollars.`,
    );
  }
  return parsed;
}

/**
 * Every live-mode precondition, checked before a provider is constructed or a
 * single request is made. Throws `LiveModeRefusedError` with an actionable
 * message; returns the resolved plan inputs on success.
 *
 * @param {object} options
 * @param {boolean} options.live the `--live` flag
 * @param {boolean} [options.allowCi] the `--allow-ci` escape hatch
 * @param {string[]} [options.caseIds] explicitly selected cases
 * @param {boolean} [options.allCases] the `--all-cases` flag
 * @param {number} [options.repetitions]
 * @param {string|number} [options.maxBudgetUsd]
 * @param {Record<string, string|undefined>} [options.env]
 * @param {object[]} options.benchmarkCases every case in the benchmark
 */
export function assertLiveModeAllowed({
  live,
  allowCi = false,
  caseIds = [],
  allCases = false,
  repetitions = 1,
  maxBudgetUsd,
  env = process.env,
  benchmarkCases,
}) {
  if (!live) {
    throw new LiveModeRefusedError(
      "Live mode requires the explicit --live flag. Without it, nothing is sent to OpenAI. Use `npm run eval:fixtures` for an offline run.",
    );
  }
  if (!env.OPENAI_API_KEY) {
    throw new LiveModeRefusedError(
      "Live mode requires OPENAI_API_KEY to be set. It is read from the environment and never recorded in any artifact.",
    );
  }
  // Truthiness of CI is checked as a string: CI="false" is still a CI
  // environment declaring itself, and treating it as "not CI" would be a
  // surprising place to be clever.
  const inCi = env.CI !== undefined && env.CI !== "" && env.CI !== "0" && env.CI !== "false";
  if (inCi && !allowCi) {
    throw new LiveModeRefusedError(
      "Live mode refuses to run in CI by default, because a scheduled job should not spend an API budget. Pass --allow-ci if this is genuinely intended.",
    );
  }

  const budgetUsd = resolveBudgetLimit({ maxBudgetUsd, env });

  if (!Number.isSafeInteger(repetitions) || repetitions < 1) {
    throw new LiveModeRefusedError(
      `Invalid --repetitions "${repetitions}". It must be a positive integer; the default is 1.`,
    );
  }

  if (!allCases && caseIds.length === 0) {
    throw new LiveModeRefusedError(
      "No cases selected. Live mode never defaults to the whole benchmark: pass --case <case-id> (repeatable), or --all-cases to run every case deliberately.",
    );
  }
  if (allCases && caseIds.length > 0) {
    throw new LiveModeRefusedError(
      "Pass either --case <case-id> or --all-cases, not both.",
    );
  }

  const knownIds = new Set(benchmarkCases.map((entry) => entry.case_id));
  const unknown = caseIds.filter((caseId) => !knownIds.has(caseId));
  if (unknown.length > 0) {
    throw new LiveModeRefusedError(
      `Unknown case id(s): ${unknown.join(", ")}. Run \`npm run eval:validate\` to list the benchmark's cases.`,
    );
  }

  const selectedIds = allCases ? benchmarkCases.map((entry) => entry.case_id) : caseIds;
  return { budgetUsd, selectedIds, repetitions };
}

/**
 * Checks the pre-flight worst case against the budget. An unpriced model is
 * refused outright rather than run without enforcement.
 * @param {object} estimate result of estimateRunBudget()
 * @param {number} budgetUsd
 */
export function assertBudgetCoversPlan(estimate, budgetUsd) {
  if (!estimate.priced) {
    throw new LiveModeRefusedError(
      `No recorded pricing for model "${estimate.model}", so a budget cannot be enforced. ` +
        "Add the model to server/ai/pricing/openaiPricing.js from OpenAI's own pricing page before running live.",
    );
  }
  if (!Number.isFinite(estimate.maxEstimatedCostUsd) || !Number.isSafeInteger(estimate.maxProviderAttempts)) {
    throw new LiveModeRefusedError(
      "Refusing to start: the requested plan overflows conservative budget arithmetic.",
    );
  }
  if (estimate.maxEstimatedCostUsd > budgetUsd) {
    throw new LiveModeRefusedError(
      `Refusing to start: the worst-case estimate for this plan is $${estimate.maxEstimatedCostUsd.toFixed(6)}, ` +
        `above the $${budgetUsd.toFixed(6)} budget limit. Reduce --repetitions, select fewer cases, or raise the limit deliberately.`,
    );
  }
  return true;
}

/**
 * Between-execution budget guard.
 *
 * Two things make this conservative. It compares against the *worst-case*
 * estimate for the next execution rather than the average so far, and it stops
 * before starting that execution rather than after discovering the overrun.
 * It also accounts for the pipeline's documented limitation that an attempt
 * failing before any response body reports no usage, so real spend can exceed
 * the reported total: the guard therefore never treats the reported figure as
 * an exact ledger.
 */
export function createBudgetGuard({ budgetUsd, model }) {
  let spentUsd = 0;
  let stoppedReason = null;

  return {
    get spentUsd() {
      return spentUsd;
    },
    get stoppedReason() {
      return stoppedReason;
    },
    /** @param {number|null} costUsd cost reported by a completed execution */
    record(costUsd) {
      if (typeof costUsd === "number" && Number.isFinite(costUsd)) spentUsd += costUsd;
    },
    /**
     * @param {object} benchmarkCase the case about to be executed
     * @returns {boolean} true when the next execution may proceed
     */
    canProceed(benchmarkCase) {
      if (stoppedReason) return false;
      const next = estimateExecutionCost(benchmarkCase, model);
      if (next.estimatedCostUsd === null) {
        stoppedReason = `Stopped: no recorded pricing for model "${model}", so remaining spend cannot be bounded.`;
        return false;
      }
      if (spentUsd + next.estimatedCostUsd > budgetUsd) {
        stoppedReason =
          `Stopped before executing ${benchmarkCase.case_id}: $${spentUsd.toFixed(6)} already reported as spent, and the worst case for the next execution ` +
          `($${next.estimatedCostUsd.toFixed(6)}) would exceed the $${budgetUsd.toFixed(6)} limit. Reported spend excludes attempts that failed before returning a response body, so true spend may be higher.`;
        return false;
      }
      return true;
    },
  };
}

/**
 * The plan text shown before any request is made. Returned rather than printed
 * so it can be asserted in a test without capturing stdout.
 */
export function renderLivePlan({ model, selectedIds, repetitions, estimate, budgetUsd }) {
  return [
    "Live evaluation plan — review before continuing:",
    `  model:              ${model}`,
    `  cases:              ${selectedIds.length} (${selectedIds.join(", ")})`,
    `  repetitions:        ${repetitions}`,
    `  executions:         ${estimate.executionCount ?? "unknown"}`,
    `  max provider calls: ${estimate.maxProviderAttempts ?? "unknown"} (worst case, assuming every stage uses its full retry allowance)`,
    `  max estimated cost: ${estimate.maxEstimatedCostUsd === null ? "unavailable — model is not in the pricing table" : `$${estimate.maxEstimatedCostUsd.toFixed(6)}`}`,
    `  budget limit:       $${budgetUsd.toFixed(6)}`,
    "",
    "The estimate is a worst case, not a quote. OpenAI's billing dashboard is the source of truth.",
  ].join("\n");
}
