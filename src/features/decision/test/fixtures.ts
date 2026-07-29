import { completedPipelineResponseSchema } from "../contracts";
import type { PipelineResponse } from "../contracts";

export function pipelineResponseFixture(): PipelineResponse {
  return completedPipelineResponseSchema.parse({
    request_id: "fixture", pipeline_steps: [{ id: "input", label: "Input Received", status: "completed" }],
    role_analysis: { title: "VP", key_requirements: [], complexity: "high" },
    scenario_analysis: { scenario: "Growth", key_pressures: [], weight_rationale: "Fixture." },
    candidate_evaluations: [{ candidate_id: "a", candidate_name: "Alice", rank: 1, weighted_fit_score: 82, risk_adjusted_score: 70, expected_outcome_score: 78, overall_confidence: 0.8, strategic_labels: [], criteria_scores: {}, strengths: [], weaknesses: [], risk_profile: { execution_risk: 0.2, culture_risk: 0.2, time_risk: 0.2, adaptability_risk: 0.2, confidence_risk: 0.2, opportunity_cost_risk: 0.2 }, outcome_model: { expected_execution_success: 0.8, scenario_fit: 0.8, adaptability_score: 0.7, likely_outcome: "Solid.", strategic_label: "Balanced" } }],
    confidence_evidence_reviews: [], outcome_models: [], decision_result: { recommended_candidate_id: "a", recommended_candidate_name: "Alice", decision_mode: "best_fit", scenario: "Growth", final_label: "Best Fit", key_reason: "Fixture.", overall_confidence: 0.8, executive_interpretation: "Fixture." }, trade_offs: [], adaptability_profiles: [], pipeline_stage_outputs: [], executive_summary: { recommendation: "Alice", reason: "Fixture", trade_off: "", opportunity_cost: "", adaptability: "", alternative: "" }, run_metadata: { provider: "openai", model: "gpt-5-mini", logicalProviderStageCount: 3, providerAttemptCount: 3, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0, estimatedCostUsd: null, promptVersions: {}, schemaVersions: {}, attempts: {}, startedAt: "", completedAt: "" },
  });
}
