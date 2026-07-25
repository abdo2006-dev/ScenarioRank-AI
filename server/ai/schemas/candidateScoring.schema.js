import { z } from "zod";
import { CRITERIA_KEYS } from "./criteriaKeys.js";

const criterionScoreSchema = z.object({
  score: z.number().min(1).max(10),
  confidence: z.number().min(0).max(1),
  evidence: z.string().max(400),
  reasoning: z.string().max(400),
});

const criteriaScoresShape = Object.fromEntries(CRITERIA_KEYS.map((k) => [k, criterionScoreSchema]));

/**
 * Candidate Scoring Agent output. `candidate_id`/`candidate_name` are
 * overwritten unconditionally by the caller after parsing (predating
 * Phase 1B), so this schema still requires them (the model must produce
 * well-formed output) but the pipeline stage does not trust their values.
 */
export const candidateScoringSchema = z.object({
  candidate_id: z.string().max(100),
  candidate_name: z.string().max(200),
  criteria_scores: z.object(criteriaScoresShape),
  strengths: z.array(z.string().max(200)).max(6),
  weaknesses: z.array(z.string().max(200)).max(6),
  best_fit_contexts: z.array(z.string().max(160)).max(6),
});

export const CANDIDATE_SCORING_PROMPT_ID = "candidate-scoring";
export const CANDIDATE_SCORING_PROMPT_VERSION = "v1";
