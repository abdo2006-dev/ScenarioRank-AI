import { it, expect } from "vitest";
import { z } from "zod";
import { createGeminiProvider } from "./geminiProvider.js";
import { createFakeGeminiClient } from "./testSupport/fakeGeminiClient.js";
import { defineProviderContractTests, describe } from "./providerContract.shared.js";

const MODEL = "test-gemini-model";
// Deliberately not shaped like a real provider credential — this value
// only needs to be a stand-in for the "no secrets leak into thrown
// messages" test, not a realistic-looking one.
const SECRET_KEY = "unit-test-gemini-credential";

describe("geminiProvider — shared provider contract", () => {
  defineProviderContractTests({
    providerName: "gemini",
    model: MODEL,
    secretApiKey: SECRET_KEY,
    build: (script) => {
      const client = createFakeGeminiClient(script);
      const provider = createGeminiProvider({ apiKey: SECRET_KEY, model: MODEL, client });
      return { provider, client };
    },
  });
});

describe("geminiProvider — adapter-specific behavior", () => {
  it("requires an explicit model — there is no built-in default", () => {
    expect(() => createGeminiProvider({ apiKey: SECRET_KEY, client: createFakeGeminiClient([]) })).toThrow(
      /requires an explicit model/
    );
  });

  it("requests JSON-schema structured output via responseJsonSchema", async () => {
    const client = createFakeGeminiClient([{ type: "success", text: '{"answer":"ok","score":1}' }]);
    const provider = createGeminiProvider({ apiKey: SECRET_KEY, model: MODEL, client });

    await provider.generateStructured({
      system: "sys",
      prompt: "user",
      schema: z.object({ answer: z.string(), score: z.number() }),
      promptId: "shape-check",
      promptVersion: "v1",
    });

    const params = client.receivedParams[0];
    expect(params.config.responseMimeType).toBe("application/json");
    expect(params.config.responseJsonSchema).toBeTypeOf("object");
    expect(params.config.systemInstruction).toBe("sys");
  });
});
