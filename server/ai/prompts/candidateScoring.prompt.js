import { CANDIDATE_SCORING_PROMPT_ID, CANDIDATE_SCORING_PROMPT_VERSION } from "../schemas/candidateScoring.schema.js";

export const promptId = CANDIDATE_SCORING_PROMPT_ID;
export const promptVersion = CANDIDATE_SCORING_PROMPT_VERSION;

/**
 * SEMANTIC CHANGE (documented, required for structured output): dropped
 * the inline JSON template — the schema now defines the exact shape,
 * including all seven criteria keys. The scoring instructions themselves
 * ("score 1-10", "keep evidence and reasoning brief") are unchanged.
 * @param {{ id: string, name: string, description: string }} candidate
 * @param {string} scenario
 * @param {string} roleTitle
 */
export function buildCandidateScoringPrompt(candidate, scenario, roleTitle) {
  const system = "You are an expert executive recruiter. Score candidates 1-10 on each criterion. Keep evidence and reasoning brief.";
  const prompt = `Evaluate candidate for ${roleTitle} in scenario: ${scenario}.
Candidate ID: ${candidate.id}
Candidate: ${candidate.name}
Profile: ${candidate.description}

Score this candidate 1-10 on each of the seven criteria (domain_expertise, transformation_leadership, operational_execution, stakeholder_management, crisis_management, innovation_digital, strategic_scalability), with a 0-1 confidence, brief evidence, and brief reasoning for each. Also provide strengths, weaknesses, and best-fit contexts.`;
  return { system, prompt };
}
