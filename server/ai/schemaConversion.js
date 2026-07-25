/**
 * @file Shared Zod -> JSON Schema conversion for both provider adapters.
 *
 * Conversion path chosen for Phase 1A (see docs/decisions/ADR-0002 for the
 * full reasoning): the repository's installed Zod is 3.25.76, which has no
 * native `z.toJSONSchema()` (that only exists in Zod 4+). Neither groq-sdk
 * (1.4.0) nor @google/genai (2.13.0) ships its own Zod-aware helper — their
 * READMEs do not mention Zod at all. Google's `responseJsonSchema` field
 * accepts standard JSON Schema (it documents support for $id/$defs/$ref/
 * $anchor), so the same converted output can serve both adapters. Given
 * that, a dedicated converter is genuinely needed; we added the small,
 * single-purpose `zod-to-json-schema` package rather than bumping the
 * pinned Zod major version repo-wide (Zod is not consumed anywhere else
 * yet, but a major-version bump is a separate, larger decision than this
 * phase's scope).
 *
 * Known limitation carried forward to Phase 1B: Groq's strict mode requires
 * every object property to appear in `required` (optional fields must use
 * the nullable-type pattern instead of JSON Schema's `required` omission).
 * The schemas built in this phase are test fixtures with only required
 * fields, so this does not need solving yet — the six production pipeline
 * schemas (Phase 1B) must account for it when they have optional fields.
 */

import { zodToJsonSchema } from "zod-to-json-schema";

/**
 * Converts a Zod schema into a flat (no $ref/$defs indirection) JSON Schema
 * draft-07 object, suitable for either provider.
 * @param {import("zod").ZodType} zodSchema
 * @returns {object}
 */
export function toJsonSchema(zodSchema) {
  return zodToJsonSchema(zodSchema, { $refStrategy: "none", target: "jsonSchema7" });
}

/**
 * Builds the Groq `response_format` body for strict-mode structured output.
 * @param {import("zod").ZodType} zodSchema
 * @param {string} name - Schema name Groq will echo back; keep it short and
 *   stable (used as an identifier, not shown to end users).
 * @returns {{ type: "json_schema", json_schema: { name: string, strict: boolean, schema: object } }}
 */
export function toGroqResponseFormat(zodSchema, name) {
  const schema = toJsonSchema(zodSchema);
  return {
    type: "json_schema",
    json_schema: { name, strict: true, schema },
  };
}

/**
 * Builds the Gemini structured-output config fields.
 * @param {import("zod").ZodType} zodSchema
 * @returns {{ responseMimeType: "application/json", responseJsonSchema: object }}
 */
export function toGeminiResponseConfig(zodSchema) {
  return {
    responseMimeType: "application/json",
    responseJsonSchema: toJsonSchema(zodSchema),
  };
}
