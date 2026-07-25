import { SCENARIO_ANALYSIS_PROMPT_ID, SCENARIO_ANALYSIS_PROMPT_VERSION } from "../schemas/scenarioAnalysis.schema.js";

export const promptId = SCENARIO_ANALYSIS_PROMPT_ID;
export const promptVersion = SCENARIO_ANALYSIS_PROMPT_VERSION;

/**
 * SEMANTIC CHANGE (documented, required for structured output): dropped
 * the inline JSON template and the "weight_deltas must be plain integers,
 * never use a + prefix" instruction. The former is now the schema's job;
 * the latter existed only to prevent the freeform-text pre-migration path
 * from emitting `+5` (invalid JSON, needed the sanitizeJSON() repair this
 * migration removes) — structured output APIs return well-formed numbers
 * directly, so the instruction no longer applies. `priority_shifts` is
 * now requested as a short list, not a keyed object — see
 * server/ai/schemas/scenarioAnalysis.schema.js for why.
 * @param {{ scenario: string, roleTitle: string, baselineWeights: Record<string, number> }} input
 */
export function buildScenarioAnalysisPrompt(input) {
  const system = `You are a strategic leadership analyst assessing how a specific business scenario should shift evaluation priorities.
Criteria: domain_expertise, transformation_leadership, operational_execution, stakeholder_management, crisis_management, innovation_digital, strategic_scalability.`;
  const prompt = `Analyze scenario weight adjustments:
Role: ${input.roleTitle}
Scenario: ${input.scenario}
Baseline weights: ${JSON.stringify(input.baselineWeights)}

Provide: a short list of priority shifts and why; weight deltas for each of the 7 criteria (integers, positive or negative, relative to baseline); a scenario success definition; a scenario failure definition; a list of scenario risks; a list of key pressures; and a short rationale for the weight changes.`;
  return { system, prompt };
}
