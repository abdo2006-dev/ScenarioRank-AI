import { beforeAll, describe, expect, it } from "vitest";
import {
  completedPipelineResponseSchema,
  evaluationRequestSchema,
  healthResponseSchema,
  pairingResultSchema,
  pipelineStageSchema,
  runMetadataSchema,
  scenarioGenerationRequestSchema,
  scenarioGenerationResponseSchema,
} from "../../shared/contracts/decisionApi.js";
import { runPipeline } from "../pipeline/runPipeline.js";
import {
  createFakePipelineProvider,
  defaultHandlers,
  defaultInput,
} from "../pipeline/testSupport/fakePipelineProvider.js";

let completedResponse;

beforeAll(async () => {
  const provider = createFakePipelineProvider({
    handlers: defaultHandlers(),
  });
  completedResponse = await runPipeline(
    provider,
    provider.model,
    defaultInput(),
    undefined,
    {
      maxCandidates: 5,
    },
  );
});

describe("public decision API contracts", () => {
  it("accepts the enabled health shape", () => {
    expect(
      healthResponseSchema.safeParse({
        status: "ok",
        ai_enabled: true,
        ai_provider: "openai",
        ai_model: "gpt-5-mini",
      }).success,
    ).toBe(true);
  });

  it("accepts the disabled health shape emitted by the server", () => {
    expect(
      healthResponseSchema.safeParse({
        status: "ok",
        ai_enabled: false,
        ai_provider: null,
        ai_model: null,
      }).success,
    ).toBe(true);
  });

  it("rejects inconsistent health provider and model fields", () => {
    const enabledWithoutProvider = {
      status: "ok",
      ai_enabled: true,
      ai_provider: "",
      ai_model: "gpt-5-mini",
    };
    const disabledWithProvider = {
      status: "ok",
      ai_enabled: false,
      ai_provider: "openai",
      ai_model: null,
    };

    expect(
      healthResponseSchema.safeParse(enabledWithoutProvider).success,
    ).toBe(false);
    expect(
      healthResponseSchema.safeParse(disabledWithProvider).success,
    ).toBe(false);
  });

  it("validates scenario request and response boundaries", () => {
    expect(
      scenarioGenerationRequestSchema.safeParse({
        title: "VP",
        description: "Leads strategy.",
      }).success,
    ).toBe(true);
    expect(
      scenarioGenerationResponseSchema.safeParse({
        scenarios: [],
        source: "ai",
      }).success,
    ).toBe(false);
  });

  it("rejects malformed or duplicate evaluation candidates", () => {
    const input = defaultInput();
    const duplicateCandidates = [
      {
        ...input.candidates[0],
      },
      {
        ...input.candidates[0],
      },
    ];

    expect(evaluationRequestSchema.safeParse(input).success).toBe(true);
    expect(
      evaluationRequestSchema.safeParse({
        ...input,
        candidates: duplicateCandidates,
      }).success,
    ).toBe(false);
  });

  it("accepts decision confidence boundaries from zero through one", () => {
    for (const overallConfidence of [0, 1]) {
      const response = {
        ...completedResponse,
        decision_result: {
          ...completedResponse.decision_result,
          overall_confidence: overallConfidence,
        },
      };
      expect(
        completedPipelineResponseSchema.safeParse(response).success,
      ).toBe(true);
    }
  });

  it("rejects decision confidence outside zero through one", () => {
    for (const overallConfidence of [-0.01, 1.01]) {
      const response = {
        ...completedResponse,
        decision_result: {
          ...completedResponse.decision_result,
          overall_confidence: overallConfidence,
        },
      };
      expect(
        completedPipelineResponseSchema.safeParse(response).success,
      ).toBe(false);
    }
  });

  it("requires nonnegative integer stage durations", () => {
    const baseStage = {
      id: "input",
      label: "Input Received",
      status: "completed",
    };

    expect(
      pipelineStageSchema.safeParse({
        ...baseStage,
        duration_ms: 0,
      }).success,
    ).toBe(true);
    expect(
      pipelineStageSchema.safeParse({
        ...baseStage,
        duration_ms: -1,
      }).success,
    ).toBe(false);
    expect(
      pipelineStageSchema.safeParse({
        ...baseStage,
        duration_ms: 0.5,
      }).success,
    ).toBe(false);
  });

  it("keeps existing candidate and metadata numeric bounds", () => {
    const invalidCandidateConfidence = {
      ...completedResponse,
      candidate_evaluations: [
        {
          ...completedResponse.candidate_evaluations[0],
          overall_confidence: -0.1,
        },
      ],
    };
    const invalidFitScore = {
      ...completedResponse,
      candidate_evaluations: [
        {
          ...completedResponse.candidate_evaluations[0],
          weighted_fit_score: 101,
        },
      ],
    };

    expect(
      completedPipelineResponseSchema.safeParse(completedResponse).success,
    ).toBe(true);
    expect(
      completedPipelineResponseSchema.safeParse(
        invalidCandidateConfidence,
      ).success,
    ).toBe(false);
    expect(
      completedPipelineResponseSchema.safeParse(invalidFitScore).success,
    ).toBe(false);
    expect(
      runMetadataSchema.safeParse({
        ...completedResponse.run_metadata,
        estimatedCostUsd: -1,
      }).success,
    ).toBe(false);
    expect(
      runMetadataSchema.safeParse({
        ...completedResponse.run_metadata,
        logicalProviderStageCount: 5,
      }).success,
    ).toBe(false);
  });

  it("accepts a successful pairing whose best pair is in top pairs", () => {
    const bestPair = {
      pair: ["Alice", "Bob"],
      pair_score: 8,
      explanation: "Evidence.",
    };

    expect(
      pairingResultSchema.safeParse({
        status: "ok",
        best_pair: bestPair,
        top_pairs: [bestPair],
      }).success,
    ).toBe(true);
  });

  it("requires at least one successful top pair", () => {
    const bestPair = {
      pair: ["Alice", "Bob"],
      pair_score: 8,
      explanation: "Evidence.",
    };

    expect(
      pairingResultSchema.safeParse({
        status: "ok",
        best_pair: bestPair,
        top_pairs: [],
      }).success,
    ).toBe(false);
  });

  it("requires two distinct names in every successful pair", () => {
    const repeatedNamePair = {
      pair: ["Alice", "Alice"],
      pair_score: 8,
      explanation: "Invalid.",
    };

    expect(
      pairingResultSchema.safeParse({
        status: "ok",
        best_pair: repeatedNamePair,
        top_pairs: [repeatedNamePair],
      }).success,
    ).toBe(false);
  });

  it("requires the complete best-pair result to appear in top pairs", () => {
    const bestPair = {
      pair: ["Alice", "Bob"],
      pair_score: 8,
      explanation: "Best evidence.",
    };
    const differentResult = {
      ...bestPair,
      pair_score: 7,
    };

    expect(
      pairingResultSchema.safeParse({
        status: "ok",
        best_pair: bestPair,
        top_pairs: [differentResult],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate and reversed successful pairs", () => {
    const firstPair = {
      pair: ["Alice", "Bob"],
      pair_score: 8,
      explanation: "Evidence.",
    };
    const reversedPair = {
      pair: ["Bob", "Alice"],
      pair_score: 7,
      explanation: "Same combination.",
    };

    for (const duplicate of [firstPair, reversedPair]) {
      expect(
        pairingResultSchema.safeParse({
          status: "ok",
          best_pair: firstPair,
          top_pairs: [firstPair, duplicate],
        }).success,
      ).toBe(false);
    }
  });

  it("accepts only the unavailable pairing shape with an empty tuple", () => {
    const unavailable = {
      status: "unavailable",
      reason: "Unavailable.",
      best_pair: null,
      top_pairs: [],
    };

    expect(pairingResultSchema.safeParse(unavailable).success).toBe(true);
    expect(
      pairingResultSchema.safeParse({
        ...unavailable,
        best_pair: {
          pair: ["Alice", "Bob"],
          pair_score: 8,
          explanation: "Impossible.",
        },
      }).success,
    ).toBe(false);
  });

  it("rejects retired output names and requires full metadata", () => {
    const legacyBiasOutput = {
      ...completedResponse,
      bias_confidence_reviews: [],
    };
    const legacyAgentOutput = {
      ...completedResponse,
      agent_outputs: [],
    };
    const missingProvider = {
      ...completedResponse.run_metadata,
    };
    delete missingProvider.provider;

    expect(
      completedPipelineResponseSchema.safeParse(legacyBiasOutput).success,
    ).toBe(false);
    expect(
      completedPipelineResponseSchema.safeParse(legacyAgentOutput).success,
    ).toBe(false);
    expect(runMetadataSchema.safeParse(missingProvider).success).toBe(false);
  });
});
