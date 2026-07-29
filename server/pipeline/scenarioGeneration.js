/**
 * @file AI-assisted scenario generation with a deterministic regex-based
 * fallback, used by the /api/scenarios route. Moved from server.mjs
 * (Phase 1B) with the fallback logic unchanged.
 */

import { scenarioGenerationSchema, SCENARIO_GENERATION_SCHEMA_VERSION } from "../ai/schemas/scenarioGeneration.schema.js";
import { buildScenarioGenerationPrompt, promptId, promptVersion } from "../ai/prompts/scenarioGeneration.prompt.js";

const SCENARIO_GENERATION_MAX_TOKENS = 350;
const SCENARIO_GENERATION_TIMEOUT_MS = 20000;

export function generateFallbackScenarios(title = "", description = "") {
  const text = `${title} ${description}`.toLowerCase();
  const scenarios = [];
  const push = (s) => { if (s && !scenarios.includes(s)) scenarios.push(s); };

  if (/merger|integration|culture/.test(text)) push("Post-merger integration with cultural clash risk");
  if (/scale|growth|market|expansion|geo/.test(text)) push("Rapid scaling in a new geographic market");
  if (/digital|transformation|legacy|automation|modern/.test(text)) push("Digital transformation in a legacy enterprise");
  if (/crisis|turnaround|runway|restructur|urgent/.test(text)) push("Crisis turnaround with limited runway");
  if (/launch|product|go-to-market|competitive/.test(text)) push("Greenfield product launch in competitive market");
  if (/people|culture|talent|dei|hr/.test(text)) push("Rebuilding trust and retention during organizational change");
  if (/supply chain|operations|manufacturing/.test(text)) push("Supplier disruption causing operational continuity risk");
  if (/finance|cost|efficiency/.test(text)) push("Cost pressure requiring efficiency without damaging morale");

  const generic = [
    "Rapid scaling in a new geographic market",
    "Digital transformation in a legacy enterprise",
    "Crisis turnaround with limited runway",
    "Cross-functional alignment during strategic change",
    "Greenfield product launch in competitive market",
  ];
  for (const s of generic) push(s);
  return scenarios.slice(0, 5);
}

/**
 * @param {import("../ai/types.js").AIProvider | null} provider - null when
 *   AI is unavailable; the fallback is used directly in that case.
 * @param {string} title
 * @param {string} description
 * @returns {Promise<{ scenarios: string[], source: "ai"|"fallback", note?: string }>}
 */
export async function generateScenarios(provider, title, description) {
  const fallback = generateFallbackScenarios(title, description);

  if (!provider) {
    return { scenarios: fallback, source: "fallback", note: "AI scenario generation unavailable; using local fallback scenarios." };
  }

  try {
    const { system, prompt } = buildScenarioGenerationPrompt({ title, description });
    const { data } = await provider.generateStructured({
      system, prompt, schema: scenarioGenerationSchema,
      promptId, promptVersion,
      maxOutputTokens: SCENARIO_GENERATION_MAX_TOKENS, timeoutMs: SCENARIO_GENERATION_TIMEOUT_MS,
    });
    if (!data.scenarios || data.scenarios.length === 0) {
      return { scenarios: fallback, source: "fallback", note: "AI returned no scenarios; using local fallback scenarios." };
    }
    return { scenarios: data.scenarios, source: "ai" };
  } catch {
    return { scenarios: fallback, source: "fallback", note: "AI scenario generation failed; local fallback scenarios were used." };
  }
}

export { SCENARIO_GENERATION_SCHEMA_VERSION };
