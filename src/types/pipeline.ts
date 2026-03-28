// === Request Types ===

export interface CandidateInput {
  id: string;
  name: string;
  description: string;
  source?: string;
}

export interface PipelineRequest {
  role: { title: string; description: string };
  scenario: string;
  decision_mode: "best_fit" | "lowest_risk" | "best_outcome";
  candidates: CandidateInput[];
  options: { enable_pair_simulation: boolean };
}

// === Pipeline Step Types ===

export type PipelineStageStatus = "pending" | "running" | "completed" | "failed";

export interface PipelineStage {
  id: string;
  label: string;
  status: PipelineStageStatus;
  summary?: string;
  output?: Record<string, unknown>;
  warnings?: string[];
  duration_ms?: number;
}

// === Candidate Evaluation Types ===

export interface CriterionScore {
  score: number;
  confidence: number;
  evidence: string;
  reasoning: string;
}

export interface RiskProfile {
  execution_risk: number;
  culture_risk: number;
  time_risk: number;
  adaptability_risk: number;
  confidence_risk: number;
  opportunity_cost_risk: number;
}

export interface OutcomeModel {
  expected_execution_success: number;
  scenario_fit: number;
  adaptability_score: number;
  likely_outcome: string;
  strategic_label: string;
}

export interface CandidateEvaluation {
  candidate_id: string;
  candidate_name: string;
  rank: number;
  weighted_fit_score: number;
  risk_adjusted_score: number;
  expected_outcome_score: number;
  overall_confidence: number;
  strategic_labels: string[];
  winner_reason?: string;
  trade_off_note?: string;
  criteria_scores: Record<string, CriterionScore>;
  strengths: string[];
  weaknesses: string[];
  risk_profile: RiskProfile;
  outcome_model: OutcomeModel;
}

// === Bias & Confidence Types ===

export interface BiasFlag {
  type: string;
  severity: "low" | "medium" | "high";
  description: string;
  candidate_id?: string;
}

export interface BiasConfidenceReview {
  candidate_id: string;
  candidate_name: string;
  overall_confidence: number;
  low_confidence_criteria: string[];
  bias_flags: BiasFlag[];
  weak_evidence_flags: string[];
  recommend_human_review: boolean;
  recommend_rescore: boolean;
}

// === Decision Result Types ===

export interface DecisionResult {
  recommended_candidate_id: string;
  recommended_candidate_name: string;
  decision_mode: string;
  scenario: string;
  final_label: string;
  key_reason: string;
  overall_confidence: number;
  executive_interpretation: string;
}

// === Pair Simulation Types ===

export interface PairResult {
  pair: [string, string];
  pair_score: number;
  scenario_coverage: number;
  complementarity: number;
  overlap_risk: number;
  conflict_risk: number;
  execution_cohesion: number;
  pair_adaptability: number;
  explanation: string;
}

export interface PairingResult {
  best_pair: PairResult;
  top_pairs: PairResult[];
}

// === Trade-off Types ===

export interface TradeOffCard {
  title: string;
  description: string;
  type: "gain" | "sacrifice" | "opportunity_cost" | "risk" | "adaptability";
  severity?: "low" | "medium" | "high";
}

// === Adaptability Types ===

export interface AdaptabilityProfile {
  candidate_name: string;
  adaptability_score: number;
  best_scenario: string;
  worst_scenario: string;
  resilience_note: string;
}

// === Agent Output Types ===

export interface AgentOutput {
  agent_name: string;
  agent_role: string;
  inputs: string[];
  outputs: string[];
  summary: string;
  data?: Record<string, unknown>;
}

// === Full Response ===

export interface PipelineResponse {
  pipeline_steps: PipelineStage[];
  role_analysis: { title: string; key_requirements: string[]; complexity: string };
  scenario_analysis: { scenario: string; key_pressures: string[]; weight_rationale: string };
  candidate_evaluations: CandidateEvaluation[];
  bias_confidence_reviews: BiasConfidenceReview[];
  outcome_models: OutcomeModel[];
  decision_result: DecisionResult;
  pairing_result?: PairingResult;
  trade_offs: TradeOffCard[];
  adaptability_profiles: AdaptabilityProfile[];
  agent_outputs: AgentOutput[];
  executive_summary: {
    recommendation: string;
    reason: string;
    trade_off: string;
    opportunity_cost: string;
    adaptability: string;
    alternative: string;
  };
}
