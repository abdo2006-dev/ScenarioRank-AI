import type { PipelineResponse } from "../../contracts";

export type CandidateEvaluation =
  PipelineResponse["candidate_evaluations"][number];
export type CriterionScores = CandidateEvaluation["criteria_scores"];
export type PairingResult = NonNullable<PipelineResponse["pairing_result"]>;
