import { describe, it, expect } from "vitest";
import { toJsonSchema, toGroqResponseFormat, toGeminiResponseConfig } from "../schemaConversion.js";
import { createGroqProvider } from "../providers/groqProvider.js";
import { createGeminiProvider } from "../providers/geminiProvider.js";
import { createFakeGroqClient } from "../providers/testSupport/fakeGroqClient.js";
import { createFakeGeminiClient } from "../providers/testSupport/fakeGeminiClient.js";

import { roleAnalysisSchema, ROLE_ANALYSIS_PROMPT_ID, ROLE_ANALYSIS_PROMPT_VERSION } from "./roleAnalysis.schema.js";
import { scenarioAnalysisSchema, SCENARIO_ANALYSIS_PROMPT_ID, SCENARIO_ANALYSIS_PROMPT_VERSION } from "./scenarioAnalysis.schema.js";
import { candidateScoringSchema, CANDIDATE_SCORING_PROMPT_ID, CANDIDATE_SCORING_PROMPT_VERSION } from "./candidateScoring.schema.js";
import { decisionExplanationSchema, DECISION_EXPLANATION_PROMPT_ID, DECISION_EXPLANATION_PROMPT_VERSION } from "./decisionExplanation.schema.js";
import { pairingAnalysisSchema, PAIRING_ANALYSIS_PROMPT_ID, PAIRING_ANALYSIS_PROMPT_VERSION } from "./pairingAnalysis.schema.js";
import { scenarioGenerationSchema, SCENARIO_GENERATION_PROMPT_ID, SCENARIO_GENERATION_PROMPT_VERSION } from "./scenarioGeneration.schema.js";
import { CRITERIA_KEYS } from "./criteriaKeys.js";

const weightsFixture = Object.fromEntries(CRITERIA_KEYS.map((k) => [k, Math.round(100 / CRITERIA_KEYS.length)]));
const criteriaScoreFixture = { score: 7, confidence: 0.8, evidence: "Led a similar transformation for 3 years.", reasoning: "Directly relevant prior experience." };
const criteriaScoresFixture = Object.fromEntries(CRITERIA_KEYS.map((k) => [k, criteriaScoreFixture]));

const PRODUCTION_SCHEMAS = [
  {
    name: "roleAnalysis",
    schema: roleAnalysisSchema,
    promptId: ROLE_ANALYSIS_PROMPT_ID,
    promptVersion: ROLE_ANALYSIS_PROMPT_VERSION,
    validSample: {
      criteria: CRITERIA_KEYS,
      baseline_weights: weightsFixture,
      must_have_criteria: ["domain_expertise", "stakeholder_management"],
      role_success_definition: "Leads the org through the scenario while retaining key talent.",
      complexity_rating: "high",
    },
  },
  {
    name: "scenarioAnalysis",
    schema: scenarioAnalysisSchema,
    promptId: SCENARIO_ANALYSIS_PROMPT_ID,
    promptVersion: SCENARIO_ANALYSIS_PROMPT_VERSION,
    validSample: {
      priority_shifts: ["Stakeholder management weighted higher due to merger sensitivity."],
      weight_deltas: Object.fromEntries(CRITERIA_KEYS.map((k) => [k, 0])),
      scenario_success_definition: "Integration completes without key talent attrition.",
      scenario_failure_definition: "Culture clash causes senior departures within 6 months.",
      scenario_risks: ["Culture clash", "Talent attrition"],
      key_pressures: ["Cultural sensitivity", "Speed of integration"],
      weight_rationale: "Stakeholder management and adaptability matter most during a merger.",
    },
  },
  {
    name: "candidateScoring",
    schema: candidateScoringSchema,
    promptId: CANDIDATE_SCORING_PROMPT_ID,
    promptVersion: CANDIDATE_SCORING_PROMPT_VERSION,
    validSample: {
      candidate_id: "c1",
      candidate_name: "Fictional Candidate A",
      criteria_scores: criteriaScoresFixture,
      strengths: ["Strong stakeholder trust", "Calm under pressure"],
      weaknesses: ["Limited digital transformation experience"],
      best_fit_contexts: ["Post-merger integration"],
    },
  },
  {
    name: "decisionExplanation",
    schema: decisionExplanationSchema,
    promptId: DECISION_EXPLANATION_PROMPT_ID,
    promptVersion: DECISION_EXPLANATION_PROMPT_VERSION,
    validSample: {
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
    },
  },
  {
    name: "pairingAnalysis",
    schema: pairingAnalysisSchema,
    promptId: PAIRING_ANALYSIS_PROMPT_ID,
    promptVersion: PAIRING_ANALYSIS_PROMPT_VERSION,
    validSample: {
      scenario_coverage: 0.8,
      complementarity: 0.7,
      overlap_risk: 0.2,
      conflict_risk: 0.1,
      execution_cohesion: 0.75,
      pair_adaptability: 0.65,
      explanation: "Complementary strengths with low overlap.",
    },
  },
  {
    name: "scenarioGeneration",
    schema: scenarioGenerationSchema,
    promptId: SCENARIO_GENERATION_PROMPT_ID,
    promptVersion: SCENARIO_GENERATION_PROMPT_VERSION,
    validSample: {
      scenarios: ["Post-merger integration with cultural clash risk", "Rapid scaling in a new market"],
    },
  },
];

// Same conservative-keyword guard used in Phase 1A's schemaConversion.test.js.
const ADVANCED_KEYWORDS = ["$ref", "anyOf", "oneOf", "allOf", "not", "if", "then", "else", "patternProperties", "$dynamicRef"];

describe.each(PRODUCTION_SCHEMAS)("$name schema", ({ name, schema, promptId, promptVersion, validSample }) => {
  it("parses its own valid fixture", () => {
    expect(schema.parse(validSample)).toBeDefined();
  });

  it("converts to a flat JSON Schema with no $ref/$defs anywhere", () => {
    const jsonSchema = toJsonSchema(schema);
    const serialized = JSON.stringify(jsonSchema);
    expect(serialized).not.toContain('"$ref"');
    expect(serialized).not.toContain('"$defs"');
    expect(jsonSchema.definitions).toBeUndefined();
  });

  it("uses only conservative, portable JSON Schema keywords", () => {
    const serialized = JSON.stringify(toJsonSchema(schema));
    for (const keyword of ADVANCED_KEYWORDS) {
      expect(serialized, `${name} unexpectedly uses "${keyword}"`).not.toContain(`"${keyword}"`);
    }
  });

  it("is strict-mode structurally valid for Groq at every nesting level (additionalProperties:false + all properties required)", () => {
    function assertStrict(node, path) {
      if (node.type === "object" && node.properties) {
        expect(node.additionalProperties, `${name}${path}: additionalProperties must be false`).toBe(false);
        const propNames = Object.keys(node.properties);
        expect(node.required ?? [], `${name}${path}: every property must be required for strict mode`).toEqual(
          expect.arrayContaining(propNames)
        );
        for (const [key, child] of Object.entries(node.properties)) assertStrict(child, `${path}.${key}`);
      }
      if (node.type === "array" && node.items) assertStrict(node.items, `${path}[]`);
    }
    assertStrict(toJsonSchema(schema), "");
  });

  it("produces the exact Groq strict-mode response_format wrapper", () => {
    const format = toGroqResponseFormat(schema, promptId);
    expect(format).toEqual({
      type: "json_schema",
      json_schema: { name: promptId, strict: true, schema: toJsonSchema(schema) },
    });
  });

  it("produces the exact Gemini responseJsonSchema config", () => {
    const config = toGeminiResponseConfig(schema);
    expect(config).toEqual({ responseMimeType: "application/json", responseJsonSchema: toJsonSchema(schema) });
  });

  it("round-trips through the real Groq adapter with a schema-valid fake response", async () => {
    const client = createFakeGroqClient([{ type: "success", text: JSON.stringify(validSample) }]);
    const provider = createGroqProvider({ apiKey: "unit-test-groq-credential", model: "test-model", client });
    const result = await provider.generateStructured({
      system: "sys", prompt: "user", schema, promptId, promptVersion,
    });
    expect(result.data).toEqual(schema.parse(validSample));
    expect(result.meta.provider).toBe("groq");
  });

  it("round-trips through the real Gemini adapter with a schema-valid fake response", async () => {
    const client = createFakeGeminiClient([{ type: "success", text: JSON.stringify(validSample) }]);
    const provider = createGeminiProvider({ apiKey: "unit-test-gemini-credential", model: "test-model", client });
    const result = await provider.generateStructured({
      system: "sys", prompt: "user", schema, promptId, promptVersion,
    });
    expect(result.data).toEqual(schema.parse(validSample));
    expect(result.meta.provider).toBe("gemini");
  });
});
