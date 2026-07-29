import { completedPipelineResponseSchema } from "../contracts";
import type { PipelineResponse } from "../contracts";

type PairingResult = NonNullable<PipelineResponse["pairing_result"]>;
type SuccessfulPairing = Extract<PairingResult, { status: "ok" }>;
type UnavailablePairing = Extract<PairingResult, { status: "unavailable" }>;

export function successfulPairingFixture(): SuccessfulPairing {
  const bestPair = {
    pair: ["Alice", "Bob"] as [string, string],
    pair_score: 8.4,
    explanation: "Strong complementary skill sets.",
    scenario_coverage: 0.84,
    complementarity: 0.82,
    overlap_risk: 0.18,
    conflict_risk: 0.2,
    execution_cohesion: 0.8,
    pair_adaptability: 0.78,
  };

  return {
    status: "ok",
    best_pair: bestPair,
    top_pairs: [bestPair],
  };
}

export function unavailablePairingFixture(): UnavailablePairing {
  return {
    status: "unavailable",
    reason: "Complete pair analysis was unavailable.",
    best_pair: null,
    top_pairs: [],
  };
}

function defaultPipelineResponse(): PipelineResponse {
  return {
    request_id: "fixture-request",
    pipeline_steps: [
      {
        id: "input",
        label: "Input Received",
        status: "completed",
        duration_ms: 0,
      },
    ],
    role_analysis: {
      title: "VP of Growth",
      key_requirements: ["Build a repeatable growth system"],
      complexity: "high",
    },
    scenario_analysis: {
      scenario: "Enter a new market",
      key_pressures: ["Speed", "Uncertainty"],
      weight_rationale: "Execution and adaptability matter most.",
    },
    candidate_evaluations: [
      {
        candidate_id: "a",
        candidate_name: "Alice",
        rank: 1,
        weighted_fit_score: 82,
        risk_adjusted_score: 70,
        expected_outcome_score: 78,
        overall_confidence: 0.8,
        strategic_labels: ["Balanced Performer"],
        winner_reason: "Alice has the strongest balanced profile.",
        trade_off_note: "Her domain ramp-up may take time.",
        criteria_scores: {},
        strengths: ["Structured execution"],
        weaknesses: ["Limited direct market experience"],
        risk_profile: {
          execution_risk: 0.2,
          culture_risk: 0.2,
          time_risk: 0.2,
          adaptability_risk: 0.2,
          confidence_risk: 0.2,
          opportunity_cost_risk: 0.2,
        },
        outcome_model: {
          expected_execution_success: 0.8,
          scenario_fit: 0.8,
          adaptability_score: 0.7,
        likely_outcome: "Solid execution with a manageable ramp-up.",
        strategic_label: "Balanced",
        cross_scenario_consistency: "not_measured",
        },
      },
    ],
    confidence_evidence_reviews: [],
    outcome_models: [],
    decision_result: {
      recommended_candidate_id: "a",
      recommended_candidate_name: "Alice",
      decision_mode: "best_fit",
      scenario: "Enter a new market",
      final_label: "Best Fit",
      key_reason: "Alice provides the strongest balance.",
      overall_confidence: 0.8,
      executive_interpretation: "Alice is the recommended candidate.",
    },
    trade_offs: [],
    adaptability_profiles: [
      {
        candidate_name: "Alice",
        adaptability_score: 0.7,
        best_scenario: "not_measured",
        worst_scenario: "not_measured",
        resilience_note: "The score reflects the selected scenario only.",
        cross_scenario_consistency: "not_measured",
      },
    ],
    pipeline_stage_outputs: [],
    executive_summary: {
      recommendation: "Alice",
      reason: "She has the strongest balanced profile.",
      trade_off: "She needs some domain ramp-up.",
      opportunity_cost: "A specialist could offer faster initial impact.",
      adaptability: "She should adapt well as conditions change.",
      alternative: "Bob is the strongest alternative.",
    },
    run_metadata: {
      provider: "openai",
      model: "gpt-5-mini",
      logicalProviderStageCount: 3,
      providerAttemptCount: 3,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: null,
      promptVersions: {},
      schemaVersions: {},
      attempts: {},
      startedAt: "2026-07-29T10:00:00.000Z",
      completedAt: "2026-07-29T10:00:01.000Z",
    },
  };
}

export function rawPipelineResponseFixture(
  overrides: Record<string, unknown> = {},
): unknown {
  return {
    ...defaultPipelineResponse(),
    ...overrides,
  };
}

export function pipelineResponseFixture(
  overrides: Partial<PipelineResponse> = {},
): PipelineResponse {
  return completedPipelineResponseSchema.parse(
    rawPipelineResponseFixture(overrides),
  );
}
