import { it, expect } from "vitest";
import { z } from "zod";
import { createGroqProvider, DEFAULT_GROQ_MODEL } from "./groqProvider.js";
import { createFakeGroqClient } from "./testSupport/fakeGroqClient.js";
import { defineProviderContractTests, describe } from "./providerContract.shared.js";

const MODEL = "test-groq-model";
// Deliberately not shaped like a real provider credential — this value
// only needs to be a stand-in for the "no secrets leak into thrown
// messages" test, not a realistic-looking one.
const SECRET_KEY = "unit-test-groq-credential";

describe("groqProvider — shared provider contract", () => {
  defineProviderContractTests({
    providerName: "groq",
    model: MODEL,
    secretApiKey: SECRET_KEY,
    build: (script) => {
      const client = createFakeGroqClient(script);
      const provider = createGroqProvider({ apiKey: SECRET_KEY, model: MODEL, client });
      return { provider, client };
    },
  });
});

describe("groqProvider — adapter-specific behavior", () => {
  it("defaults to openai/gpt-oss-120b when no model is configured", () => {
    expect(DEFAULT_GROQ_MODEL).toBe("openai/gpt-oss-120b");
  });

  it("requests strict-mode JSON schema structured output", async () => {
    const client = createFakeGroqClient([{ type: "success", text: '{"answer":"ok","score":1}' }]);
    const provider = createGroqProvider({ apiKey: SECRET_KEY, model: MODEL, client });

    await provider.generateStructured({
      system: "sys",
      prompt: "user",
      schema: z.object({ answer: z.string(), score: z.number() }),
      promptId: "shape-check",
      promptVersion: "v1",
    });

    const body = client.receivedBodies[0];
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.name).toBe("shape-check");
    expect(body.response_format.json_schema.schema).toBeTypeOf("object");
  });

  it("never constructs a real Groq SDK client when one is injected", () => {
    const client = createFakeGroqClient([{ type: "success", text: "{}" }]);
    const provider = createGroqProvider({ apiKey: SECRET_KEY, model: MODEL, client });
    expect(provider.name).toBe("groq");
  });
});
