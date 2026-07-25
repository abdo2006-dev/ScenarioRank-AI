import { z } from "zod";
import { CRITERIA_KEYS } from "./criteriaKeys.js";

const deltasShape = Object.fromEntries(CRITERIA_KEYS.map((k) => [k, z.number().min(-100).max(100)]));

/**
 * Scenario Agent output.
 *
 * SEMANTIC PROMPT CHANGE (documented per Phase 1B requirement): the
 * pre-migration prompt asked for `priority_shifts` as a free-form object
 * (`{...}`, no fixed keys). That shape is not portably expressible as a
 * strict-mode-compatible schema (open-ended keyed objects don't have a
 * fixed `required`/`additionalProperties:false` contract) and the field
 * was never actually read by any downstream code — it only appeared in
 * the raw LLM response, unused. It is now a short array of plain-language
 * shift descriptions instead of a keyed object. Nothing that was actually
 * consumed changed shape.
 */
export const scenarioAnalysisSchema = z.object({
  priority_shifts: z.array(z.string().max(160)).max(7),
  weight_deltas: z.object(deltasShape),
  scenario_success_definition: z.string().max(300),
  scenario_failure_definition: z.string().max(300),
  scenario_risks: z.array(z.string().max(160)).max(8),
  key_pressures: z.array(z.string().max(120)).max(8),
  weight_rationale: z.string().max(400),
});

export const SCENARIO_ANALYSIS_PROMPT_ID = "scenario-analysis";
export const SCENARIO_ANALYSIS_PROMPT_VERSION = "v1";
export const SCENARIO_ANALYSIS_SCHEMA_VERSION = "v1";
