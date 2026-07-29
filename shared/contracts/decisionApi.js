/**
 * Public ScenarioRank HTTP and SSE contracts.
 *
 * These schemas describe data that crosses the browser/server boundary.
 * They deliberately do not describe provider prompt output; that remains in
 * server/ai/schemas where it is validated before deterministic computation.
 */
import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const finiteNumber = z.number().finite();
const unitInterval = finiteNumber.min(0).max(1);
const percentage = finiteNumber.min(0).max(100);
const criterionScore = finiteNumber.min(1).max(10);

export const safeErrorSchema = z.object({ error: nonEmptyString, message: nonEmptyString.optional() }).strict();
export const sseErrorEventSchema = z.object({ message: nonEmptyString }).strict();

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  ai_enabled: z.boolean(),
  ai_provider: z.string().nullable(),
  ai_model: z.string().nullable(),
}).strict();

export const scenarioGenerationRequestSchema = z.object({
  title: nonEmptyString,
  description: nonEmptyString,
}).strict();

export const scenarioGenerationResponseSchema = z.object({
  scenarios: z.array(nonEmptyString).min(1).max(5),
  source: z.enum(["ai", "fallback"]),
  note: z.string().optional(),
}).strict();

export const candidateInputSchema = z.object({
  id: nonEmptyString,
  name: nonEmptyString,
  description: nonEmptyString,
}).strict();

export const evaluationRequestSchema = z.object({
  role: z.object({ title: nonEmptyString, description: nonEmptyString }).strict(),
  scenario: nonEmptyString,
  decision_mode: z.enum(["best_fit", "lowest_risk", "best_outcome"]),
  candidates: z.array(candidateInputSchema).min(2).superRefine((candidates, context) => {
    const ids = new Set();
    candidates.forEach((candidate, index) => {
      if (ids.has(candidate.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: [index, "id"], message: "Candidate IDs must be unique." });
      ids.add(candidate.id);
    });
  }),
  options: z.object({ enable_pair_simulation: z.boolean() }).strict(),
}).strict();

export const pipelineStageSchema = z.object({
  id: nonEmptyString,
  label: nonEmptyString,
  status: z.enum(["pending", "running", "completed", "failed"]),
  summary: z.string().optional(),
  warnings: z.array(z.string()).optional(),
  duration_ms: finiteNumber.optional(),
}).strict();
export const pipelineStageProgressEventSchema = z.array(pipelineStageSchema);

const criterionScoreSchema = z.object({ score: criterionScore, confidence: unitInterval, evidence: z.string(), reasoning: z.string() }).strict();
const riskProfileSchema = z.object({
  execution_risk: unitInterval, culture_risk: unitInterval, time_risk: unitInterval,
  adaptability_risk: unitInterval, confidence_risk: unitInterval, opportunity_cost_risk: unitInterval,
}).strict();
const outcomeModelSchema = z.object({
  expected_execution_success: unitInterval, scenario_fit: unitInterval, adaptability_score: unitInterval,
  likely_outcome: z.string(), strategic_label: z.string(),
  cross_scenario_consistency: z.union([z.literal("not_measured"), z.null()]).optional(),
}).strict();
export const candidateEvaluationSchema = z.object({
  candidate_id: nonEmptyString, candidate_name: nonEmptyString, rank: z.number().int().positive(),
  weighted_fit_score: percentage, risk_adjusted_score: percentage, expected_outcome_score: percentage,
  overall_confidence: unitInterval, strategic_labels: z.array(z.string()), winner_reason: z.string().optional(),
  trade_off_note: z.string().optional(), criteria_scores: z.record(criterionScoreSchema),
  strengths: z.array(z.string()), weaknesses: z.array(z.string()), risk_profile: riskProfileSchema,
  outcome_model: outcomeModelSchema,
}).strict();
export const confidenceEvidenceReviewSchema = z.object({
  candidate_id: nonEmptyString, candidate_name: nonEmptyString, overall_confidence: unitInterval,
  low_confidence_criteria: z.array(z.string()),
  confidence_evidence_flags: z.array(z.object({ type: nonEmptyString, severity: z.string(), description: z.string(), candidate_id: nonEmptyString }).strict()),
  weak_evidence_flags: z.array(z.string()), recommend_human_review: z.boolean(), recommend_rescore: z.boolean(), review_summary: z.string(),
}).strict();
const decisionResultSchema = z.object({
  recommended_candidate_id: nonEmptyString, recommended_candidate_name: nonEmptyString, decision_mode: nonEmptyString,
  scenario: nonEmptyString, final_label: z.string(), key_reason: z.string(), overall_confidence: finiteNumber,
  executive_interpretation: z.string(),
}).strict();
const tradeOffSchema = z.object({ title: z.string(), description: z.string(), type: z.string(), severity: z.string().optional() }).strict();
const adaptabilityProfileSchema = z.object({
  candidate_name: nonEmptyString, adaptability_score: unitInterval, best_scenario: z.literal("not_measured"),
  worst_scenario: z.literal("not_measured"), resilience_note: z.string(),
  cross_scenario_consistency: z.union([z.literal("not_measured"), z.null()]).optional(),
}).strict();
const pipelineStageOutputSchema = z.object({
  stage_name: nonEmptyString, stage_role: nonEmptyString, inputs: z.array(z.string()), outputs: z.array(z.string()), summary: z.string(),
}).strict();
const pairResultSchema = z.object({
  pair: z.tuple([nonEmptyString, nonEmptyString]), pair_score: finiteNumber.min(0).max(10), explanation: z.string(),
  scenario_coverage: unitInterval.optional(), complementarity: unitInterval.optional(), overlap_risk: unitInterval.optional(),
  conflict_risk: unitInterval.optional(), execution_cohesion: unitInterval.optional(), pair_adaptability: unitInterval.optional(),
}).strict();
export const pairingResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), best_pair: pairResultSchema, top_pairs: z.array(pairResultSchema) }).strict(),
  z.object({ status: z.literal("unavailable"), reason: nonEmptyString, best_pair: z.null(), top_pairs: z.tuple([]) }).strict(),
]);
export const runMetadataSchema = z.object({
  provider: nonEmptyString, model: nonEmptyString, logicalProviderStageCount: z.number().int().min(0).max(4),
  providerAttemptCount: z.number().int().nonnegative(), inputTokens: z.number().int().nonnegative(),
  cachedInputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative(),
  reasoningTokens: z.number().int().nonnegative(), totalTokens: z.number().int().nonnegative(),
  estimatedCostUsd: finiteNumber.nonnegative().nullable(), promptVersions: z.record(z.string()), schemaVersions: z.record(z.string()),
  attempts: z.record(z.number().int().nonnegative()), startedAt: z.string(), completedAt: z.string(),
}).strict();
const executiveSummarySchema = z.object({
  recommendation: z.string(), reason: z.string(), trade_off: z.string(), opportunity_cost: z.string(), adaptability: z.string(), alternative: z.string(),
}).strict();

export const completedPipelineResponseSchema = z.object({
  request_id: nonEmptyString, pipeline_steps: z.array(pipelineStageSchema),
  role_analysis: z.object({ title: z.string(), key_requirements: z.array(z.string()), complexity: z.string() }).strict(),
  scenario_analysis: z.object({ scenario: z.string(), key_pressures: z.array(z.string()), weight_rationale: z.string() }).strict(),
  candidate_evaluations: z.array(candidateEvaluationSchema).min(1), confidence_evidence_reviews: z.array(confidenceEvidenceReviewSchema),
  outcome_models: z.array(outcomeModelSchema), decision_result: decisionResultSchema, pairing_result: pairingResultSchema.optional(),
  trade_offs: z.array(tradeOffSchema), adaptability_profiles: z.array(adaptabilityProfileSchema),
  pipeline_stage_outputs: z.array(pipelineStageOutputSchema), executive_summary: executiveSummarySchema,
  run_metadata: runMetadataSchema,
}).strict();
