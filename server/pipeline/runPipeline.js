/**
 * @file The ScenarioRank decision pipeline
 * (docs/decisions/ADR-0004-single-openai-provider.md, request-count
 * reduction).
 *
 * Every LLM call in this file goes through the provider-neutral contract
 * (`provider.generateStructured`) — no provider SDK type appears here.
 * Exactly one `provider` instance is resolved by the caller (see
 * server/http/routes.js) and threaded through this entire module for the
 * run's lifetime.
 *
 * A normal run (up to AI_MAX_CANDIDATES candidates, pairing enabled) uses
 * at most 4 *logical* model-backed pipeline stages:
 *   1. Combined context analysis (role + scenario, one logical stage)
 *   2. Batch candidate scoring (all candidates, one logical stage)
 *   [deterministic: weighted scores, risks, ranking, adaptability, outcomes, top four]
 *   3. Batch pairing analysis (all relevant top-four pairs, one logical stage, only if enabled)
 *   4. Decision explanation (based on already-computed deterministic results)
 *
 * IMPORTANT: "4 logical stages" is not the same claim as "at most 4 OpenAI
 * API requests." Each logical stage can involve more than one real
 * OpenAI attempt — the adapter's own retry (schema-validation failure,
 * truncation, transient server error) and, for the two batch stages, a
 * batch-integrity corrective retry when the returned set of candidate/pair
 * identities doesn't exactly match what was requested. `run_metadata`
 * therefore reports two distinct counts: `logicalProviderStageCount`
 * (bounded by the fixed `MAX_LOGICAL_PROVIDER_STAGES` below — a safety net
 * against a future bug adding a 5th call site, not a request-count claim)
 * and `providerAttemptCount` (the real, aggregated number of OpenAI
 * attempts actually made, including every retry and corrective call).
 *
 * The non-negotiable boundary (docs/PROJECT_STATUS.md): LLMs interpret
 * qualitative evidence; the functions below marked "deterministic" compute
 * scores, risks, and the final ranking; LLM calls only ever explain a
 * ranking that has already been computed. See the boundary test in
 * runPipeline.test.js.
 */

import {
  computeWeightedFitScore,
  computeOverallConfidence,
  computeExecutionRisk,
  computeCultureRisk,
  computeTimeRisk,
  computeAdaptabilityScore,
  computeExpectedOutcomeScore,
  computeRiskAdjustedScore,
  computePairScore,
  applyDeltas,
} from "../domain/scoring.js";

import { contextAnalysisSchema, CONTEXT_ANALYSIS_SCHEMA_VERSION } from "../ai/schemas/contextAnalysis.schema.js";
import { buildBatchCandidateScoringSchema, BATCH_CANDIDATE_SCORING_SCHEMA_VERSION } from "../ai/schemas/batchCandidateScoring.schema.js";
import { batchPairingAnalysisSchema, BATCH_PAIRING_ANALYSIS_SCHEMA_VERSION } from "../ai/schemas/batchPairingAnalysis.schema.js";
import { decisionExplanationSchema, DECISION_EXPLANATION_SCHEMA_VERSION } from "../ai/schemas/decisionExplanation.schema.js";

import { buildContextAnalysisPrompt, promptId as contextAnalysisPromptId, promptVersion as contextAnalysisPromptVersion } from "../ai/prompts/contextAnalysis.prompt.js";
import { buildBatchCandidateScoringPrompt, promptId as batchCandidateScoringPromptId, promptVersion as batchCandidateScoringPromptVersion } from "../ai/prompts/batchCandidateScoring.prompt.js";
import { buildBatchPairingAnalysisPrompt, promptId as batchPairingAnalysisPromptId, promptVersion as batchPairingAnalysisPromptVersion } from "../ai/prompts/batchPairingAnalysis.prompt.js";
import { buildDecisionExplanationPrompt, promptId as decisionExplanationPromptId, promptVersion as decisionExplanationPromptVersion } from "../ai/prompts/decisionExplanation.prompt.js";

import { DEFAULT_AI_MAX_CANDIDATES } from "../config/env.js";
import { BatchIntegrityError, LogicalStageLimitExceededError } from "../ai/errors.js";
import { estimateCostUsd } from "../ai/pricing/openaiPricing.js";

const DEFAULT_STAGE_TIMEOUT_MS = 90000;

// Output-token budgets are justified per stage (docs/PROJECT_STATUS.md):
// context analysis is independent of candidate/pair count; batch scoring
// and batch pairing scale with the configured maximum candidate/pair
// count plus a fixed per-item overhead; decision explanation is a fixed
// narrative shape regardless of run size.
const CONTEXT_ANALYSIS_MAX_TOKENS = 3000;
const CANDIDATE_SCORING_TOKENS_PER_CANDIDATE = 1100;
const CANDIDATE_SCORING_FIXED_OVERHEAD = 300;
const PAIRING_TOKENS_PER_PAIR = 380;
const PAIRING_FIXED_OVERHEAD = 200;
const DECISION_EXPLANATION_MAX_TOKENS = 2200;

const MAX_BATCH_INTEGRITY_ATTEMPTS = 2;

// This architecture has exactly 4 logical model-backed stages by design
// (context, scoring, pairing, decision) — a fixed fact about the pipeline,
// not a tunable environment setting. See the file header for why this is
// a *logical stage* count, distinct from the real OpenAI attempt count.
const MAX_LOGICAL_PROVIDER_STAGES = 4;

// ===== LOGICAL-STAGE BUDGET (safety net, not a normal-path limiter) =====

function createStageBudget(max = MAX_LOGICAL_PROVIDER_STAGES) {
  let used = 0;
  return {
    reserve(stageLabel) {
      used += 1;
      if (used > max) {
        throw new LogicalStageLimitExceededError(
          `Pipeline attempted more than ${max} logical model-backed stages in one run (at stage "${stageLabel}"). ` +
          "This architecture never legitimately needs more than 4 — failing safely instead of spending API credit unexpectedly."
        );
      }
    },
    get used() {
      return used;
    },
  };
}

// ===== BATCH IDENTITY VALIDATION (business logic, not schema shape) =====
// Zod validates each batch item's own shape; it cannot know whether the
// *set* of candidate_ids or pair identities returned matches what was
// actually submitted. This cross-batch identity check happens here, after
// schema validation succeeds — see docs/decisions/ADR-0004-single-openai-provider.md.

/**
 * Candidate scoring must be complete: every submitted candidate must get
 * exactly one real score, or the run cannot fairly rank them. Unlike
 * pairing (below), a missing candidate result is a failure here, never
 * silently dropped or defaulted.
 * @param {Array<{candidate_id: string}>} results
 * @param {string[]} expectedIds
 * @returns {Array<object>} results reordered to match expectedIds exactly
 */
export function mapBatchResultsById(results, expectedIds) {
  const expectedSet = new Set(expectedIds);
  const seen = new Set();
  const duplicate = [];
  const unknown = [];
  const byId = new Map();

  for (const r of results) {
    if (!expectedSet.has(r.candidate_id)) { unknown.push(r.candidate_id); continue; }
    if (seen.has(r.candidate_id)) { duplicate.push(r.candidate_id); continue; }
    seen.add(r.candidate_id);
    byId.set(r.candidate_id, r);
  }
  const missing = expectedIds.filter((id) => !seen.has(id));

  if (duplicate.length || unknown.length || missing.length) {
    throw new BatchIntegrityError(
      "Batch candidate scoring did not return exactly one result per submitted candidate.",
      { missing, unknown, duplicate }
    );
  }
  return expectedIds.map((id) => byId.get(id));
}

/**
 * A successful pairing result means every expected top-four pair was
 * evaluated — a subset is never classified as a successful "best pair"
 * analysis (docs/PROJECT_STATUS.md). Missing, duplicate, unknown, and
 * reversed-duplicate pairs are all rejected, exactly like
 * `mapBatchResultsById` treats candidate scoring: complete coverage or an
 * honest failure, never a fabricated or partial "best pair" chosen from
 * incomplete data.
 * @param {Array<{candidate_id_a: string, candidate_id_b: string}>} results
 * @param {Array<[string, string]>} expectedPairs
 * @returns {Array<object>} results reordered to match expectedPairs exactly
 */
export function mapPairResultsByIdentity(results, expectedPairs) {
  const keyOf = (a, b) => [a, b].sort().join("::");
  const expectedKeys = expectedPairs.map(([a, b]) => keyOf(a, b));
  const expectedKeySet = new Set(expectedKeys);
  const seen = new Set();
  const duplicate = [];
  const unknown = [];
  const byKey = new Map();

  for (const r of results) {
    const key = keyOf(r.candidate_id_a, r.candidate_id_b);
    if (!expectedKeySet.has(key)) { unknown.push(key); continue; }
    if (seen.has(key)) { duplicate.push(key); continue; }
    seen.add(key);
    byKey.set(key, r);
  }
  const missing = expectedKeys.filter((k) => !seen.has(k));

  if (duplicate.length || unknown.length || missing.length) {
    throw new BatchIntegrityError(
      "Batch pairing analysis did not return exactly one result per expected pair.",
      { missing, unknown, duplicate }
    );
  }
  return expectedPairs.map(([a, b]) => byKey.get(keyOf(a, b)));
}

/**
 * Combines whatever OpenAI usage this attempt reported into a running
 * total. Usage is only ever available for an attempt that actually
 * returned a completed response — an attempt that fails before returning
 * any response body (e.g. an auth error) has no usage to add, and is
 * simply skipped here (see `estimatedCostUsd`'s documented limitation in
 * server/ai/pricing/openaiPricing.js).
 */
function addUsage(total, usage) {
  if (!usage) return false;
  total.inputTokens += usage.inputTokens ?? 0;
  total.cachedInputTokens += usage.cachedInputTokens ?? 0;
  total.outputTokens += usage.outputTokens ?? 0;
  total.reasoningTokens += usage.reasoningTokens ?? 0;
  total.totalTokens += usage.totalTokens ?? 0;
  return true;
}

/**
 * Calls a batch-shaped provider request, validates the returned set's
 * identity (via `validate`), and performs at most one controlled
 * corrective retry — appending a plain-language note about exactly what
 * was wrong — before giving up. This is a single *logical* pipeline stage
 * regardless of how many real OpenAI attempts it takes: both the
 * discarded first call and the corrective retry's real attempts/usage are
 * aggregated into the returned `attempts`/`usage`, never discarded, and
 * the caller reserves exactly one logical-stage slot for the whole thing
 * (see `createStageBudget`). On final failure (still incomplete after the
 * one allowed corrective retry, or the underlying call itself failed),
 * the thrown error is annotated with `attemptsConsumed`/`usageConsumed`
 * so the caller can still honestly record what was actually spent, even
 * though the stage produced no usable result.
 */
async function callBatchWithIntegrityRetry({ provider, buildRequest, schema, promptId, promptVersion, maxOutputTokens, timeoutMs, validate }) {
  let previousError;
  let totalAttempts = 0;
  const usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 };
  let sawUsage = false;

  for (let attempt = 1; attempt <= MAX_BATCH_INTEGRITY_ATTEMPTS; attempt++) {
    const { system, prompt } = buildRequest(previousError);
    let data, meta;
    try {
      ({ data, meta } = await provider.generateStructured({
        system, prompt, schema, promptId, promptVersion, maxOutputTokens, timeoutMs,
      }));
    } catch (err) {
      totalAttempts += err.attempts ?? 1;
      throw Object.assign(err, { attemptsConsumed: totalAttempts, usageConsumed: sawUsage ? { ...usage } : undefined });
    }
    totalAttempts += meta.attempts ?? 1;
    if (addUsage(usage, meta.usage)) sawUsage = true;
    try {
      const validated = validate(data.results);
      return { validated, attempts: totalAttempts, usage: sawUsage ? { ...usage } : undefined };
    } catch (err) {
      if (!(err instanceof BatchIntegrityError) || attempt === MAX_BATCH_INTEGRITY_ATTEMPTS) {
        throw Object.assign(err, { attemptsConsumed: totalAttempts, usageConsumed: sawUsage ? { ...usage } : undefined });
      }
      previousError = err;
    }
  }
}

function correctiveNoteForScoring(previousError) {
  if (!previousError) return "";
  const lines = [];
  if (previousError.missing?.length) lines.push(`- Missing results for candidate_id: ${previousError.missing.join(", ")}`);
  if (previousError.unknown?.length) lines.push(`- Unknown/invalid candidate_id in your response: ${previousError.unknown.join(", ")}`);
  if (previousError.duplicate?.length) lines.push(`- Duplicate results for candidate_id: ${previousError.duplicate.join(", ")}`);
  return `\n\nYour previous response did not include exactly one result per candidate_id listed. Fix these issues and return corrected results, nothing else:\n${lines.join("\n")}`;
}

function correctiveNoteForPairing(previousError) {
  if (!previousError) return "";
  const lines = [];
  if (previousError.missing?.length) lines.push(`- Missing results for pair(s): ${previousError.missing.join(", ")}`);
  if (previousError.unknown?.length) lines.push(`- Unknown/invalid pair in your response: ${previousError.unknown.join(", ")}`);
  if (previousError.duplicate?.length) lines.push(`- Duplicate result for pair: ${previousError.duplicate.join(", ")}`);
  return `\n\nYour previous response did not include exactly one result per pair listed — every pair must be covered. Fix these issues and return corrected results, nothing else:\n${lines.join("\n")}`;
}

// ===== LLM-BACKED STAGES =====

async function runContextAnalysis(provider, input) {
  const { system, prompt } = buildContextAnalysisPrompt(input);
  const { data, meta } = await provider.generateStructured({
    system, prompt, schema: contextAnalysisSchema,
    promptId: contextAnalysisPromptId, promptVersion: contextAnalysisPromptVersion,
    maxOutputTokens: CONTEXT_ANALYSIS_MAX_TOKENS, timeoutMs: DEFAULT_STAGE_TIMEOUT_MS,
  });

  const role = { ...data.role_analysis };
  // Guard retained from the pre-migration implementation: always the flat
  // fixed 7-key array, regardless of what the model echoed back.
  role.criteria = [
    "domain_expertise", "transformation_leadership", "operational_execution",
    "stakeholder_management", "crisis_management", "innovation_digital", "strategic_scalability",
  ];
  const total = Object.values(role.baseline_weights).reduce((a, b) => a + b, 0);
  if (Math.abs(total - 100) > 1) {
    for (const k of Object.keys(role.baseline_weights)) {
      role.baseline_weights[k] = Math.round((role.baseline_weights[k] / total) * 10000) / 100;
    }
  }

  const scenario = { ...data.scenario_analysis };
  const normalizedWeights = applyDeltas(role.baseline_weights, scenario.weight_deltas || {});
  const adjustedRaw = {};
  for (const k of Object.keys(role.baseline_weights)) {
    adjustedRaw[k] = Math.max(0, role.baseline_weights[k] + (scenario.weight_deltas?.[k] ?? 0));
  }
  scenario.adjusted_weights = adjustedRaw;
  scenario.normalized_weights = normalizedWeights;

  return { role, scenario, meta };
}

async function runBatchCandidateScoring(provider, candidates, scenario, roleTitle, maxCandidates) {
  const expectedIds = candidates.map((c) => c.id);
  const schema = buildBatchCandidateScoringSchema(maxCandidates);
  const maxOutputTokens = candidates.length * CANDIDATE_SCORING_TOKENS_PER_CANDIDATE + CANDIDATE_SCORING_FIXED_OVERHEAD;

  const { validated, attempts, usage } = await callBatchWithIntegrityRetry({
    provider,
    buildRequest: (previousError) => {
      const built = buildBatchCandidateScoringPrompt(candidates, scenario, roleTitle);
      return { system: built.system, prompt: built.prompt + correctiveNoteForScoring(previousError) };
    },
    schema, promptId: batchCandidateScoringPromptId, promptVersion: batchCandidateScoringPromptVersion,
    maxOutputTokens, timeoutMs: DEFAULT_STAGE_TIMEOUT_MS,
    validate: (results) => mapBatchResultsById(results, expectedIds),
  });

  const byId = new Map(candidates.map((c) => [c.id, c]));
  const scorings = validated.map((r) => ({ ...r, candidate_name: byId.get(r.candidate_id).name }));
  return { scorings, attempts, usage };
}

async function runDecisionExplanation(provider, rankedSummary, roleTitle, scenario, modeLabel, winnerName, pairingSummary) {
  const { system, prompt } = buildDecisionExplanationPrompt({ roleTitle, scenario, modeLabel, winnerName, rankedSummary, pairingSummary });
  return provider.generateStructured({
    system, prompt, schema: decisionExplanationSchema,
    promptId: decisionExplanationPromptId, promptVersion: decisionExplanationPromptVersion,
    maxOutputTokens: DECISION_EXPLANATION_MAX_TOKENS, timeoutMs: DEFAULT_STAGE_TIMEOUT_MS,
  });
}

async function runBatchPairingAnalysis(provider, topCandidates, scenario) {
  const pairs = [];
  for (let i = 0; i < topCandidates.length; i++) {
    for (let j = i + 1; j < topCandidates.length; j++) {
      pairs.push([topCandidates[i].scoring.candidate_id, topCandidates[j].scoring.candidate_id]);
    }
  }
  const maxOutputTokens = pairs.length * PAIRING_TOKENS_PER_PAIR + PAIRING_FIXED_OVERHEAD;
  const candidatesForPrompt = topCandidates.map((c) => ({
    id: c.scoring.candidate_id, name: c.scoring.candidate_name,
    strengths: c.scoring.strengths, strategicLabel: c.outcome.strategic_label,
  }));
  const byId = new Map(topCandidates.map((c) => [c.scoring.candidate_id, c]));

  // Never throws: a total failure to obtain complete pair coverage is a
  // legitimate, honestly-reported outcome for this optional stage, not a
  // pipeline-ending error — but the attempts/usage genuinely consumed
  // while trying are still returned so run_metadata can account for them
  // (docs/PROJECT_STATUS.md, "cost and usage visibility").
  let validated, attempts, usage;
  try {
    ({ validated, attempts, usage } = await callBatchWithIntegrityRetry({
      provider,
      buildRequest: (previousError) => {
        const built = buildBatchPairingAnalysisPrompt({ scenario, candidates: candidatesForPrompt, pairs });
        return { system: built.system, prompt: built.prompt + correctiveNoteForPairing(previousError) };
      },
      schema: batchPairingAnalysisSchema, promptId: batchPairingAnalysisPromptId, promptVersion: batchPairingAnalysisPromptVersion,
      maxOutputTokens, timeoutMs: DEFAULT_STAGE_TIMEOUT_MS,
      validate: (results) => mapPairResultsByIdentity(results, pairs),
    }));
  } catch (err) {
    console.error("Batch pairing failed:", err.message);
    return { pairResults: [], attempts: err.attemptsConsumed, usage: err.usageConsumed };
  }

  const pairResults = validated.map((r) => {
    const a = byId.get(r.candidate_id_a);
    const b = byId.get(r.candidate_id_b);
    const pairScore = computePairScore({ sc: r.scenario_coverage, comp: r.complementarity, over: r.overlap_risk, conf: r.conflict_risk, coh: r.execution_cohesion, pa: r.pair_adaptability });
    return { pair: [a.scoring.candidate_name, b.scoring.candidate_name], pair_score: pairScore / 10, ...r };
  });
  pairResults.sort((x, y) => y.pair_score - x.pair_score);
  return { pairResults, attempts, usage };
}

// ===== DETERMINISTIC STAGES =====
// (checks response confidence and evidence length, not demographic or
// legal bias — see docs/architecture/KNOWN_LIMITATIONS.md P0.3.)

export function confidenceEvidenceReview(scoring, overallConfidence) {
  const lowConf = Object.entries(scoring.criteria_scores)
    .filter(([, cs]) => cs.confidence < 0.65)
    .map(([k]) => k);

  const flags = [];
  if (overallConfidence < 0.6) {
    flags.push({ type: "low_overall_confidence", severity: "high", description: "Overall model-reported confidence is low, so this recommendation should be reviewed carefully." });
  }
  if (lowConf.length >= 3) {
    flags.push({ type: "multiple_low_confidence_criteria", severity: "medium", description: `Low model-reported confidence in multiple criteria: ${lowConf.join(", ")}.` });
  }

  const weakEvidenceFlags = Object.entries(scoring.criteria_scores)
    .filter(([, cs]) => !cs.evidence || cs.evidence.trim().length < 15)
    .map(([k]) => k);

  const recommendHumanReview = overallConfidence < 0.65 || lowConf.length >= 3 || flags.some((f) => f.severity === "high");
  const recommendRescore = weakEvidenceFlags.length >= 3;

  return {
    candidate_id: scoring.candidate_id,
    candidate_name: scoring.candidate_name,
    overall_confidence: overallConfidence,
    low_confidence_criteria: lowConf,
    confidence_evidence_flags: flags.map((f) => ({ ...f, candidate_id: scoring.candidate_id })),
    weak_evidence_flags: weakEvidenceFlags,
    recommend_human_review: recommendHumanReview,
    recommend_rescore: recommendRescore,
    review_summary: recommendHumanReview
      ? "Confidence or evidence gaps detected. Human review recommended."
      : "No major confidence or evidence-quality concerns detected.",
  };
}

export function outcomeModeling(scoring, wfs, oc) {
  const s = Object.fromEntries(Object.entries(scoring.criteria_scores).map(([k, cs]) => [k, cs.score]));
  const c = Object.fromEntries(Object.entries(scoring.criteria_scores).map(([k, cs]) => [k, cs.confidence]));

  const execRisk = computeExecutionRisk(s);
  const cultRisk = computeCultureRisk(s, c);
  const timeRisk = computeTimeRisk(s, wfs);
  const confRisk = Math.round((1 - oc) * 100 * 100) / 100;
  const adaptScore = computeAdaptabilityScore(s);
  const adaptRisk = 100 - adaptScore;
  const oppRisk = Math.round(((execRisk + cultRisk + timeRisk) / 3) * 100) / 100;
  const eos = computeExpectedOutcomeScore({ wfs, adapt: adaptScore, exec: execRisk, cult: cultRisk, time: timeRisk, conf: oc });

  const execSuccess = Math.round(Math.max(0, Math.min(1, (100 - (execRisk * 0.6 + confRisk * 0.4)) / 100)) * 100) / 100;
  const scenFit = Math.round(Math.min(1, wfs / 100) * 100) / 100;

  let likelyOutcome = "";
  let strategicLabel = "";
  if (eos >= 75 && adaptScore >= 70) {
    likelyOutcome = `${scoring.candidate_name} is likely to deliver strong results with high adaptability in this scenario.`;
    strategicLabel = "High-Upside Adaptive Leader";
  } else if (eos >= 65) {
    likelyOutcome = `${scoring.candidate_name} is likely to deliver solid results with some manageable trade-offs.`;
    strategicLabel = "Balanced Performer";
  } else if (execRisk >= 60 || cultRisk >= 60) {
    likelyOutcome = `${scoring.candidate_name} may struggle due to elevated execution or culture risk in this scenario.`;
    strategicLabel = "High-Risk Specialist";
  } else {
    likelyOutcome = `${scoring.candidate_name} is projected to deliver moderate results but may require support in weaker areas.`;
    strategicLabel = "Context-Dependent Candidate";
  }

  return {
    candidate_id: scoring.candidate_id,
    candidate_name: scoring.candidate_name,
    execution_risk: execRisk,
    culture_risk: cultRisk,
    time_risk: timeRisk,
    confidence_risk: confRisk,
    adaptability_risk: adaptRisk,
    opportunity_cost_risk: oppRisk,
    adaptability_score: adaptScore,
    // Honestly represented as unmeasured rather than a fabricated number.
    // No multi-scenario execution occurs yet — see
    // docs/architecture/KNOWN_LIMITATIONS.md P0.2.
    cross_scenario_consistency: "not_measured",
    expected_execution_success: execSuccess,
    scenario_fit: scenFit,
    expected_outcome_score: eos,
    likely_outcome: likelyOutcome,
    strategic_label: strategicLabel,
  };
}

// ===== RUN METADATA =====

function createRunMetadataTracker(provider, model) {
  const promptVersions = {};
  const schemaVersions = {};
  const attempts = {};
  const startedAt = new Date().toISOString();
  let logicalProviderStageCount = 0;
  let providerAttemptCount = 0;
  let inputTokens = 0;
  let cachedInputTokens = 0;
  let outputTokens = 0;
  let reasoningTokens = 0;
  let totalTokens = 0;

  return {
    /**
     * @param {string} stageId
     * @param {{ promptVersion?: string, schemaVersion?: string, attempts?: number, usage?: object }} fields
     *   `attempts`/`usage` are the *real, aggregated* OpenAI attempt count
     *   and token usage for this logical stage — for a batch stage that
     *   needed a corrective retry, this already includes both the
     *   discarded first call and the successful retry (see
     *   `callBatchWithIntegrityRetry`), never just the last call.
     */
    record(stageId, { promptVersion, schemaVersion, attempts: stageAttempts, usage }) {
      if (promptVersion) promptVersions[stageId] = promptVersion;
      if (schemaVersion) schemaVersions[stageId] = schemaVersion;
      logicalProviderStageCount += 1;
      if (stageAttempts !== undefined) {
        attempts[stageId] = stageAttempts;
        providerAttemptCount += stageAttempts;
      }
      if (usage) {
        inputTokens += usage.inputTokens ?? 0;
        cachedInputTokens += usage.cachedInputTokens ?? 0;
        outputTokens += usage.outputTokens ?? 0;
        reasoningTokens += usage.reasoningTokens ?? 0;
        totalTokens += usage.totalTokens ?? 0;
      }
    },
    finalize() {
      const estimatedCostUsd = estimateCostUsd({ model, inputTokens, cachedInputTokens, outputTokens });
      return {
        provider: provider.name,
        model,
        // A count of *logical* model-backed pipeline stages entered this
        // run (bounded by the fixed MAX_LOGICAL_PROVIDER_STAGES=4) — not
        // the number of real OpenAI API attempts. See providerAttemptCount
        // for that, and the file header for why these are two different
        // numbers.
        logicalProviderStageCount,
        // The real, aggregated number of OpenAI attempts actually made
        // across every logical stage — including the adapter's own
        // schema/truncation/transient retries and every batch-integrity
        // corrective call, whether or not that call's result was
        // ultimately used.
        providerAttemptCount,
        // Token/cost figures are aggregated only from attempts that
        // returned a completed response with usage data — an attempt that
        // failed before returning any response body (e.g. an auth or
        // connection error) has no usage to report and is not counted
        // here, even though provider.attempts above still counts it. This
        // is a documented limitation, not an omission — see
        // server/ai/pricing/openaiPricing.js.
        inputTokens,
        cachedInputTokens,
        outputTokens,
        reasoningTokens,
        totalTokens,
        estimatedCostUsd,
        promptVersions,
        schemaVersions,
        attempts,
        startedAt,
        completedAt: new Date().toISOString(),
      };
    },
  };
}

// ===== ORCHESTRATOR =====

/**
 * @param {import("../ai/types.js").AIProvider} provider - Resolved exactly
 *   once by the caller for this entire run. Every stage below uses this
 *   same instance; nothing in this function ever constructs another one.
 * @param {string} model - The model string associated with `provider` for
 *   this run, recorded in metadata only (the adapter already has it bound).
 * @param {object} input
 * @param {(stages: object[]) => void} [onUpdate]
 * @param {{ maxCandidates?: number }} [options]
 *   Resolved once by the caller (server.mjs, via server/config/env.js) and
 *   passed in here — this function never reads process.env itself. There
 *   is no configurable request/stage cap: this architecture has a fixed
 *   maximum of 4 logical model-backed stages (`MAX_LOGICAL_PROVIDER_STAGES`
 *   above), enforced internally as a safety net, not a tunable setting.
 */
export async function runPipeline(provider, model, input, onUpdate, options = {}) {
  const maxCandidates = options.maxCandidates ?? DEFAULT_AI_MAX_CANDIDATES;
  if (input.candidates.length > maxCandidates) {
    throw new Error(`Too many candidates: ${input.candidates.length} submitted, but at most ${maxCandidates} are supported per evaluation (AI_MAX_CANDIDATES).`);
  }

  const stageBudget = createStageBudget();
  const enablePairing = input.options?.enable_pair_simulation ?? false;
  const stages = [
    { id: "input", label: "Input Received", status: "pending" },
    { id: "context", label: "Context Analysis", status: "pending" },
    { id: "scoring", label: "Candidate Scoring", status: "pending" },
    { id: "confidence_review", label: "Confidence & Evidence Review", status: "pending" },
    { id: "outcome", label: "Outcome Modeling", status: "pending" },
    ...(enablePairing ? [{ id: "pairing", label: "Pairing Simulation", status: "pending" }] : []),
    { id: "decision", label: "Decision Generation", status: "pending" },
    { id: "complete", label: "Completed", status: "pending" },
  ];

  const update = (id, upd) => { const s = stages.find((s) => s.id === id); if (s) { Object.assign(s, upd); onUpdate?.([...stages]); } };
  const timed = async (id, fn) => {
    const t = Date.now(); update(id, { status: "running" });
    try { const r = await fn(); update(id, { status: "completed", duration_ms: Date.now() - t }); return r; }
    catch (e) { update(id, { status: "failed", duration_ms: Date.now() - t, warnings: [e.message] }); throw e; }
  };

  const runMeta = createRunMetadataTracker(provider, model);

  await timed("input", async () => { update("input", { summary: `Received ${input.candidates.length} candidates for "${input.scenario}".` }); });

  const { role, scenario } = await timed("context", async () => {
    stageBudget.reserve("context");
    const { role, scenario, meta } = await runContextAnalysis(provider, { title: input.role.title, description: input.role.description, scenario: input.scenario });
    runMeta.record("context", { promptVersion: contextAnalysisPromptVersion, schemaVersion: CONTEXT_ANALYSIS_SCHEMA_VERSION, attempts: meta.attempts, usage: meta.usage });
    const top = Object.entries(scenario.normalized_weights).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v.toFixed(1)}%`).join(", ");
    update("context", { summary: `Complexity: ${role.complexity_rating}. Top criteria after scenario adjustment: ${top}.` });
    return { role, scenario };
  });

  const normalizedWeights = scenario.normalized_weights;

  const scorings = await timed("scoring", async () => {
    update("scoring", { summary: `Scoring ${input.candidates.length} candidates…` });
    stageBudget.reserve("scoring");
    const { scorings, attempts, usage } = await runBatchCandidateScoring(provider, input.candidates, input.scenario, input.role.title, maxCandidates);
    runMeta.record("scoring", { promptVersion: batchCandidateScoringPromptVersion, schemaVersion: BATCH_CANDIDATE_SCORING_SCHEMA_VERSION, attempts, usage });
    update("scoring", { summary: `Scored ${scorings.length} candidates across 7 criteria in one batch request.` });
    return scorings;
  });

  const metrics = scorings.map((s) => {
    const sc = Object.fromEntries(Object.entries(s.criteria_scores).map(([k, cs]) => [k, cs.score]));
    const co = Object.fromEntries(Object.entries(s.criteria_scores).map(([k, cs]) => [k, cs.confidence]));
    return { scoring: s, wfs: computeWeightedFitScore(sc, normalizedWeights), oc: computeOverallConfidence(co, normalizedWeights) };
  });

  const confidenceReviews = await timed("confidence_review", async () => {
    const res = metrics.map((m) => confidenceEvidenceReview(m.scoring, m.oc));
    update("confidence_review", { summary: `${res.filter((r) => r.confidence_evidence_flags.length > 0).length} with confidence/evidence flags, ${res.filter((r) => r.recommend_human_review).length} for human review.` });
    return res;
  });

  const outcomes = await timed("outcome", async () => {
    const res = metrics.map((m) => outcomeModeling(m.scoring, m.wfs, m.oc));
    update("outcome", { summary: `Top expected outcome: ${Math.max(...res.map((r) => r.expected_outcome_score)).toFixed(1)}.` });
    return res;
  });

  // Deterministic ranking — computed before any explanation-generating LLM
  // call, and never altered by one. See the boundary test in
  // runPipeline.test.js.
  const decisionInputs = metrics.map((m, i) => ({ ...m, outcome: outcomes[i] }));
  const rankedForDecision = decisionInputs.map((c) => {
    const riskAdj = computeRiskAdjustedScore({
      wfs: c.wfs, exec: c.outcome.execution_risk, cult: c.outcome.culture_risk,
      time: c.outcome.time_risk, conf: c.oc, adapt: c.outcome.adaptability_score, opp: c.outcome.opportunity_cost_risk,
    });
    const normMode = input.decision_mode === "best_outcome" ? "best_expected_outcome" : input.decision_mode;
    const sort = normMode === "best_fit" ? c.wfs : normMode === "lowest_risk" ? riskAdj : c.outcome.expected_outcome_score;
    return { ...c, riskAdj, sort };
  }).sort((a, b) => b.sort - a.sort);

  const winner = rankedForDecision[0];
  const runnerUp = rankedForDecision[1];

  // Pairing runs before the decision explanation (docs/decisions/
  // ADR-0004-single-openai-provider.md, request-count reduction) so the
  // explanation can optionally reference an already-known pairing result.
  let pairing;
  if (enablePairing) {
    try {
      pairing = await timed("pairing", async () => {
        const top = rankedForDecision.slice(0, 4);
        stageBudget.reserve("pairing");
        // runBatchPairingAnalysis() never throws — a total failure to
        // obtain complete pair coverage is an honestly-reported outcome
        // for this optional stage, not a pipeline-ending error. Attempts
        // and usage genuinely consumed while trying are still recorded,
        // even when pairResults ends up empty.
        const { pairResults, attempts, usage } = await runBatchPairingAnalysis(provider, top, input.scenario);
        runMeta.record("pairing", { promptVersion: batchPairingAnalysisPromptVersion, schemaVersion: BATCH_PAIRING_ANALYSIS_SCHEMA_VERSION, attempts, usage });

        // No fabricated pair, score, or metrics when complete pair
        // coverage was not obtained (docs/architecture/KNOWN_LIMITATIONS.md
        // P0.5). A successful pairing result means every expected
        // top-four pair was evaluated — a subset is never classified as a
        // successful "best pair" analysis.
        if (pairResults.length === 0) {
          update("pairing", { summary: "Pairing unavailable: complete pair analysis was unavailable." });
          return { status: "unavailable", reason: "Complete pair analysis was unavailable.", best_pair: null, top_pairs: [] };
        }

        const result = { status: "ok", best_pair: pairResults[0], top_pairs: pairResults.slice(0, 3) };
        update("pairing", { summary: `Best pair: ${result.best_pair.pair[0]} + ${result.best_pair.pair[1]} (${result.best_pair.pair_score.toFixed(1)}).` });
        return result;
      });
    } catch (e) { console.error("Pairing stage failed:", e.message); }
  }

  const pairingSummary = pairing?.status === "ok"
    ? `Best pair: ${pairing.best_pair.pair[0]} + ${pairing.best_pair.pair[1]} (score ${pairing.best_pair.pair_score.toFixed(1)}/10).`
    : pairing?.status === "unavailable"
      ? "Pairing was requested but is unavailable this run."
      : undefined;

  const decision = await timed("decision", async () => {
    const modeLabel = { best_fit: "Best Fit", lowest_risk: "Risk-Adjusted Choice", best_expected_outcome: "Best Outcome", best_outcome: "Best Outcome" }[input.decision_mode] || input.decision_mode;
    const summ = rankedForDecision.slice(0, 4).map((c, i) => `Rank ${i + 1}: ${c.scoring.candidate_name} | Fit:${c.wfs} RiskAdj:${c.riskAdj} Outcome:${c.outcome.expected_outcome_score} Label:${c.outcome.strategic_label}`).join("\n");

    let llm, llmMeta;
    stageBudget.reserve("decision");
    try {
      const result = await runDecisionExplanation(provider, summ, input.role.title, input.scenario, modeLabel, winner.scoring.candidate_name, pairingSummary);
      llm = result.data; llmMeta = result.meta;
      runMeta.record("decision", { promptVersion: decisionExplanationPromptVersion, schemaVersion: DECISION_EXPLANATION_SCHEMA_VERSION, attempts: llmMeta.attempts, usage: llmMeta.usage });
    } catch {
      llm = {
        final_label: modeLabel, key_reason: `${winner.scoring.candidate_name} ranked highest.`,
        executive_interpretation: `${winner.scoring.candidate_name} is the recommended candidate.`,
        winner_reason: `Top-ranked under ${modeLabel}.`, runner_up_trade_off: "",
        trade_offs: [{ title: "Top Choice", description: `${winner.scoring.candidate_name} delivers strongest ${modeLabel} alignment.`, type: "gain", severity: "low" }],
        executive_summary: { recommendation: `${winner.scoring.candidate_name} recommended.`, reason: "Highest computed score.", trade_off: "", opportunity_cost: "", adaptability: "", alternative: runnerUp?.scoring.candidate_name || "" },
      };
    }

    if (llm.winner_reason) rankedForDecision[0].winner_reason = llm.winner_reason;
    if (llm.runner_up_trade_off && rankedForDecision[1]) rankedForDecision[1].trade_off_note = llm.runner_up_trade_off;

    const rankedOut = rankedForDecision.map((c, i) => ({
      candidate_id: c.scoring.candidate_id, candidate_name: c.scoring.candidate_name,
      rank: i + 1, weighted_fit_score: c.wfs, risk_adjusted_score: c.riskAdj,
      expected_outcome_score: c.outcome.expected_outcome_score, overall_confidence: c.oc,
      strategic_labels: [c.outcome.strategic_label],
      winner_reason: c.winner_reason, trade_off_note: c.trade_off_note,
      criteria_scores: c.scoring.criteria_scores, strengths: c.scoring.strengths, weaknesses: c.scoring.weaknesses,
      risk_profile: { execution_risk: c.outcome.execution_risk / 100, culture_risk: c.outcome.culture_risk / 100, time_risk: c.outcome.time_risk / 100, adaptability_risk: c.outcome.adaptability_risk / 100, confidence_risk: c.outcome.confidence_risk / 100, opportunity_cost_risk: c.outcome.opportunity_cost_risk / 100 },
      outcome_model: {
        expected_execution_success: c.outcome.expected_execution_success, scenario_fit: c.outcome.scenario_fit,
        adaptability_score: c.outcome.adaptability_score / 100, likely_outcome: c.outcome.likely_outcome,
        strategic_label: c.outcome.strategic_label, cross_scenario_consistency: c.outcome.cross_scenario_consistency,
      },
    }));

    update("decision", { summary: `Recommended: ${winner.scoring.candidate_name} (${llm.final_label || modeLabel}). Confidence: ${(winner.oc * 100).toFixed(0)}%.` });

    return {
      rankedFull: rankedForDecision, rankedOut,
      winner_id: winner.scoring.candidate_id, winner_name: winner.scoring.candidate_name,
      final_label: llm.final_label || modeLabel, key_reason: llm.key_reason, overall_confidence: winner.oc,
      executive_interpretation: llm.executive_interpretation, trade_offs: llm.trade_offs || [],
      // best_scenario/worst_scenario are always "not_measured" until real
      // multi-scenario execution exists (docs/architecture/KNOWN_LIMITATIONS.md
      // P0.2) — resilience_note describes adaptability only as a
      // heuristic derived from the criteria observed in this one run.
      adaptability_profiles: rankedForDecision.slice(0, 4).map((c) => ({
        candidate_name: c.scoring.candidate_name, adaptability_score: c.outcome.adaptability_score / 100,
        cross_scenario_consistency: c.outcome.cross_scenario_consistency,
        best_scenario: "not_measured", worst_scenario: "not_measured",
        resilience_note: `${c.scoring.candidate_name}'s adaptability score (${c.outcome.adaptability_score}/100) is a heuristic derived only from the criteria observed in this run. Cross-scenario resilience has not been measured.`,
      })),
      executive_summary: llm.executive_summary,
    };
  });

  await timed("complete", async () => { update("complete", { summary: `Pipeline complete. ${decision.rankedOut.length} candidates evaluated.` }); });

  return {
    request_id: `req_${Date.now()}`,
    pipeline_steps: stages,
    role_analysis: { title: input.role.title, key_requirements: role.must_have_criteria || [], complexity: role.complexity_rating },
    scenario_analysis: { scenario: input.scenario, key_pressures: scenario.key_pressures || [], weight_rationale: scenario.weight_rationale || "" },
    candidate_evaluations: decision.rankedOut,
    confidence_evidence_reviews: confidenceReviews,
    outcome_models: outcomes.map((o) => ({
      expected_execution_success: o.expected_execution_success, scenario_fit: o.scenario_fit,
      adaptability_score: o.adaptability_score / 100, likely_outcome: o.likely_outcome,
      strategic_label: o.strategic_label, cross_scenario_consistency: o.cross_scenario_consistency,
    })),
    decision_result: { recommended_candidate_id: decision.winner_id, recommended_candidate_name: decision.winner_name, decision_mode: input.decision_mode, scenario: input.scenario, final_label: decision.final_label, key_reason: decision.key_reason, overall_confidence: decision.overall_confidence, executive_interpretation: decision.executive_interpretation },
    pairing_result: pairing,
    trade_offs: decision.trade_offs || [],
    adaptability_profiles: decision.adaptability_profiles || [],
    // ScenarioRank is a fixed orchestrated pipeline — stages do not
    // independently plan, select tools, delegate work, or determine
    // control flow, so calling this a multi-agent architecture would be
    // inaccurate (docs/architecture/KNOWN_LIMITATIONS.md P1.6). A logical
    // pipeline stage does not necessarily equal one network request —
    // "Context Analysis" below covers what was previously two separate
    // stage records/requests (Role Analysis + Scenario Analysis).
    pipeline_stage_outputs: [
      { stage_name: "Role Analysis Stage", stage_role: "Defines criteria & base weights from role description (LLM, combined with Scenario Analysis in one request)", inputs: ["Role title", "Description", "Scenario"], outputs: ["7 criteria", "Base weights", "Must-haves", "Success definition"], summary: `Complexity: ${role.complexity_rating}. Success: ${role.role_success_definition}` },
      { stage_name: "Scenario Analysis Stage", stage_role: "Adjusts weights for business scenario (LLM, combined with Role Analysis in one request)", inputs: ["Base weights", `Scenario: ${input.scenario}`], outputs: ["Adjusted weights", "Normalized weights", "Key pressures"], summary: scenario.weight_rationale },
      { stage_name: "Candidate Scoring Stage", stage_role: "Scores all candidates from text in one batch request (LLM)", inputs: [`${input.candidates.length} profiles`, "7 criteria"], outputs: ["Criterion scores (1-10)", "Confidence", "Evidence"], summary: `Scored ${scorings.length} candidates in one batch request. Evidence-based, grounded in descriptions.` },
      { stage_name: "Confidence & Evidence Review", stage_role: "Reviews scoring confidence and evidence quality (deterministic) — not a demographic or legal bias audit", inputs: ["All scores", "Evidence quality"], outputs: ["Confidence/evidence flags", "Review recommendations"], summary: `${confidenceReviews.filter((b) => b.recommend_human_review).length}/${confidenceReviews.length} candidates flagged for human review.` },
      { stage_name: "Outcome Modeling Stage", stage_role: "Computes risk profiles and expected outcomes (deterministic)", inputs: ["Weighted scores", "Confidence"], outputs: ["6 risk dimensions", "Adaptability", "Expected outcome"], summary: "Risk computed: execution, culture, time, confidence, adaptability, opportunity cost." },
      { stage_name: "Decision Explanation Stage", stage_role: "Ranks candidates (deterministic) and generates explanations (LLM)", inputs: ["All evaluations", `Mode: ${input.decision_mode}`], outputs: ["Ranked list", "Explanations", "Trade-offs", "Executive summary"], summary: `${decision.winner_name} recommended. Ranking is deterministic; explanations are LLM-generated from computed metrics.` },
      ...(pairing ? [{
        stage_name: "Pairing Analysis Stage",
        stage_role: "Simulates leadership-pair compatibility among the top-ranked candidates in one batch request (LLM)",
        inputs: ["Top-ranked candidates", "Scenario"],
        outputs: ["Best pair", "Pair metrics"],
        summary: pairing.status === "ok"
          ? `Best: ${pairing.best_pair.pair[0]} + ${pairing.best_pair.pair[1]}. Score: ${pairing.best_pair.pair_score.toFixed(1)}.`
          : `Pairing unavailable: ${pairing.reason}`,
      }] : []),
    ],
    executive_summary: decision.executive_summary || { recommendation: `${decision.winner_name} recommended.`, reason: "Highest score.", trade_off: "", opportunity_cost: "", adaptability: "", alternative: "" },
    run_metadata: runMeta.finalize(),
  };
}
