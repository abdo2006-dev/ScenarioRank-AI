import { describe, expect, it } from "vitest";
import {
  completedPipelineResponseSchema, evaluationRequestSchema, healthResponseSchema,
  pairingResultSchema, runMetadataSchema, scenarioGenerationRequestSchema, scenarioGenerationResponseSchema,
} from "../../shared/contracts/decisionApi.js";
import { defaultHandlers, defaultInput, createFakePipelineProvider } from "../pipeline/testSupport/fakePipelineProvider.js";
import { runPipeline } from "../pipeline/runPipeline.js";

describe("public decision API contracts", () => {
  it("accepts health and scenario transport responses, while rejecting malformed values", () => {
    expect(healthResponseSchema.safeParse({ status: "ok", ai_enabled: true, ai_provider: "openai", ai_model: "gpt-5-mini" }).success).toBe(true);
    expect(healthResponseSchema.safeParse({ status: "ready", ai_enabled: true, ai_provider: "openai", ai_model: "gpt-5-mini" }).success).toBe(false);
    expect(scenarioGenerationRequestSchema.safeParse({ title: "VP", description: "Leads strategy." }).success).toBe(true);
    expect(scenarioGenerationResponseSchema.safeParse({ scenarios: [], source: "ai" }).success).toBe(false);
  });

  it("rejects malformed or duplicate evaluation candidates", () => {
    const input = defaultInput();
    expect(evaluationRequestSchema.safeParse(input).success).toBe(true);
    expect(evaluationRequestSchema.safeParse({ ...input, candidates: [{ ...input.candidates[0] }, { ...input.candidates[0] }] }).success).toBe(false);
  });

  it("enforces public numerical invariants", async () => {
    const provider = createFakePipelineProvider({ handlers: defaultHandlers() });
    const result = await runPipeline(provider, provider.model, defaultInput(), undefined, { maxCandidates: 5 });
    expect(completedPipelineResponseSchema.safeParse(result).success).toBe(true);
    expect(completedPipelineResponseSchema.safeParse({ ...result, candidate_evaluations: [{ ...result.candidate_evaluations[0], overall_confidence: -0.1 }] }).success).toBe(false);
    expect(completedPipelineResponseSchema.safeParse({ ...result, candidate_evaluations: [{ ...result.candidate_evaluations[0], weighted_fit_score: 101 }] }).success).toBe(false);
    expect(runMetadataSchema.safeParse({ ...result.run_metadata, estimatedCostUsd: -1 }).success).toBe(false);
    expect(runMetadataSchema.safeParse({ ...result.run_metadata, logicalProviderStageCount: 5 }).success).toBe(false);
  });

  it("requires honest pairing discriminants", () => {
    const pair = { pair: ["Alice", "Bob"], pair_score: 8, explanation: "Evidence." };
    expect(pairingResultSchema.safeParse({ status: "ok", best_pair: pair, top_pairs: [pair] }).success).toBe(true);
    expect(pairingResultSchema.safeParse({ status: "ok", best_pair: null, top_pairs: [] }).success).toBe(false);
    expect(pairingResultSchema.safeParse({ status: "unavailable", reason: "Unavailable.", best_pair: null, top_pairs: [] }).success).toBe(true);
    expect(pairingResultSchema.safeParse({ status: "unavailable", reason: "Unavailable.", best_pair: pair, top_pairs: [pair] }).success).toBe(false);
  });

  it("rejects retired bias and agent field names and requires full metadata", async () => {
    const provider = createFakePipelineProvider({ handlers: defaultHandlers() });
    const result = await runPipeline(provider, provider.model, defaultInput(), undefined, { maxCandidates: 5 });
    expect(completedPipelineResponseSchema.safeParse(result).success).toBe(true);
    expect(completedPipelineResponseSchema.safeParse({ ...result, bias_confidence_reviews: [], confidence_evidence_reviews: result.confidence_evidence_reviews }).success).toBe(false);
    expect(completedPipelineResponseSchema.safeParse({ ...result, agent_outputs: [], pipeline_stage_outputs: result.pipeline_stage_outputs }).success).toBe(false);
    expect(runMetadataSchema.safeParse({ ...result.run_metadata, estimatedCostUsd: null }).success).toBe(true);
    const missingProvider = { ...result.run_metadata };
    delete missingProvider.provider;
    expect(runMetadataSchema.safeParse(missingProvider).success).toBe(false);
  });
});
