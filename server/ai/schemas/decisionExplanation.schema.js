import { z } from "zod";

const tradeOffSchema = z.object({
  title: z.string().max(120),
  description: z.string().max(400),
  type: z.enum(["gain", "sacrifice", "opportunity_cost", "risk", "adaptability"]),
  // Always required (not nullable/optional): `z.enum(...).nullable()` compiles
  // to a JSON Schema `anyOf`, one of the less-portable keywords flagged in
  // server/ai/schemaConversion.js's portability warning — confirmed by this
  // schema's own test in productionSchemas.test.js. Requiring the model to
  // always pick a severity avoids the union entirely and keeps this schema
  // conservative for both providers.
  severity: z.enum(["low", "medium", "high"]),
});

const executiveSummarySchema = z.object({
  recommendation: z.string().max(300),
  reason: z.string().max(300),
  trade_off: z.string().max(300),
  opportunity_cost: z.string().max(300),
  adaptability: z.string().max(300),
  alternative: z.string().max(200),
});

/**
 * Decision Explanation Stage's LLM-generated explanation layer. Ranking itself is
 * always computed deterministically before this call — this schema only
 * covers the narrative fields the model is allowed to produce (see
 * server/pipeline/runPipeline.js for where deterministic ranking and this
 * explanation are combined, and the boundary test in runPipeline.test.js
 * asserting the model's wording can never change who wins).
 */
export const decisionExplanationSchema = z.object({
  final_label: z.string().max(80),
  key_reason: z.string().max(300),
  executive_interpretation: z.string().max(400),
  winner_reason: z.string().max(300),
  runner_up_trade_off: z.string().max(300),
  trade_offs: z.array(tradeOffSchema).max(6),
  executive_summary: executiveSummarySchema,
});

export const DECISION_EXPLANATION_PROMPT_ID = "decision-explanation";
export const DECISION_EXPLANATION_PROMPT_VERSION = "v1";
export const DECISION_EXPLANATION_SCHEMA_VERSION = "v1";
