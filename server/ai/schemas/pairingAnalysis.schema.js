import { z } from "zod";

/**
 * Pairing Agent output, one call per candidate pair. All six metrics are
 * now required (schema-validated with a retry on failure) rather than the
 * pre-migration `?? 0.7`-style silent defaults — an invalid response is
 * now rejected and retried, not quietly papered over.
 */
export const pairingAnalysisSchema = z.object({
  scenario_coverage: z.number().min(0).max(1),
  complementarity: z.number().min(0).max(1),
  overlap_risk: z.number().min(0).max(1),
  conflict_risk: z.number().min(0).max(1),
  execution_cohesion: z.number().min(0).max(1),
  pair_adaptability: z.number().min(0).max(1),
  explanation: z.string().max(400),
});

export const PAIRING_ANALYSIS_PROMPT_ID = "pairing-analysis";
export const PAIRING_ANALYSIS_PROMPT_VERSION = "v1";
