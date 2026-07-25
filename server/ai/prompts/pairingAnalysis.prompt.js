import { PAIRING_ANALYSIS_PROMPT_ID, PAIRING_ANALYSIS_PROMPT_VERSION } from "../schemas/pairingAnalysis.schema.js";

export const promptId = PAIRING_ANALYSIS_PROMPT_ID;
export const promptVersion = PAIRING_ANALYSIS_PROMPT_VERSION;

/**
 * SEMANTIC CHANGE (documented, required for structured output): dropped
 * the inline JSON template — the schema now defines the exact shape and
 * the 0-1 numeric range for every metric.
 * @param {{ scenario: string, candidateA: { name: string, strengths: string[], strategicLabel: string }, candidateB: { name: string, strengths: string[], strategicLabel: string } }} input
 */
export function buildPairingAnalysisPrompt(input) {
  const system = "You are a leadership team dynamics expert. All numeric values must be between 0.0 and 1.0.";
  const prompt = `Evaluate this leadership pair for ${input.scenario}:
${input.candidateA.name}: strengths=${input.candidateA.strengths.slice(0, 2).join("; ")}, label=${input.candidateA.strategicLabel}
${input.candidateB.name}: strengths=${input.candidateB.strengths.slice(0, 2).join("; ")}, label=${input.candidateB.strategicLabel}

Provide scenario_coverage, complementarity, overlap_risk, conflict_risk, execution_cohesion, and pair_adaptability (each 0.0-1.0), plus a brief explanation.`;
  return { system, prompt };
}
