import { z } from "zod";

/**
 * The pipeline only ever pairs the top four deterministically-ranked
 * candidates (docs/architecture/KNOWN_LIMITATIONS.md P0.1), so the
 * maximum number of unique pairs in one batch is C(4,2) = 6. This is a
 * fixed architectural fact, not a runtime config value, unlike
 * AI_MAX_CANDIDATES.
 */
export const MAX_PAIRS_PER_BATCH = 6;

const pairResultSchema = z.object({
  // Both candidate IDs are required so the pipeline can validate pair
  // identity (reject a duplicate, missing, or unknown pair) rather than
  // trusting array position — docs/decisions/ADR-0004-single-openai-provider.md.
  candidate_id_a: z.string().max(100),
  candidate_id_b: z.string().max(100),
  scenario_coverage: z.number().min(0).max(1),
  complementarity: z.number().min(0).max(1),
  overlap_risk: z.number().min(0).max(1),
  conflict_risk: z.number().min(0).max(1),
  execution_cohesion: z.number().min(0).max(1),
  pair_adaptability: z.number().min(0).max(1),
  explanation: z.string().max(400),
});

/**
 * One provider request evaluates every relevant pair among the top four
 * ranked candidates (previously one request per pair). As with batch
 * candidate scoring, Zod validates each pair's own shape; whether the
 * *set* of pairs returned matches exactly the set requested (no
 * duplicate, missing, or unknown pair) is validated in
 * server/pipeline/runPipeline.js after this schema succeeds.
 */
export const batchPairingAnalysisSchema = z.object({
  results: z.array(pairResultSchema).min(1).max(MAX_PAIRS_PER_BATCH),
});

export const BATCH_PAIRING_ANALYSIS_PROMPT_ID = "batch-pairing-analysis";
export const BATCH_PAIRING_ANALYSIS_PROMPT_VERSION = "v1";
export const BATCH_PAIRING_ANALYSIS_SCHEMA_VERSION = "v1";
