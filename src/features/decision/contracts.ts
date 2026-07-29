import type { z } from "zod";
import {
  completedPipelineResponseSchema,
  evaluationRequestSchema,
  healthResponseSchema,
  pipelineStageProgressEventSchema,
  scenarioGenerationRequestSchema,
  scenarioGenerationResponseSchema,
  sseErrorEventSchema,
} from "../../../shared/contracts/decisionApi.js";

export {
  completedPipelineResponseSchema,
  evaluationRequestSchema,
  healthResponseSchema,
  pipelineStageProgressEventSchema,
  scenarioGenerationRequestSchema,
  scenarioGenerationResponseSchema,
  sseErrorEventSchema,
};

export type EvaluationRequest = z.infer<typeof evaluationRequestSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type PipelineResponse = z.infer<typeof completedPipelineResponseSchema>;
export type PipelineStage = z.infer<typeof pipelineStageProgressEventSchema>[number];
export type CandidateInput = z.infer<typeof evaluationRequestSchema>["candidates"][number];
export type ScenarioGenerationRequest = z.infer<typeof scenarioGenerationRequestSchema>;
export type ScenarioGenerationResponse = z.infer<typeof scenarioGenerationResponseSchema>;
