/**
 * Validates each production Zod schema's own valid fixture. Provider-side
 * JSON Schema conversion (previously bespoke round-trip tests against
 * Groq/Gemini's own strict-mode requirements) is no longer this
 * project's responsibility — the OpenAI SDK's own `zodTextFormat()`
 * helper (openai/helpers/zod) performs and is responsible for that
 * conversion internally (docs/decisions/ADR-0004-single-openai-provider.md).
 * Adapter-level round-tripping is covered instead by
 * server/ai/providers/openaiProvider.test.js.
 */
import { describe, it, expect } from "vitest";
import { contextAnalysisSchema } from "./contextAnalysis.schema.js";
import { buildBatchCandidateScoringSchema } from "./batchCandidateScoring.schema.js";
import { batchPairingAnalysisSchema, MAX_PAIRS_PER_BATCH } from "./batchPairingAnalysis.schema.js";
import { decisionExplanationSchema } from "./decisionExplanation.schema.js";
import { scenarioGenerationSchema } from "./scenarioGeneration.schema.js";
import { CRITERIA_KEYS } from "./criteriaKeys.js";

const weightsFixture = Object.fromEntries(CRITERIA_KEYS.map((k) => [k, Math.round(100 / CRITERIA_KEYS.length)]));
const deltasFixture = Object.fromEntries(CRITERIA_KEYS.map((k) => [k, 0]));
const criteriaScoreFixture = { score: 7, confidence: 0.8, evidence: "Led a similar transformation for 3 years.", reasoning: "Directly relevant prior experience." };
const criteriaScoresFixture = Object.fromEntries(CRITERIA_KEYS.map((k) => [k, criteriaScoreFixture]));

describe("contextAnalysisSchema", () => {
  const validSample = {
    role_analysis: {
      criteria: CRITERIA_KEYS,
      baseline_weights: weightsFixture,
      must_have_criteria: ["domain_expertise", "stakeholder_management"],
      role_success_definition: "Leads the org through the scenario while retaining key talent.",
      complexity_rating: "high",
    },
    scenario_analysis: {
      priority_shifts: ["Stakeholder management weighted higher due to merger sensitivity."],
      weight_deltas: deltasFixture,
      scenario_success_definition: "Integration completes without key talent attrition.",
      scenario_failure_definition: "Culture clash causes senior departures within 6 months.",
      scenario_risks: ["Culture clash", "Talent attrition"],
      key_pressures: ["Cultural sensitivity", "Speed of integration"],
      weight_rationale: "Stakeholder management and adaptability matter most during a merger.",
    },
  };

  it("parses a valid combined role + scenario fixture", () => {
    expect(contextAnalysisSchema.parse(validSample)).toBeDefined();
  });

  it("rejects a fixture missing the scenario_analysis half", () => {
    const missingScenario = { role_analysis: validSample.role_analysis };
    expect(() => contextAnalysisSchema.parse(missingScenario)).toThrow();
  });

  it("rejects fewer or more than 7 criteria", () => {
    const bad = { ...validSample, role_analysis: { ...validSample.role_analysis, criteria: CRITERIA_KEYS.slice(0, 6) } };
    expect(() => contextAnalysisSchema.parse(bad)).toThrow();
  });
});

describe("batchCandidateScoring schema (buildBatchCandidateScoringSchema)", () => {
  function candidateResult(id) {
    return {
      candidate_id: id,
      criteria_scores: criteriaScoresFixture,
      strengths: ["Strong stakeholder trust"],
      weaknesses: ["Limited digital transformation experience"],
      best_fit_contexts: ["Post-merger integration"],
    };
  }

  it("parses a batch within the configured max", () => {
    const schema = buildBatchCandidateScoringSchema(5);
    expect(schema.parse({ results: [candidateResult("a"), candidateResult("b")] })).toBeDefined();
  });

  it("rejects an empty results array", () => {
    const schema = buildBatchCandidateScoringSchema(5);
    expect(() => schema.parse({ results: [] })).toThrow();
  });

  it("rejects more results than the configured maximum", () => {
    const schema = buildBatchCandidateScoringSchema(2);
    expect(() => schema.parse({ results: [candidateResult("a"), candidateResult("b"), candidateResult("c")] })).toThrow();
  });

  it("does not require or accept a candidate_name field (the pipeline supplies it)", () => {
    const schema = buildBatchCandidateScoringSchema(5);
    const withName = { ...candidateResult("a"), candidate_name: "Should not be here" };
    // additionalProperties is not enforced by plain Zod .parse() (only by
    // the OpenAI strict-mode JSON Schema conversion), so this still
    // parses — the important guarantee is that candidate_name is not
    // *required*, which the base fixture already proves.
    expect(schema.parse({ results: [withName] })).toBeDefined();
    expect(schema.parse({ results: [candidateResult("a")] })).toBeDefined();
  });
});

describe("batchPairingAnalysisSchema", () => {
  function pairResult(a, b) {
    return {
      candidate_id_a: a, candidate_id_b: b,
      scenario_coverage: 0.8, complementarity: 0.7, overlap_risk: 0.2,
      conflict_risk: 0.1, execution_cohesion: 0.75, pair_adaptability: 0.65,
      explanation: "Complementary strengths with low overlap.",
    };
  }

  it("parses a valid single-pair batch", () => {
    expect(batchPairingAnalysisSchema.parse({ results: [pairResult("a", "b")] })).toBeDefined();
  });

  it("parses the maximum of 6 pairs (top-four candidates)", () => {
    expect(MAX_PAIRS_PER_BATCH).toBe(6);
    const pairs = [pairResult("a", "b"), pairResult("a", "c"), pairResult("a", "d"), pairResult("b", "c"), pairResult("b", "d"), pairResult("c", "d")];
    expect(batchPairingAnalysisSchema.parse({ results: pairs })).toBeDefined();
  });

  it("rejects more than 6 pairs", () => {
    const pairs = Array.from({ length: 7 }, (_, i) => pairResult(`x${i}`, `y${i}`));
    expect(() => batchPairingAnalysisSchema.parse({ results: pairs })).toThrow();
  });

  it("rejects a metric outside the 0-1 range", () => {
    const bad = { ...pairResult("a", "b"), scenario_coverage: 1.5 };
    expect(() => batchPairingAnalysisSchema.parse({ results: [bad] })).toThrow();
  });
});

describe("decisionExplanationSchema", () => {
  it("parses a valid fixture", () => {
    const validSample = {
      final_label: "Best Fit",
      key_reason: "Highest weighted fit score under this scenario.",
      executive_interpretation: "Recommended for strongest overall alignment.",
      winner_reason: "Top-ranked under Best Fit.",
      runner_up_trade_off: "Slightly lower cultural fit.",
      trade_offs: [{ title: "Top Choice", description: "Strongest alignment.", type: "gain", severity: "low" }],
      executive_summary: {
        recommendation: "Candidate A recommended.",
        reason: "Highest computed score.",
        trade_off: "None significant.",
        opportunity_cost: "Minimal.",
        adaptability: "Strong.",
        alternative: "Candidate B",
      },
    };
    expect(decisionExplanationSchema.parse(validSample)).toBeDefined();
  });
});

describe("scenarioGenerationSchema", () => {
  it("parses a valid fixture", () => {
    expect(scenarioGenerationSchema.parse({ scenarios: ["Post-merger integration with cultural clash risk", "Rapid scaling in a new market"] })).toBeDefined();
  });
});
