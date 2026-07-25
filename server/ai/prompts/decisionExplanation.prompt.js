import { DECISION_EXPLANATION_PROMPT_ID, DECISION_EXPLANATION_PROMPT_VERSION } from "../schemas/decisionExplanation.schema.js";

export const promptId = DECISION_EXPLANATION_PROMPT_ID;
export const promptVersion = DECISION_EXPLANATION_PROMPT_VERSION;

/**
 * SEMANTIC CHANGE (documented, required for structured output): dropped
 * the inline JSON template — the schema now defines the exact shape. The
 * "grounded ONLY in the computed metrics" instruction is preserved
 * verbatim: it is the prompt-level half of this project's non-negotiable
 * boundary (deterministic code ranks, the model only explains) and must
 * never be softened.
 * @param {{ roleTitle: string, scenario: string, modeLabel: string, winnerName: string, rankedSummary: string }} input
 */
export function buildDecisionExplanationPrompt(input) {
  const system = "You are a senior leadership advisor. Generate explanations grounded ONLY in the computed metrics below. Do not introduce a different recommendation than the one already computed.";
  const prompt = `Generate explanations for this decision:
Role: ${input.roleTitle}, Scenario: ${input.scenario}, Mode: ${input.modeLabel}, Winner: ${input.winnerName}
${input.rankedSummary}

Provide: a final label for this decision mode; a key reason; an executive interpretation; why the winner won; the runner-up's main trade-off; a list of trade-off cards (title, description, type, severity); and an executive summary (recommendation, reason, trade-off, opportunity cost, adaptability, alternative).`;
  return { system, prompt };
}
