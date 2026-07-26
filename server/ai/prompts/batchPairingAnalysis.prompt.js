import { BATCH_PAIRING_ANALYSIS_PROMPT_ID, BATCH_PAIRING_ANALYSIS_PROMPT_VERSION } from "../schemas/batchPairingAnalysis.schema.js";

export const promptId = BATCH_PAIRING_ANALYSIS_PROMPT_ID;
export const promptVersion = BATCH_PAIRING_ANALYSIS_PROMPT_VERSION;

/**
 * Evaluates every relevant pair among the top-ranked candidates in a
 * single request (previously one request per pair — docs/decisions/
 * ADR-0004-single-openai-provider.md). Each pair is listed explicitly with
 * both candidate IDs so the model can echo them back per result; the
 * pipeline validates the returned pair set against the requested set by
 * those IDs, never by array position.
 * @param {{ scenario: string, candidates: Array<{ id: string, name: string, strengths: string[], strategicLabel: string }>, pairs: Array<[string, string]> }} input
 */
export function buildBatchPairingAnalysisPrompt(input) {
  const system =
    "You are a leadership team dynamics expert. All numeric values must be between 0.0 and 1.0. " +
    "Return exactly one result per pair listed below, using the exact candidate_id_a/candidate_id_b values given — no more, no fewer, and never invent a pair that was not listed.";

  const byId = new Map(input.candidates.map((c) => [c.id, c]));
  const pairBlocks = input.pairs
    .map(([aId, bId]) => {
      const a = byId.get(aId);
      const b = byId.get(bId);
      return `Pair (candidate_id_a: ${aId}, candidate_id_b: ${bId}):\n${a.name}: strengths=${a.strengths.slice(0, 2).join("; ")}, label=${a.strategicLabel}\n${b.name}: strengths=${b.strengths.slice(0, 2).join("; ")}, label=${b.strategicLabel}`;
    })
    .join("\n\n");

  const prompt = `Evaluate these ${input.pairs.length} leadership pairs for ${input.scenario}:

${pairBlocks}

For each pair above, provide scenario_coverage, complementarity, overlap_risk, conflict_risk, execution_cohesion, and pair_adaptability (each 0.0-1.0), plus a brief explanation. Return one result per pair, using the same candidate_id_a/candidate_id_b values listed above.`;
  return { system, prompt };
}
