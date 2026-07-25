import { SCENARIO_GENERATION_PROMPT_ID, SCENARIO_GENERATION_PROMPT_VERSION } from "../schemas/scenarioGeneration.schema.js";

export const promptId = SCENARIO_GENERATION_PROMPT_ID;
export const promptVersion = SCENARIO_GENERATION_PROMPT_VERSION;

/**
 * SEMANTIC CHANGE (documented, required for structured output): dropped
 * the inline JSON template ("Return JSON only: {...}"). The content-quality
 * instructions (short, one line, no numbering, 4-8 words, dashboard-label
 * style) are unchanged — those describe what a good scenario label reads
 * like, not the response's JSON shape.
 * @param {{ title: string, description: string }} input
 */
export function buildScenarioGenerationPrompt(input) {
  const system = "You generate concise, executive-style scenario labels.";
  const prompt = `Generate 3 to 5 short business scenario titles for this role.

Role Title: ${input.title}
Role Description: ${input.description}

Requirements:
- each scenario must be short
- each scenario must be one line only
- no numbering
- no explanations
- no more than about 4 to 8 words if possible
- make them realistic and decision-relevant
- each scenario should read like a dashboard label, not a sentence`;
  return { system, prompt };
}
