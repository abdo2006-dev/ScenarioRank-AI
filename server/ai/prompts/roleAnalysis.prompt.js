import { ROLE_ANALYSIS_PROMPT_ID, ROLE_ANALYSIS_PROMPT_VERSION } from "../schemas/roleAnalysis.schema.js";

export const promptId = ROLE_ANALYSIS_PROMPT_ID;
export const promptVersion = ROLE_ANALYSIS_PROMPT_VERSION;

/**
 * SEMANTIC CHANGE (documented, required for structured output): the
 * pre-migration prompt embedded a literal example JSON object and a
 * "Return valid JSON only, no markdown" instruction, because the model had
 * to be talked into producing parseable text. With provider-enforced
 * structured output + local Zod validation, the schema itself is the
 * single source of truth for shape — restating it as prose in the prompt
 * would just be a second, driftable copy of the same contract. The
 * substantive analytical instructions (the fixed 7 criteria, weights
 * summing to 100, complexity rating options) are unchanged.
 * @param {{ title: string, description: string, scenario: string }} input
 */
export function buildRoleAnalysisPrompt(input) {
  const system = "You are an expert organizational psychologist analyzing job roles to design evaluation criteria.";
  const prompt = `Analyze this role and propose evaluation weights.
Role: ${input.title}
Description: ${input.description}
Scenario: ${input.scenario}

Provide the seven fixed criteria (domain_expertise, transformation_leadership, operational_execution, stakeholder_management, crisis_management, innovation_digital, strategic_scalability), baseline weights for each that sum to 100, the 1-3 most critical must-have criteria from that same list, a one-sentence role success definition, and a complexity rating of low, medium, or high.`;
  return { system, prompt };
}
