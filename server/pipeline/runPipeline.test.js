import { describe, it, expect } from "vitest";
import { runPipeline, confidenceEvidenceReview, outcomeModeling, mapBatchResultsById, mapPairResultsByIdentity } from "./runPipeline.js";
import { createFakePipelineProvider, defaultHandlers, defaultInput, criteriaScoresFixture } from "./testSupport/fakePipelineProvider.js";
import { BatchIntegrityError } from "../ai/errors.js";

describe("runPipeline — full mocked execution", () => {
  it("completes end-to-end with no real network calls, returning a full response shape", async () => {
    const provider = createFakePipelineProvider({ handlers: defaultHandlers() });
    const input = defaultInput({ enablePairing: true });
    const stagesSeen = [];

    const result = await runPipeline(provider, provider.model, input, (stages) => stagesSeen.push(stages));

    expect(result.decision_result.recommended_candidate_id).toBeTruthy();
    expect(result.candidate_evaluations).toHaveLength(2);
    expect(result.pairing_result).toBeTruthy();
    expect(stagesSeen.length).toBeGreaterThan(0);
    expect(stagesSeen.at(-1).every((s) => s.status === "completed")).toBe(true);
  });
});

describe("runPipeline — one provider per run", () => {
  it("uses only the single provider instance passed in, for every stage and every candidate", async () => {
    const provider = createFakePipelineProvider({ handlers: defaultHandlers() });
    const input = defaultInput({ candidateIds: ["a", "b", "c"], enablePairing: true });

    const result = await runPipeline(provider, provider.model, input, () => {});

    const meta = result.run_metadata;
    expect(meta.provider).toBe("fake");
    expect(meta.model).toBe("fake-model");
    expect(Object.keys(meta.promptVersions).length).toBeGreaterThan(0);
    expect(provider.calls.length).toBeGreaterThan(0); // sanity: calls recorded on the one instance
  });

  it("never constructs a second provider mid-run even when pairing is enabled", async () => {
    let constructions = 0;
    function trackedProvider() {
      constructions += 1;
      return createFakePipelineProvider({ handlers: defaultHandlers() });
    }
    const provider = trackedProvider();
    await runPipeline(provider, provider.model, defaultInput({ candidateIds: ["a", "b", "c", "d"], enablePairing: true }), () => {});
    expect(constructions).toBe(1);
  });
});

describe("runPipeline — request-count architecture (docs/decisions/ADR-0004-single-openai-provider.md)", () => {
  it("makes exactly one provider request for combined context analysis, not two separate role/scenario requests", async () => {
    const provider = createFakePipelineProvider({ handlers: defaultHandlers() });
    await runPipeline(provider, provider.model, defaultInput(), () => {});
    const contextCalls = provider.calls.filter((c) => c.promptId === "context-analysis");
    expect(contextCalls).toHaveLength(1);
  });

  it("scores every candidate in exactly one batch request, not one request per candidate", async () => {
    const provider = createFakePipelineProvider({ handlers: defaultHandlers() });
    await runPipeline(provider, provider.model, defaultInput({ candidateIds: ["a", "b", "c", "d", "e"] }), () => {});
    const scoringCalls = provider.calls.filter((c) => c.promptId === "batch-candidate-scoring");
    expect(scoringCalls).toHaveLength(1);
  });

  it("evaluates every relevant top-four pair in exactly one batch request, not one request per pair", async () => {
    const provider = createFakePipelineProvider({ handlers: defaultHandlers() });
    await runPipeline(provider, provider.model, defaultInput({ candidateIds: ["a", "b", "c", "d", "e"], enablePairing: true }), () => {});
    const pairingCalls = provider.calls.filter((c) => c.promptId === "batch-pairing-analysis");
    expect(pairingCalls).toHaveLength(1);
  });

  it("uses exactly 4 logical model-backed stages for a normal run with pairing enabled", async () => {
    const provider = createFakePipelineProvider({ handlers: defaultHandlers() });
    const result = await runPipeline(provider, provider.model, defaultInput({ candidateIds: ["a", "b", "c", "d", "e"], enablePairing: true }), () => {});
    expect(result.run_metadata.logicalProviderStageCount).toBe(4);
  });

  it("uses exactly 3 logical model-backed stages for a normal run with pairing disabled", async () => {
    const provider = createFakePipelineProvider({ handlers: defaultHandlers() });
    const result = await runPipeline(provider, provider.model, defaultInput({ candidateIds: ["a", "b", "c"] }), () => {});
    expect(result.run_metadata.logicalProviderStageCount).toBe(3);
  });

  it("aggregates providerAttemptCount across every logical stage's real attempts", async () => {
    const provider = createFakePipelineProvider({ handlers: defaultHandlers() });
    const result = await runPipeline(provider, provider.model, defaultInput({ candidateIds: ["a", "b", "c", "d", "e"], enablePairing: true }), () => {});
    // The fake provider always succeeds on the first real call, so with no
    // retries needed, providerAttemptCount equals logicalProviderStageCount
    // exactly — see the OpenAI-adapter-level tests for retries actually
    // increasing this count above 1 per stage.
    expect(result.run_metadata.providerAttemptCount).toBe(result.run_metadata.logicalProviderStageCount);
    expect(result.run_metadata.providerAttemptCount).toBe(4);
  });

  it("a provider retry (schema-validation failure then success) increases providerAttemptCount for that stage without adding a logical stage", async () => {
    let call = 0;
    const handlers = {
      ...defaultHandlers(),
      "context-analysis": () => {
        call += 1;
        if (call === 1) throw new Error("schema validation failed");
        return defaultHandlers()["context-analysis"];
      },
    };
    // The fake pipeline provider (server/pipeline/testSupport/fakePipelineProvider.js)
    // does not itself retry on a handler throwing — that responsibility
    // belongs to the real OpenAI adapter's withRetry(). To exercise a
    // genuine multi-attempt stage without a real network call, use a fake
    // whose generateStructured() performs its own bounded retry, mirroring
    // what the real adapter does internally.
    const provider = createRetryingFakeProvider(handlers);
    const result = await runPipeline(provider, provider.model, defaultInput({ candidateIds: ["a", "b"] }), () => {});
    expect(result.run_metadata.attempts.context).toBe(2);
    expect(result.run_metadata.logicalProviderStageCount).toBe(3);
    expect(result.run_metadata.providerAttemptCount).toBe(2 + 1 + 1); // context retried once, scoring + decision succeeded first try
  });

  it("a batch-integrity corrective call increases providerAttemptCount for that stage without adding a logical stage", async () => {
    let call = 0;
    const handlers = {
      ...defaultHandlers(),
      "batch-candidate-scoring": (request) => {
        call += 1;
        const ids = [...request.prompt.matchAll(/candidate_id: (\S+)\nName:/g)].map((m) => m[1]);
        const usable = call === 1 ? ids.slice(0, 1) : ids; // first attempt incomplete, corrective retry complete
        return { results: usable.map((id) => ({ candidate_id: id, criteria_scores: criteriaScoresFixture(6), strengths: [], weaknesses: [], best_fit_contexts: [] })) };
      },
    };
    const provider = createFakePipelineProvider({ handlers });
    const result = await runPipeline(provider, provider.model, defaultInput({ candidateIds: ["a", "b"] }), () => {});
    expect(result.run_metadata.attempts.scoring).toBe(2); // both the discarded first call and the corrective retry counted
    expect(result.run_metadata.logicalProviderStageCount).toBe(3); // still just context, scoring, decision
    const scoringCalls = provider.calls.filter((c) => c.promptId === "batch-candidate-scoring");
    expect(scoringCalls).toHaveLength(2);
  });

  it("rejects a run with more candidates than AI_MAX_CANDIDATES before calling the model", async () => {
    const provider = createFakePipelineProvider({ handlers: defaultHandlers() });
    const input = defaultInput({ candidateIds: ["a", "b", "c", "d", "e", "f"] });
    await expect(runPipeline(provider, provider.model, input, () => {}, { maxCandidates: 5 })).rejects.toThrow(/Too many candidates/);
    expect(provider.calls.length).toBe(0);
  });
});

/**
 * A fake provider whose generateStructured() retries once internally on a
 * thrown error, mirroring the real OpenAI adapter's withRetry() — used
 * only to exercise multi-attempt-per-stage metadata aggregation without a
 * real network call.
 */
function createRetryingFakeProvider(handlers) {
  const calls = [];
  return {
    name: "fake", model: "fake-model",
    async generateStructured(request) {
      calls.push({ promptId: request.promptId, prompt: request.prompt, system: request.system });
      const handler = handlers[request.promptId];
      let attempts = 0;
      let lastErr;
      for (attempts = 1; attempts <= 2; attempts++) {
        try {
          const result = typeof handler === "function" ? await handler(request) : handler;
          const data = request.schema.parse(result);
          return { data, meta: { provider: "fake", model: "fake-model", latencyMs: 1, attempts } };
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr;
    },
    get calls() { return calls; },
  };
}

describe("runPipeline — deterministic ranking is independent of LLM explanation wording", () => {
  it("keeps the same winner regardless of what the mocked decision explanation says", async () => {
    const baseHandlers = defaultHandlers({ scoreByCandidateId: { a: 9, b: 3 } });

    const providerA = createFakePipelineProvider({
      handlers: { ...baseHandlers, "decision-explanation": { ...baseHandlers["decision-explanation"], winner_reason: "Narrative A praises candidate b heavily." } },
    });
    const providerB = createFakePipelineProvider({
      handlers: { ...baseHandlers, "decision-explanation": { ...baseHandlers["decision-explanation"], winner_reason: "Completely different narrative, praises nobody in particular." } },
    });

    const input = defaultInput({ candidateIds: ["a", "b"] });
    const resultA = await runPipeline(providerA, providerA.model, input, () => {});
    const resultB = await runPipeline(providerB, providerB.model, input, () => {});

    // Candidate "a" scores higher on every criterion, so it must win
    // regardless of what the explanation text says.
    expect(resultA.decision_result.recommended_candidate_id).toBe("a");
    expect(resultB.decision_result.recommended_candidate_id).toBe("a");
  });
});

describe("runPipeline — pairing top-four regression (docs/architecture/KNOWN_LIMITATIONS.md P0.1)", () => {
  it("pairs the top four RANKED candidates, not the first four SUBMITTED", async () => {
    // Submission order: a, b, c, d, e. Scores make "e" (submitted LAST)
    // the best candidate and "a" (submitted FIRST) the worst. The old
    // buggy behavior would pick a-d for pairing; the fix must pick b-e.
    const handlers = defaultHandlers({ scoreByCandidateId: { a: 2, b: 5, c: 6, d: 7, e: 9 } });
    const provider = createFakePipelineProvider({ handlers });
    const input = defaultInput({ candidateIds: ["a", "b", "c", "d", "e"], enablePairing: true });

    const result = await runPipeline(provider, provider.model, input, () => {});

    const rankedTop4 = result.candidate_evaluations.slice(0, 4).map((c) => c.candidate_id).sort();
    expect(rankedTop4).toEqual(["b", "c", "d", "e"]);

    const pairedNames = new Set();
    [result.pairing_result.best_pair, ...result.pairing_result.top_pairs].forEach((p) => p.pair.forEach((n) => pairedNames.add(n)));
    expect([...pairedNames].sort()).toEqual(["b", "c", "d", "e"]);
    expect(pairedNames.has("a")).toBe(false);
  });
});

describe("runPipeline — unmeasured cross-scenario consistency (docs/architecture/KNOWN_LIMITATIONS.md P0.2)", () => {
  it("exposes cross_scenario_consistency as the literal string not_measured, never a fabricated number", async () => {
    const provider = createFakePipelineProvider({ handlers: defaultHandlers() });
    const result = await runPipeline(provider, provider.model, defaultInput(), () => {});

    for (const model of result.outcome_models) {
      expect(model.cross_scenario_consistency).toBe("not_measured");
    }
    for (const evaluation of result.candidate_evaluations) {
      expect(evaluation.outcome_model.cross_scenario_consistency).toBe("not_measured");
    }
    for (const profile of result.adaptability_profiles) {
      expect(profile.cross_scenario_consistency).toBe("not_measured");
    }
  });

  it("outcomeModeling() no longer accepts or needs a consistency argument", () => {
    const scoring = { candidate_id: "x", candidate_name: "X", criteria_scores: criteriaScoresFixture(8) };
    const outcome = outcomeModeling(scoring, 80, 0.8);
    expect(outcome.cross_scenario_consistency).toBe("not_measured");
    expect(typeof outcome.adaptability_score).toBe("number");
  });

  it("never claims a candidate performs best in this scenario or will struggle in a pivot/crisis scenario anywhere in the response", async () => {
    const provider = createFakePipelineProvider({ handlers: defaultHandlers() });
    const input = defaultInput({ candidateIds: ["a", "b", "c", "d", "e"], enablePairing: true });
    const result = await runPipeline(provider, provider.model, input, () => {});

    for (const profile of result.adaptability_profiles) {
      expect(profile.best_scenario).toBe("not_measured");
      expect(profile.worst_scenario).toBe("not_measured");
    }

    // Full-response regression scan: none of the previously-fabricated
    // cross-scenario claims may appear anywhere in the pipeline's output,
    // including inside free-text summaries (docs/architecture/
    // KNOWN_LIMITATIONS.md P0.2).
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/rapid crisis\/pivot scenario/i);
    expect(serialized).not.toMatch(/may struggle under rapid pivots/i);
    expect(serialized).not.toMatch(/best scenario/i);
    expect(serialized).not.toMatch(/worst scenario/i);
  });
});

describe("runPipeline — run metadata", () => {
  it("records provider, model, prompt/schema versions, attempts, timestamps, and usage/cost aggregates", async () => {
    const provider = createFakePipelineProvider({ handlers: defaultHandlers() });
    const result = await runPipeline(provider, provider.model, defaultInput(), () => {});

    const meta = result.run_metadata;
    expect(meta.provider).toBe("fake");
    expect(meta.model).toBe("fake-model");
    expect(meta.promptVersions.context).toBe("v1");
    expect(meta.schemaVersions.context).toBe("v1");
    expect(meta.attempts.context).toBe(1);
    // Regression: every stage that calls the provider must record its own
    // attempts entry — a prior bug destructured the wrong return value for
    // the scoring stage, silently leaving meta.attempts.scoring undefined
    // even though the real call succeeded.
    expect(meta.attempts.scoring).toBe(1);
    expect(meta.attempts.decision).toBe(1);
    expect(new Date(meta.startedAt).getTime()).not.toBeNaN();
    expect(new Date(meta.completedAt).getTime()).not.toBeNaN();
    expect(new Date(meta.completedAt).getTime()).toBeGreaterThanOrEqual(new Date(meta.startedAt).getTime());

    // Usage/cost aggregates are always present (0 when the provider/model
    // report no usage, e.g. this fake), never absent — see
    // docs/PROJECT_STATUS.md, "cost and usage visibility".
    expect(typeof meta.logicalProviderStageCount).toBe("number");
    expect(typeof meta.providerAttemptCount).toBe("number");
    expect(typeof meta.inputTokens).toBe("number");
    expect(typeof meta.cachedInputTokens).toBe("number");
    expect(typeof meta.outputTokens).toBe("number");
    expect(typeof meta.reasoningTokens).toBe("number");
    expect(typeof meta.totalTokens).toBe("number");
    // "fake-model" has no recorded pricing, so cost must be null, never guessed.
    expect(meta.estimatedCostUsd).toBeNull();
  });

  it("aggregates real usage into run_metadata and estimates a real cost for a priced model", async () => {
    const provider = createFakePipelineProviderWithUsage();
    const result = await runPipeline(provider, provider.model, defaultInput({ candidateIds: ["a", "b"] }), () => {});
    expect(result.run_metadata.inputTokens).toBeGreaterThan(0);
    expect(result.run_metadata.outputTokens).toBeGreaterThan(0);
    expect(result.run_metadata.totalTokens).toBeGreaterThan(0);
    expect(result.run_metadata.estimatedCostUsd).toBeGreaterThan(0);
  });
});

function createFakePipelineProviderWithUsage() {
  const handlers = defaultHandlers();
  const calls = [];
  return {
    name: "openai",
    model: "gpt-5-mini",
    async generateStructured(request) {
      calls.push({ promptId: request.promptId });
      const handler = handlers[request.promptId];
      const result = typeof handler === "function" ? await handler(request) : handler;
      const data = request.schema.parse(result);
      return {
        data,
        meta: {
          provider: "openai", model: "gpt-5-mini", latencyMs: 1, attempts: 1,
          usage: { inputTokens: 500, cachedInputTokens: 0, outputTokens: 200, reasoningTokens: 0, totalTokens: 700 },
        },
      };
    },
    get calls() { return calls; },
  };
}

describe("runPipeline — structured validation failure and no-hang propagation", () => {
  it("propagates a context-analysis failure as a rejected pipeline (never hangs)", async () => {
    const handlers = { ...defaultHandlers(), "context-analysis": () => { throw new Error("schema validation failed"); } };
    const provider = createFakePipelineProvider({ handlers });
    const stagesSeen = [];

    await expect(runPipeline(provider, provider.model, defaultInput(), (s) => stagesSeen.push(s))).rejects.toThrow(/schema validation failed/);

    const lastStages = stagesSeen.at(-1);
    const contextStage = lastStages.find((s) => s.id === "context");
    expect(contextStage.status).toBe("failed");
  });

  it("falls back to a computed-metrics-only explanation when the decision-explanation call fails, without failing the whole pipeline", async () => {
    const handlers = { ...defaultHandlers(), "decision-explanation": () => { throw new Error("provider unavailable") } };
    const provider = createFakePipelineProvider({ handlers });

    const result = await runPipeline(provider, provider.model, defaultInput(), () => {});
    expect(result.decision_result.recommended_candidate_id).toBeTruthy();
    expect(result.decision_result.key_reason).toMatch(/ranked highest/);
  });

  it("does not fail the whole run when the pairing batch request itself fails — pairing is reported as honestly unavailable", async () => {
    const handlers = { ...defaultHandlers(), "batch-pairing-analysis": () => { throw new Error("pairing provider error"); } };
    const provider = createFakePipelineProvider({ handlers });

    const result = await runPipeline(provider, provider.model, defaultInput({ enablePairing: true }), () => {});
    expect(result.decision_result.recommended_candidate_id).toBeTruthy();
    expect(result.pairing_result.status).toBe("unavailable");
    expect(result.pairing_result.best_pair).toBeNull();
    expect(result.pairing_result.top_pairs).toEqual([]);
  });
});

describe("runPipeline — batch candidate scoring identity validation", () => {
  it("maps results by candidate_id (order-independent), never by array position", () => {
    const results = [{ candidate_id: "b" }, { candidate_id: "a" }];
    expect(mapBatchResultsById(results, ["a", "b"])).toEqual([{ candidate_id: "a" }, { candidate_id: "b" }]);
  });

  it("rejects a batch missing a result for a submitted candidate", () => {
    const results = [{ candidate_id: "a" }];
    expect(() => mapBatchResultsById(results, ["a", "b"])).toThrow(BatchIntegrityError);
  });

  it("rejects a batch containing an unknown candidate_id", () => {
    const results = [{ candidate_id: "a" }, { candidate_id: "z" }];
    expect(() => mapBatchResultsById(results, ["a"])).toThrow(BatchIntegrityError);
  });

  it("rejects a batch with a duplicate candidate_id", () => {
    const results = [{ candidate_id: "a" }, { candidate_id: "a" }];
    expect(() => mapBatchResultsById(results, ["a"])).toThrow(BatchIntegrityError);
  });

  it("does not insert a default score for a missing candidate — the pipeline fails the stage honestly instead", async () => {
    const handlers = {
      ...defaultHandlers(),
      "batch-candidate-scoring": (request) => {
        // Deliberately omit candidate "b" from the response.
        const ids = [...request.prompt.matchAll(/candidate_id: (\S+)/g)].map((m) => m[1]).filter((id) => id !== "b");
        return { results: ids.map((id) => ({ candidate_id: id, criteria_scores: criteriaScoresFixture(6), strengths: ["s"], weaknesses: ["w"], best_fit_contexts: ["c"] })) };
      },
    };
    const provider = createFakePipelineProvider({ handlers });
    await expect(runPipeline(provider, provider.model, defaultInput({ candidateIds: ["a", "b"] }), () => {})).rejects.toThrow();
  });

  it("performs at most one corrective retry, then fails, when the batch never becomes complete", async () => {
    const provider = createFakePipelineProvider({
      handlers: { ...defaultHandlers(), "batch-candidate-scoring": () => ({ results: [{ candidate_id: "a", criteria_scores: criteriaScoresFixture(6), strengths: [], weaknesses: [], best_fit_contexts: [] }] }) },
    });
    await expect(runPipeline(provider, provider.model, defaultInput({ candidateIds: ["a", "b"] }), () => {})).rejects.toThrow();
    const scoringCalls = provider.calls.filter((c) => c.promptId === "batch-candidate-scoring");
    expect(scoringCalls).toHaveLength(2); // one initial attempt + one corrective retry, never more
  });

  it("succeeds on the corrective retry when the second attempt is complete", async () => {
    let attempt = 0;
    const provider = createFakePipelineProvider({
      handlers: {
        ...defaultHandlers(),
        "batch-candidate-scoring": (request) => {
          attempt += 1;
          // Only match a real candidate block (immediately followed by
          // "Name:"), not the corrective-retry note's own mention of the
          // same candidate_id.
          const ids = [...request.prompt.matchAll(/candidate_id: (\S+)\nName:/g)].map((m) => m[1]);
          const usable = attempt === 1 ? ids.slice(0, 1) : ids; // first attempt incomplete, second complete
          return { results: usable.map((id) => ({ candidate_id: id, criteria_scores: criteriaScoresFixture(6), strengths: [], weaknesses: [], best_fit_contexts: [] })) };
        },
      },
    });
    const result = await runPipeline(provider, provider.model, defaultInput({ candidateIds: ["a", "b"] }), () => {});
    expect(result.candidate_evaluations).toHaveLength(2);
  });
});

describe("runPipeline — batch pairing requires complete pair coverage (docs/PROJECT_STATUS.md)", () => {
  function pairResult(a, b) {
    return {
      candidate_id_a: a, candidate_id_b: b,
      scenario_coverage: 0.8, complementarity: 0.7, overlap_risk: 0.2,
      conflict_risk: 0.1, execution_cohesion: 0.75, pair_adaptability: 0.65,
      explanation: "Complementary strengths with low overlap.",
    };
  }
  const fourCandidatePairs = [["a", "b"], ["a", "c"], ["a", "d"], ["b", "c"], ["b", "d"], ["c", "d"]];

  it("maps pair results by candidate_id_a/candidate_id_b, order-independent", () => {
    const results = [{ candidate_id_a: "b", candidate_id_b: "a" }];
    const mapped = mapPairResultsByIdentity(results, [["a", "b"]]);
    expect(mapped).toHaveLength(1);
  });

  it("accepts all six pairs for four candidates as a complete, successful result", () => {
    const results = fourCandidatePairs.map(([a, b]) => pairResult(a, b));
    const mapped = mapPairResultsByIdentity(results, fourCandidatePairs);
    expect(mapped).toHaveLength(6);
  });

  it("rejects a batch missing exactly one expected pair — a subset is never a successful result", () => {
    const results = fourCandidatePairs.slice(0, 5).map(([a, b]) => pairResult(a, b));
    expect(() => mapPairResultsByIdentity(results, fourCandidatePairs)).toThrow(BatchIntegrityError);
  });

  it("rejects a batch missing several expected pairs", () => {
    const results = fourCandidatePairs.slice(0, 3).map(([a, b]) => pairResult(a, b));
    expect(() => mapPairResultsByIdentity(results, fourCandidatePairs)).toThrow(BatchIntegrityError);
  });

  it("rejects a batch with a reversed duplicate pair (same pair, swapped order)", () => {
    const results = [pairResult("a", "b"), pairResult("b", "a")];
    expect(() => mapPairResultsByIdentity(results, [["a", "b"]])).toThrow(BatchIntegrityError);
  });

  it("rejects a batch containing an unrequested (unknown) pair", () => {
    const results = [{ candidate_id_a: "x", candidate_id_b: "y" }];
    expect(() => mapPairResultsByIdentity(results, [["a", "b"]])).toThrow(BatchIntegrityError);
  });

  it("rejects an empty result set", () => {
    expect(() => mapPairResultsByIdentity([], [["a", "b"]])).toThrow(BatchIntegrityError);
  });

  it("pipeline: succeeds only when the batch (after a corrective retry) covers every expected pair", async () => {
    let call = 0;
    const handlers = {
      ...defaultHandlers(),
      "batch-pairing-analysis": (request) => {
        call += 1;
        const pairs = [...request.prompt.matchAll(/candidate_id_a: ([^,\s]+), candidate_id_b: ([^,)\s]+)/g)].map(([, a, b]) => [a, b]);
        const usable = call === 1 ? pairs.slice(0, 5) : pairs; // first attempt missing one pair, corrective retry complete
        return { results: usable.map(([a, b]) => pairResult(a, b)) };
      },
    };
    const provider = createFakePipelineProvider({ handlers });
    const input = defaultInput({ candidateIds: ["a", "b", "c", "d"], enablePairing: true });

    const result = await runPipeline(provider, provider.model, input, () => {});

    expect(result.pairing_result.status).toBe("ok");
    expect(result.pairing_result.best_pair).toBeTruthy();
    const pairingCalls = provider.calls.filter((c) => c.promptId === "batch-pairing-analysis");
    expect(pairingCalls).toHaveLength(2); // one initial attempt + one corrective retry
  });

  it("pipeline: reports an honest unavailable result when the corrective retry is still incomplete", async () => {
    const handlers = {
      ...defaultHandlers(),
      "batch-pairing-analysis": (request) => {
        const pairs = [...request.prompt.matchAll(/candidate_id_a: ([^,\s]+), candidate_id_b: ([^,)\s]+)/g)].map(([, a, b]) => [a, b]);
        return { results: pairs.slice(0, 5).map(([a, b]) => pairResult(a, b)) }; // always missing one pair, even on retry
      },
    };
    const provider = createFakePipelineProvider({ handlers });
    const input = defaultInput({ candidateIds: ["a", "b", "c", "d"], enablePairing: true });

    const result = await runPipeline(provider, provider.model, input, () => {});

    expect(result.pairing_result).toEqual({
      status: "unavailable",
      reason: "Complete pair analysis was unavailable.",
      best_pair: null,
      top_pairs: [],
    });
    const pairingCalls = provider.calls.filter((c) => c.promptId === "batch-pairing-analysis");
    expect(pairingCalls).toHaveLength(2); // exactly one corrective retry, never more

    const serialized = JSON.stringify(result.pairing_result);
    // These are the exact fabricated values the old "Default pair"
    // fallback invented — none may appear anywhere in an unavailable result.
    expect(serialized).not.toMatch(/7\.0/);
    expect(serialized).not.toMatch(/0\.75/);
    expect(serialized).not.toMatch(/0\.7/);
    expect(serialized).not.toMatch(/Default pair/i);
  });

  it("reports an honest unavailable result with no invented pair name, score, or metric when the pairing call itself fails entirely", async () => {
    const handlers = { ...defaultHandlers(), "batch-pairing-analysis": () => { throw new Error("pairing provider error"); } };
    const provider = createFakePipelineProvider({ handlers });

    const result = await runPipeline(provider, provider.model, defaultInput({ enablePairing: true }), () => {});

    expect(result.pairing_result).toEqual({
      status: "unavailable",
      reason: "Complete pair analysis was unavailable.",
      best_pair: null,
      top_pairs: [],
    });
  });

  it("still produces a full decision result (pairing is optional) when pairing is unavailable", async () => {
    const handlers = { ...defaultHandlers(), "batch-pairing-analysis": () => { throw new Error("pairing provider error"); } };
    const provider = createFakePipelineProvider({ handlers });

    const result = await runPipeline(provider, provider.model, defaultInput({ enablePairing: true }), () => {});
    expect(result.decision_result.recommended_candidate_id).toBeTruthy();
    expect(result.candidate_evaluations.length).toBeGreaterThan(0);
  });

  it("still records attempts/usage consumed by a pairing stage that ultimately failed", async () => {
    const handlers = {
      ...defaultHandlers(),
      "batch-pairing-analysis": (request) => {
        const pairs = [...request.prompt.matchAll(/candidate_id_a: ([^,\s]+), candidate_id_b: ([^,)\s]+)/g)].map(([, a, b]) => [a, b]);
        return { results: pairs.slice(0, 5).map(([a, b]) => pairResult(a, b)) }; // always incomplete
      },
    };
    const provider = createFakePipelineProvider({ handlers });
    const input = defaultInput({ candidateIds: ["a", "b", "c", "d"], enablePairing: true });

    const result = await runPipeline(provider, provider.model, input, () => {});

    expect(result.pairing_result.status).toBe("unavailable");
    // Two real attempts were made (initial + corrective retry) even though
    // the stage never produced a usable result — that spend is still
    // honestly reflected in run_metadata, not silently dropped.
    expect(result.run_metadata.attempts.pairing).toBe(2);
    expect(result.run_metadata.providerAttemptCount).toBeGreaterThanOrEqual(2);
  });
});

describe("confidenceEvidenceReview — accurate naming, not a bias-detection claim", () => {
  it("flags low confidence and short evidence without claiming demographic/legal bias detection", () => {
    const scoring = {
      candidate_id: "x", candidate_name: "X",
      criteria_scores: { domain_expertise: { score: 5, confidence: 0.4, evidence: "short", reasoning: "r" } },
    };
    const review = confidenceEvidenceReview(scoring, 0.5);
    expect(review.recommend_human_review).toBe(true);
    expect(review.review_summary).not.toMatch(/demographic|legal|protected/i);
  });
});
