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
import { DECISION_INPUT_LIMITS } from "../../shared/contracts/decisionInputLimits.js";
import { runPipeline } from "../pipeline/runPipeline.js";
import {
  createFakePipelineProvider,
  defaultHandlers,
  defaultInput,
} from "../pipeline/testSupport/fakePipelineProvider.js";

let completedResponse;
let pairedCompletedResponse;

function publicPair(overrides = {}) {
  return {
    candidate_id_a: "candidate-a",
    candidate_id_b: "candidate-b",
    pair: ["Alex Smith", "Alex Smith"],
    pair_score: 8,
    explanation: "Evidence.",
    ...overrides,
  };
}

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

  const pairedProvider = createFakePipelineProvider({
    handlers: defaultHandlers(),
  });
  pairedCompletedResponse = await runPipeline(
    pairedProvider,
    pairedProvider.model,
    defaultInput({
      candidateIds: ["a", "b", "c"],
      enablePairing: true,
    }),
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
        limits: { max_candidates: 5, max_scenarios: 5, role_title_max_chars: 120, role_description_max_chars: 4000, scenario_max_chars: 2000, candidate_name_max_chars: 120, candidate_description_max_chars: 4000 },
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
        limits: { max_candidates: 5, max_scenarios: 5, role_title_max_chars: 120, role_description_max_chars: 4000, scenario_max_chars: 2000, candidate_name_max_chars: 120, candidate_description_max_chars: 4000 },
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

  it("validates scenario-generation requests", () => {
    expect(
      scenarioGenerationRequestSchema.safeParse({
        title: "VP",
        description: "Leads strategy.",
      }).success,
    ).toBe(true);
  });

  it("accepts a generated scenario at the shared maximum", () => {
    expect(scenarioGenerationResponseSchema.safeParse({
      scenarios: ["s".repeat(DECISION_INPUT_LIMITS.scenario.max)],
      source: "ai",
    }).success).toBe(true);
  });

  it("rejects a generated scenario above the shared maximum", () => {
    expect(scenarioGenerationResponseSchema.safeParse({
      scenarios: ["s".repeat(DECISION_INPUT_LIMITS.scenario.max + 1)],
      source: "ai",
    }).success).toBe(false);
  });

  it("rejects whitespace-only generated scenarios", () => {
    expect(scenarioGenerationResponseSchema.safeParse({
      scenarios: ["   "],
      source: "ai",
    }).success).toBe(false);
  });

  it("enforces shared trimmed text and technical candidate limits", () => {
    const input = defaultInput();
    const atRoleTitleLimit = "t".repeat(DECISION_INPUT_LIMITS.roleTitle.max);
    const atDescriptionLimit = "d".repeat(DECISION_INPUT_LIMITS.candidateDescription.max);

    expect(evaluationRequestSchema.safeParse({
      ...input,
      role: { ...input.role, title: atRoleTitleLimit },
      candidates: input.candidates.map((candidate, index) => (
        index === 0 ? { ...candidate, description: atDescriptionLimit } : candidate
      )),
    }).success).toBe(true);
    expect(evaluationRequestSchema.safeParse({
      ...input,
      role: { ...input.role, title: " ".repeat(DECISION_INPUT_LIMITS.roleTitle.max + 1) },
    }).success).toBe(false);
    expect(evaluationRequestSchema.safeParse({
      ...input,
      candidates: Array.from({ length: DECISION_INPUT_LIMITS.candidates.max + 1 }, (_, index) => ({
        id: `candidate-${index}`, name: `Candidate ${index}`, description: "Profile.",
      })),
    }).success).toBe(false);
  });

  it("accepts duplicate names when candidate IDs remain unique", () => {
    const input = defaultInput({ candidateIds: ["one", "two"] });
    input.candidates[1].name = input.candidates[0].name;
    expect(evaluationRequestSchema.safeParse(input).success).toBe(true);
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

  it("uses a dedicated signed range only for risk-adjusted scores", () => {
    const candidate = completedResponse.candidate_evaluations[0];
    const responseWithSignedRisk = {
      ...completedResponse,
      candidate_evaluations: [{ ...candidate, risk_adjusted_score: -30 }],
    };

    expect(completedPipelineResponseSchema.safeParse(responseWithSignedRisk).success).toBe(true);
    for (const risk_adjusted_score of [-100.01, 100.01]) {
      expect(completedPipelineResponseSchema.safeParse({
        ...completedResponse,
        candidate_evaluations: [{ ...candidate, risk_adjusted_score }],
      }).success).toBe(false);
    }
    expect(completedPipelineResponseSchema.safeParse({
      ...completedResponse,
      candidate_evaluations: [{ ...candidate, weighted_fit_score: -0.01 }],
    }).success).toBe(false);
    expect(completedPipelineResponseSchema.safeParse({
      ...completedResponse,
      candidate_evaluations: [{ ...candidate, expected_outcome_score: 100.01 }],
    }).success).toBe(false);
  });

  it("accepts a successful pairing whose best pair is in top pairs", () => {
    const bestPair = publicPair();

    expect(
      pairingResultSchema.safeParse({
        status: "ok",
        best_pair: bestPair,
        top_pairs: [bestPair],
      }).success,
    ).toBe(true);
  });

  it("requires at least one successful top pair", () => {
    const bestPair = publicPair();

    expect(
      pairingResultSchema.safeParse({
        status: "ok",
        best_pair: bestPair,
        top_pairs: [],
      }).success,
    ).toBe(false);
  });

  it("allows duplicate display names when candidate IDs differ", () => {
    const duplicateNamePair = publicPair();

    expect(
      pairingResultSchema.safeParse({
        status: "ok",
        best_pair: duplicateNamePair,
        top_pairs: [duplicateNamePair],
      }).success,
    ).toBe(true);
  });

  it("requires the complete best-pair result to appear in top pairs", () => {
    const bestPair = publicPair({ explanation: "Best evidence." });
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
    const firstPair = publicPair();
    const reversedPair = publicPair({
      candidate_id_a: "candidate-b",
      candidate_id_b: "candidate-a",
      pair: ["Alex Smith", "Alex Smith"],
      pair_score: 7,
      explanation: "Same combination.",
    });

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
        best_pair: publicPair({ explanation: "Impossible." }),
      }).success,
    ).toBe(false);
  });

  it("rejects the same candidate ID on both sides of a pair", () => {
    const invalidPair = publicPair({ candidate_id_b: "candidate-a" });

    expect(
      pairingResultSchema.safeParse({
        status: "ok",
        best_pair: invalidPair,
        top_pairs: [invalidPair],
      }).success,
    ).toBe(false);
  });

  it("requires candidate IDs on every public pair result", () => {
    const missingIds = publicPair();
    delete missingIds.candidate_id_a;

    expect(
      pairingResultSchema.safeParse({
        status: "ok",
        best_pair: missingIds,
        top_pairs: [missingIds],
      }).success,
    ).toBe(false);
  });

  it("parses a real pairing-enabled pipeline result through the public contract", () => {
    expect(pairedCompletedResponse.pairing_result.status).toBe("ok");
    expect(
      completedPipelineResponseSchema.parse(pairedCompletedResponse),
    ).toEqual(pairedCompletedResponse);
  });

  it("accepts different candidates with the same display name", async () => {
    const provider = createFakePipelineProvider({
      handlers: defaultHandlers(),
    });
    const input = defaultInput({
      candidateIds: ["candidate-a", "candidate-b", "candidate-c"],
      enablePairing: true,
    });
    input.candidates[0].name = "Alex Smith";
    input.candidates[1].name = "Alex Smith";
    const response = await runPipeline(
      provider,
      provider.model,
      input,
      undefined,
      { maxCandidates: 5 },
    );

    expect(response.pairing_result.status).toBe("ok");
    expect(
      completedPipelineResponseSchema.safeParse(response).success,
    ).toBe(true);
  });

  it("rejects unknown pair candidate IDs in a completed response", () => {
    const response = structuredClone(pairedCompletedResponse);
    response.pairing_result.best_pair.candidate_id_a = "unknown";
    response.pairing_result.top_pairs[0].candidate_id_a = "unknown";

    expect(
      completedPipelineResponseSchema.safeParse(response).success,
    ).toBe(false);
  });

  it("rejects a pair name that does not match its candidate ID", () => {
    const response = structuredClone(pairedCompletedResponse);
    response.pairing_result.best_pair.pair[0] = "Wrong name";
    response.pairing_result.top_pairs[0].pair[0] = "Wrong name";

    expect(
      completedPipelineResponseSchema.safeParse(response).success,
    ).toBe(false);
  });

  it("accepts a reversed pair order when the name order is reversed too", () => {
    const response = structuredClone(pairedCompletedResponse);
    const bestPair = {
      ...response.pairing_result.best_pair,
      pair: [...response.pairing_result.best_pair.pair],
    };
    response.pairing_result.best_pair = bestPair;
    [bestPair.candidate_id_a, bestPair.candidate_id_b] = [
      bestPair.candidate_id_b,
      bestPair.candidate_id_a,
    ];
    [bestPair.pair[0], bestPair.pair[1]] = [
      bestPair.pair[1],
      bestPair.pair[0],
    ];

    expect(
      completedPipelineResponseSchema.safeParse(response).success,
    ).toBe(true);
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
