import { z } from "zod";
import { CRITERIA_KEYS } from "./criteriaKeys.js";

const criterionScoreSchema = z.object({
  score: z.number().min(1).max(10),
  confidence: z.number().min(0).max(1),
  evidence: z.string().max(400),
  reasoning: z.string().max(400),
});

const criteriaScoresShape = Object.fromEntries(CRITERIA_KEYS.map((k) => [k, criterionScoreSchema]));

const candidateScoringResultSchema = z.object({
  // The stable input candidate ID, echoed back so the pipeline can map
  // each result to the candidate it was actually about — never by array
  // position (docs/decisions/ADR-0004-single-openai-provider.md, batch
  // candidate scoring). candidate_name is deliberately NOT requested here:
  // the pipeline already knows it from the submitted candidate and never
  // trusted the model's echo of it even in the pre-batching per-candidate
  // schema, so asking for it again would only cost output tokens.
  candidate_id: z.string().max(100),
  criteria_scores: z.object(criteriaScoresShape),
  strengths: z.array(z.string().max(200)).max(6),
  weaknesses: z.array(z.string().max(200)).max(6),
  best_fit_contexts: z.array(z.string().max(160)).max(6),
});

/**
 * One provider request scores every submitted candidate (previously one
 * request per candidate). `maxCandidates` bounds the array to the
 * configured AI_MAX_CANDIDATES so the schema itself cannot accept more
 * results than the pipeline is willing to send candidates for.
 *
 * Zod only validates each item's own shape — it cannot know whether the
 * *set* of `candidate_id`s returned matches what was actually submitted
 * (no duplicates, none missing, none unknown). That cross-batch identity
 * check is business logic performed in server/pipeline/runPipeline.js
 * after this schema's validation succeeds (see `mapBatchResultsById`).
 * @param {number} maxCandidates
 */
export function buildBatchCandidateScoringSchema(maxCandidates) {
  return z.object({
    results: z.array(candidateScoringResultSchema).min(1).max(maxCandidates),
  });
}

export const BATCH_CANDIDATE_SCORING_PROMPT_ID = "batch-candidate-scoring";
export const BATCH_CANDIDATE_SCORING_PROMPT_VERSION = "v1";
export const BATCH_CANDIDATE_SCORING_SCHEMA_VERSION = "v1";
