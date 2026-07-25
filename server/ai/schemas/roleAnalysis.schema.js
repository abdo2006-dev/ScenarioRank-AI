import { z } from "zod";
import { CRITERIA_KEYS } from "./criteriaKeys.js";

const weightsShape = Object.fromEntries(CRITERIA_KEYS.map((k) => [k, z.number().min(0).max(100)]));

/**
 * Role Analysis Stage output. `criteria` is currently overwritten unconditionally
 * by the caller after parsing (a defensive guard predating Phase 1B), so
 * this schema validates shape/type, not exact string matching beyond
 * length — the overwrite behavior is preserved in the pipeline stage, not
 * here.
 */
export const roleAnalysisSchema = z.object({
  criteria: z.array(z.string().max(60)).length(7),
  baseline_weights: z.object(weightsShape),
  must_have_criteria: z.array(z.enum(CRITERIA_KEYS)).max(7),
  role_success_definition: z.string().max(300),
  complexity_rating: z.enum(["low", "medium", "high"]),
});

export const ROLE_ANALYSIS_PROMPT_ID = "role-analysis";
export const ROLE_ANALYSIS_PROMPT_VERSION = "v1";
export const ROLE_ANALYSIS_SCHEMA_VERSION = "v1";
