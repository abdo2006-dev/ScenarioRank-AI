import { CONTEXT_ANALYSIS_PROMPT_ID, CONTEXT_ANALYSIS_PROMPT_VERSION } from "../schemas/contextAnalysis.schema.js";

export const promptId = CONTEXT_ANALYSIS_PROMPT_ID;
export const promptVersion = CONTEXT_ANALYSIS_PROMPT_VERSION;

/**
 * Combines the former separate role-analysis and scenario-analysis
 * prompts into one request (docs/decisions/ADR-0004-single-openai-provider.md,
 * request-count reduction). The substantive analytical instructions from
 * both original prompts are preserved verbatim in spirit; only the
 * framing changes to ask for both outputs from a single reasoning pass.
 * @param {{ title: string, description: string, scenario: string }} input
 */
export function buildContextAnalysisPrompt(input) {
  const system =
    "You are an expert organizational psychologist and strategic leadership analyst. " +
    "You analyze job roles to design evaluation criteria, and analyze how a specific business scenario should shift those criteria's priorities. " +
    "Criteria: domain_expertise, transformation_leadership, operational_execution, stakeholder_management, crisis_management, innovation_digital, strategic_scalability.";

  const prompt = `Analyze this role and scenario together, and propose both the role's baseline evaluation weights and how the scenario should shift them.
Role: ${input.title}
Description: ${input.description}
Scenario: ${input.scenario}

First, for role_analysis: provide the seven fixed criteria (domain_expertise, transformation_leadership, operational_execution, stakeholder_management, crisis_management, innovation_digital, strategic_scalability), baseline weights for each that sum to 100, the 1-3 most critical must-have criteria from that same list, a one-sentence role success definition, and a complexity rating of low, medium, or high.

Then, for scenario_analysis, using the baseline_weights you just proposed: provide a short list of priority shifts and why; weight deltas for each of the 7 criteria (integers, positive or negative, relative to your own baseline_weights); a scenario success definition; a scenario failure definition; a list of scenario risks; a list of key pressures; and a short rationale for the weight changes.`;
  return { system, prompt };
}
