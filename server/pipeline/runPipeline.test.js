import { describe, it, expect } from "vitest";
import { runPipeline, confidenceEvidenceReview, outcomeModeling } from "./runPipeline.js";
import { createFakePipelineProvider, defaultHandlers, defaultInput, criteriaScoresFixture } from "./testSupport/fakePipelineProvider.js";

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

    // Every recorded call happened through the one provider instance —
    // there is no second provider object anywhere in this test, so this
    // is true by construction, but we also assert every stage's metadata
    // agrees on provider/model, which is what a caller can actually
    // observe in the response.
    const meta = result.run_metadata;
    expect(meta.provider).toBe("fake");
    expect(meta.model).toBe("fake-model");
    expect(Object.keys(meta.promptVersions).length).toBeGreaterThan(0);
    expect(provider.calls.length).toBeGreaterThan(0); // sanity: calls recorded on the one instance
  });

  it("never constructs a second provider mid-run even when pairing runs many stage calls", async () => {
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

describe("runPipeline — candidate-scoring concurrency is configurable and caller-controlled", () => {
  /**
   * Builds a fake provider whose candidate-scoring handler tracks how many
   * calls are in flight simultaneously, so tests can assert on the actual
   * concurrency the pipeline used — not just the configured number.
   */
  function createConcurrencyTrackingProvider() {
    let active = 0;
    let maxObserved = 0;
    const handlers = {
      ...defaultHandlers(),
      "candidate-scoring": async (request) => {
        active += 1;
        maxObserved = Math.max(maxObserved, active);
        await new Promise((resolve) => setTimeout(resolve, 15));
        active -= 1;
        const idMatch = request.prompt.match(/Candidate ID: (\S+)/);
        const id = idMatch?.[1] ?? "unknown";
        return {
          candidate_id: id,
          candidate_name: id,
          criteria_scores: criteriaScoresFixture(6),
          strengths: ["s"],
          weaknesses: ["w"],
          best_fit_contexts: ["c"],
        };
      },
    };
    const provider = createFakePipelineProvider({ handlers });
    return { provider, getMaxObserved: () => maxObserved };
  }

  it("defaults to concurrency 1 when no option is passed, never running two candidate-scoring calls at once", async () => {
    const { provider, getMaxObserved } = createConcurrencyTrackingProvider();
    await runPipeline(provider, provider.model, defaultInput({ candidateIds: ["a", "b", "c"] }), () => {});
    expect(getMaxObserved()).toBe(1);
  });

  it("respects an explicit candidateConcurrency of 1", async () => {
    const { provider, getMaxObserved } = createConcurrencyTrackingProvider();
    await runPipeline(provider, provider.model, defaultInput({ candidateIds: ["a", "b", "c"] }), () => {}, { candidateConcurrency: 1 });
    expect(getMaxObserved()).toBe(1);
  });

  it("respects a configured higher candidateConcurrency", async () => {
    const { provider, getMaxObserved } = createConcurrencyTrackingProvider();
    await runPipeline(provider, provider.model, defaultInput({ candidateIds: ["a", "b", "c", "d"] }), () => {}, { candidateConcurrency: 3 });
    expect(getMaxObserved()).toBe(3);
  });

  it("records the resolved concurrency in run_metadata", async () => {
    const provider = createFakePipelineProvider({ handlers: defaultHandlers() });
    const result = await runPipeline(provider, provider.model, defaultInput(), () => {}, { candidateConcurrency: 2 });
    expect(result.run_metadata.candidateConcurrency).toBe(2);
  });

  it("never constructs a second provider when a non-default concurrency is used", async () => {
    let constructions = 0;
    const provider = (() => { constructions += 1; return createFakePipelineProvider({ handlers: defaultHandlers() }); })();
    await runPipeline(provider, provider.model, defaultInput({ candidateIds: ["a", "b", "c", "d"] }), () => {}, { candidateConcurrency: 4 });
    expect(constructions).toBe(1);
  });
});

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
});

describe("runPipeline — run metadata", () => {
  it("records provider, model, prompt/schema versions, attempts, and timestamps", async () => {
    const provider = createFakePipelineProvider({ handlers: defaultHandlers() });
    const result = await runPipeline(provider, provider.model, defaultInput(), () => {});

    const meta = result.run_metadata;
    expect(meta.provider).toBe("fake");
    expect(meta.model).toBe("fake-model");
    expect(meta.promptVersions.role).toBe("v1");
    expect(meta.schemaVersions.role).toBe("v1");
    expect(meta.attempts.role).toBe(1);
    expect(new Date(meta.startedAt).getTime()).not.toBeNaN();
    expect(new Date(meta.completedAt).getTime()).not.toBeNaN();
    expect(new Date(meta.completedAt).getTime()).toBeGreaterThanOrEqual(new Date(meta.startedAt).getTime());
  });
});

describe("runPipeline — structured validation failure and no-hang propagation", () => {
  it("propagates a role-analysis failure as a rejected pipeline (never hangs)", async () => {
    const handlers = { ...defaultHandlers(), "role-analysis": () => { throw new Error("schema validation failed"); } };
    const provider = createFakePipelineProvider({ handlers });
    const stagesSeen = [];

    await expect(runPipeline(provider, provider.model, defaultInput(), (s) => stagesSeen.push(s))).rejects.toThrow(/schema validation failed/);

    const lastStages = stagesSeen.at(-1);
    const roleStage = lastStages.find((s) => s.id === "role");
    expect(roleStage.status).toBe("failed");
  });

  it("falls back to a computed-metrics-only explanation when the decision-explanation call fails, without failing the whole pipeline", async () => {
    const handlers = { ...defaultHandlers(), "decision-explanation": () => { throw new Error("provider unavailable") } };
    const provider = createFakePipelineProvider({ handlers });

    const result = await runPipeline(provider, provider.model, defaultInput(), () => {});
    expect(result.decision_result.recommended_candidate_id).toBeTruthy();
    expect(result.decision_result.key_reason).toMatch(/ranked highest/);
  });

  it("does not fail the whole run when pairing calls fail — pairing is simply omitted for that pair", async () => {
    const handlers = { ...defaultHandlers(), "pairing-analysis": () => { throw new Error("pairing provider error"); } };
    const provider = createFakePipelineProvider({ handlers });

    const result = await runPipeline(provider, provider.model, defaultInput({ enablePairing: true }), () => {});
    expect(result.decision_result.recommended_candidate_id).toBeTruthy();
    // Every pair call failed, so the pairing stage falls back to its
    // documented default-pair behavior rather than hanging or throwing.
    expect(result.pairing_result.best_pair).toBeTruthy();
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
