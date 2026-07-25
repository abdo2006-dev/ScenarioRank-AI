import { describe, it, expect } from "vitest";
import { z } from "zod";
import { toJsonSchema, toGroqResponseFormat, toGeminiResponseConfig } from "./schemaConversion.js";

/**
 * This fixture deliberately uses only conservative, widely-portable JSON
 * Schema features (plain object/string/number, min/max, required fields) —
 * exactly the kind of schema shape Phase 1B's production schemas should
 * prefer, per the portability warning in schemaConversion.js and ADR-0002.
 * It is NOT one of the six production pipeline schemas.
 */
const Sample = z.object({
  name: z.string(),
  score: z.number().min(1).max(10),
});

// Keywords that exist in JSON Schema but are more likely to hit provider
// support gaps (unions, references, pattern-based property matching,
// conditional subschemas). A conservative schema/conversion should not
// need any of these.
const ADVANCED_KEYWORDS = ["$ref", "anyOf", "oneOf", "allOf", "not", "if", "then", "else", "patternProperties", "$dynamicRef"];

function assertNoAdvancedKeywords(schema) {
  const serialized = JSON.stringify(schema);
  for (const keyword of ADVANCED_KEYWORDS) {
    expect(serialized, `unexpected "${keyword}" in a conservative fixture schema`).not.toContain(`"${keyword}"`);
  }
}

describe("toJsonSchema", () => {
  it("produces a flat schema with no $ref/$defs/definitions indirection anywhere", () => {
    const schema = toJsonSchema(Sample);
    expect(schema.$ref).toBeUndefined();
    expect(schema.definitions).toBeUndefined();
    expect(schema.$defs).toBeUndefined();
    // Deep check, not just top-level: no nested $ref/$defs sneaking in
    // through a property, in case a future fixture nests objects.
    expect(JSON.stringify(schema)).not.toContain('"$ref"');
    expect(JSON.stringify(schema)).not.toContain('"$defs"');
  });

  it("uses only conservative JSON Schema features for this fixture", () => {
    assertNoAdvancedKeywords(toJsonSchema(Sample));
  });

  it("produces the exact expected shape for the conservative fixture schema", () => {
    const schema = toJsonSchema(Sample);
    expect(schema).toMatchObject({
      type: "object",
      properties: {
        name: { type: "string" },
        score: { type: "number", minimum: 1, maximum: 10 },
      },
      required: ["name", "score"],
      additionalProperties: false,
    });
  });
});

describe("toGroqResponseFormat", () => {
  it("produces exactly the wrapper Groq's strict-mode json_schema response_format expects", () => {
    const format = toGroqResponseFormat(Sample, "sample-schema");
    expect(format).toEqual({
      type: "json_schema",
      json_schema: {
        name: "sample-schema",
        strict: true,
        schema: toJsonSchema(Sample),
      },
    });
  });
});

describe("toGeminiResponseConfig", () => {
  it("produces exactly the config fields Gemini's responseJsonSchema expects", () => {
    const config = toGeminiResponseConfig(Sample);
    expect(config).toEqual({
      responseMimeType: "application/json",
      responseJsonSchema: toJsonSchema(Sample),
    });
  });
});

describe("cross-provider portability caveat (documentation-as-test)", () => {
  it("does not assert Gemini and Groq accept identical schema features — only that both receive the SAME generated schema", () => {
    // This test intentionally does NOT assert "both providers support this
    // schema" — that can only be verified against each provider's real
    // structured-output implementation (Phase 1B adapter compatibility
    // tests), not by local Zod validity alone. It only pins that both
    // conversion paths are fed by the same canonical output, so any future
    // divergence between the two adapters' schema handling is a deliberate
    // adapter-level choice, not an accidental drift in this shared step.
    const groqSchema = toGroqResponseFormat(Sample, "sample-schema").json_schema.schema;
    const geminiSchema = toGeminiResponseConfig(Sample).responseJsonSchema;
    expect(groqSchema).toEqual(geminiSchema);
  });
});
