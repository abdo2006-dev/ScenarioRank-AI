import { z } from "zod";

/**
 * /api/scenarios AI-assisted generation output. The regex-based fallback
 * generator (used when AI is unavailable or this fails validation) does
 * not go through this schema — it's plain deterministic code.
 */
export const scenarioGenerationSchema = z.object({
  scenarios: z.array(z.string().max(120)).min(1).max(5),
});

export const SCENARIO_GENERATION_PROMPT_ID = "scenario-generation";
export const SCENARIO_GENERATION_PROMPT_VERSION = "v1";
