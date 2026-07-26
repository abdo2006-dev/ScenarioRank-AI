import { z } from "zod";
import { CRITERIA_KEYS } from "./criteriaKeys.js";

const weightsShape = Object.fromEntries(CRITERIA_KEYS.map((k) => [k, z.number().min(0).max(100)]));
const deltasShape = Object.fromEntries(CRITERIA_KEYS.map((k) => [k, z.number().min(-100).max(100)]));

/**
 * Combined Role Analysis + Scenario Analysis request (docs/decisions/
 * ADR-0004-single-openai-provider.md, request-count reduction). Previously
 * two separate provider requests; the model now reasons about both in one
 * call and returns them as two clearly separated nested objects. This is
 * a request-count optimization, not a conceptual merge: `runPipeline.js`
 * still records "Role Analysis Stage" and "Scenario Analysis Stage" as
 * distinct pipeline-stage records, and the frontend still displays them
 * separately — a logical pipeline stage does not necessarily equal one
 * network request.
 */
export const contextAnalysisSchema = z.object({
  role_analysis: z.object({
    criteria: z.array(z.string().max(60)).length(7),
    baseline_weights: z.object(weightsShape),
    must_have_criteria: z.array(z.enum(CRITERIA_KEYS)).max(7),
    role_success_definition: z.string().max(300),
    complexity_rating: z.enum(["low", "medium", "high"]),
  }),
  scenario_analysis: z.object({
    priority_shifts: z.array(z.string().max(160)).max(7),
    weight_deltas: z.object(deltasShape),
    scenario_success_definition: z.string().max(300),
    scenario_failure_definition: z.string().max(300),
    scenario_risks: z.array(z.string().max(160)).max(8),
    key_pressures: z.array(z.string().max(120)).max(8),
    weight_rationale: z.string().max(400),
  }),
});

export const CONTEXT_ANALYSIS_PROMPT_ID = "context-analysis";
export const CONTEXT_ANALYSIS_PROMPT_VERSION = "v1";
export const CONTEXT_ANALYSIS_SCHEMA_VERSION = "v1";
