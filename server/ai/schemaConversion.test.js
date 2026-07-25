import { describe, it, expect } from "vitest";
import { z } from "zod";
import { toJsonSchema, toGroqResponseFormat, toGeminiResponseConfig } from "./schemaConversion.js";

const Sample = z.object({
  name: z.string(),
  score: z.number().min(1).max(10),
});

describe("toJsonSchema", () => {
  it("produces a flat schema with no $ref/$defs indirection", () => {
    const schema = toJsonSchema(Sample);
    expect(schema.type).toBe("object");
    expect(schema.$ref).toBeUndefined();
    expect(schema.definitions).toBeUndefined();
    expect(schema.properties.name.type).toBe("string");
    expect(schema.properties.score).toMatchObject({ type: "number", minimum: 1, maximum: 10 });
    expect(schema.required).toEqual(["name", "score"]);
  });
});

describe("toGroqResponseFormat", () => {
  it("wraps the schema for Groq's strict-mode json_schema response format", () => {
    const format = toGroqResponseFormat(Sample, "sample-schema");
    expect(format.type).toBe("json_schema");
    expect(format.json_schema.name).toBe("sample-schema");
    expect(format.json_schema.strict).toBe(true);
    expect(format.json_schema.schema.type).toBe("object");
  });
});

describe("toGeminiResponseConfig", () => {
  it("returns responseMimeType + responseJsonSchema", () => {
    const config = toGeminiResponseConfig(Sample);
    expect(config.responseMimeType).toBe("application/json");
    expect(config.responseJsonSchema.type).toBe("object");
    expect(config.responseJsonSchema.required).toEqual(["name", "score"]);
  });
});
