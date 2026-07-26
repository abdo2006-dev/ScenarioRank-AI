import { BATCH_CANDIDATE_SCORING_PROMPT_ID, BATCH_CANDIDATE_SCORING_PROMPT_VERSION } from "../schemas/batchCandidateScoring.schema.js";

export const promptId = BATCH_CANDIDATE_SCORING_PROMPT_ID;
export const promptVersion = BATCH_CANDIDATE_SCORING_PROMPT_VERSION;

/**
 * Scores every submitted candidate in a single request (previously one
 * request per candidate — docs/decisions/ADR-0004-single-openai-provider.md).
 * Each candidate's stable `id` is listed explicitly so the model can echo
 * it back per result; the pipeline maps results to candidates by that ID,
 * never by array position (server/pipeline/runPipeline.js,
 * `mapBatchResultsById`).
 * @param {Array<{ id: string, name: string, description: string }>} candidates
 * @param {string} scenario
 * @param {string} roleTitle
 */
export function buildBatchCandidateScoringPrompt(candidates, scenario, roleTitle) {
  const system =
    "You are an expert executive recruiter. Score every candidate listed 1-10 on each criterion. Keep evidence and reasoning brief. " +
    "Return exactly one result per candidate_id listed below — no more, no fewer, and never invent a candidate_id that was not listed.";

  const candidateBlocks = candidates
    .map((c) => `candidate_id: ${c.id}\nName: ${c.name}\nProfile: ${c.description}`)
    .join("\n\n");

  const prompt = `Evaluate these ${candidates.length} candidates for ${roleTitle} in scenario: ${scenario}.

${candidateBlocks}

For each candidate above, score 1-10 on each of the seven criteria (domain_expertise, transformation_leadership, operational_execution, stakeholder_management, crisis_management, innovation_digital, strategic_scalability), with a 0-1 confidence, brief evidence, and brief reasoning for each. Also provide strengths, weaknesses, and best-fit contexts. Return one result per candidate_id, matching the candidate_id values listed above exactly.`;
  return { system, prompt };
}
