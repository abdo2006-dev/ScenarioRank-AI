/**
 * @file One reusable provider-contract test suite, applied to both
 * groqProvider.js and geminiProvider.js from their own *.test.js files.
 * Each provider supplies its own fake client (testSupport/fake*Client.js);
 * this file only asserts on the shared AIProvider contract, never on any
 * provider-specific SDK shape.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  AuthenticationError,
  RateLimitError,
  TimeoutError,
  RetryExhaustedError,
} from "../errors.js";

const TestSchema = z.object({
  answer: z.string(),
  score: z.number(),
});

const VALID_TEXT = JSON.stringify({ answer: "ok", score: 5 });
const SCHEMA_INVALID_TEXT = JSON.stringify({ answer: "ok" }); // missing `score`

function baseRequest(overrides = {}) {
  return {
    system: "system prompt",
    prompt: "user prompt",
    schema: TestSchema,
    promptId: "contract-test",
    promptVersion: "v1",
    maxOutputTokens: 100,
    timeoutMs: 60,
    ...overrides,
  };
}

/**
 * @param {object} params
 * @param {string} params.providerName - "groq" | "gemini"
 * @param {string} params.model
 * @param {string} params.secretApiKey - A fake-but-realistic-looking API
 *   key used for the "no secrets leaked" assertion.
 * @param {(script: object[]) => { provider: import("../types.js").AIProvider, client: object }} params.build
 *   Builds a provider instance wired to a fake client driven by `script`
 *   (see testSupport/fake*Client.js for the step vocabulary).
 */
export function defineProviderContractTests({ providerName, model, secretApiKey, build }) {
  it("returns locally validated data plus metadata for a valid response", async () => {
    const { provider } = build([{ type: "success", text: VALID_TEXT, usage: { inputTokens: 12, outputTokens: 7 } }]);
    const result = await provider.generateStructured(baseRequest());

    expect(result.data).toEqual({ answer: "ok", score: 5 });
    expect(result.meta.provider).toBe(providerName);
    expect(result.meta.model).toBe(model);
    expect(result.meta.attempts).toBe(1);
    expect(typeof result.meta.latencyMs).toBe("number");
    expect(result.meta.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.meta.usage).toEqual({ inputTokens: 12, outputTokens: 7 });
  });

  it("exhausts retries and reports attempts when every response is malformed JSON", async () => {
    const { provider, client } = build([
      { type: "success", text: "not valid json" },
      { type: "success", text: "still not valid json" },
    ]);

    const err = await provider.generateStructured(baseRequest()).catch((e) => e);

    expect(err).toBeInstanceOf(RetryExhaustedError);
    expect(err.attempts).toBe(2);
    expect(client.callCount).toBe(2);
  });

  it("exhausts retries and reports attempts when every response fails schema validation", async () => {
    const { provider } = build([
      { type: "success", text: SCHEMA_INVALID_TEXT },
      { type: "success", text: SCHEMA_INVALID_TEXT },
    ]);

    const err = await provider.generateStructured(baseRequest()).catch((e) => e);

    expect(err).toBeInstanceOf(RetryExhaustedError);
    expect(err.attempts).toBe(2);
    expect(err.lastError?.code).toBe("schema_validation");
  });

  it("treats missing response content as a malformed response and exhausts retries", async () => {
    const { provider, client } = build([{ type: "noContent" }, { type: "noContent" }]);

    const err = await provider.generateStructured(baseRequest()).catch((e) => e);

    expect(err).toBeInstanceOf(RetryExhaustedError);
    expect(err.lastError?.code).toBe("malformed_response");
    expect(client.callCount).toBe(2);
  });

  it("maps an authentication failure without retrying", async () => {
    const { provider, client } = build([{ type: "httpError", status: 401 }]);

    const err = await provider.generateStructured(baseRequest()).catch((e) => e);

    expect(err).toBeInstanceOf(AuthenticationError);
    expect(err.retryable).toBe(false);
    expect(client.callCount).toBe(1); // no retry attempted
  });

  it("maps a rate-limit failure and retries it", async () => {
    const { provider, client } = build([
      { type: "httpError", status: 429 },
      { type: "httpError", status: 429 },
    ]);

    const err = await provider.generateStructured(baseRequest()).catch((e) => e);

    expect(err).toBeInstanceOf(RetryExhaustedError);
    expect(err.lastError).toBeInstanceOf(RateLimitError);
    expect(client.callCount).toBe(2); // one retry was attempted
  });

  it("maps a timed-out request via the real AbortController path", async () => {
    const { provider, client } = build([{ type: "hang" }, { type: "hang" }]);

    const err = await provider.generateStructured(baseRequest({ timeoutMs: 25 })).catch((e) => e);

    expect(err).toBeInstanceOf(RetryExhaustedError);
    expect(err.lastError).toBeInstanceOf(TimeoutError);
    expect(client.callCount).toBe(2);
  });

  it("recovers from a transient provider failure on the single allowed retry", async () => {
    const { provider, client } = build([
      { type: "httpError", status: 500 },
      { type: "success", text: VALID_TEXT },
    ]);

    const result = await provider.generateStructured(baseRequest());

    expect(result.data).toEqual({ answer: "ok", score: 5 });
    expect(result.meta.attempts).toBe(2);
    expect(client.callCount).toBe(2);
  });

  it("recovers from a schema-validation failure on the single allowed retry, sending only a sanitized summary", async () => {
    const { provider, client } = build([
      { type: "success", text: SCHEMA_INVALID_TEXT },
      { type: "success", text: VALID_TEXT },
    ]);

    const result = await provider.generateStructured(baseRequest());

    expect(result.data).toEqual({ answer: "ok", score: 5 });
    expect(result.meta.attempts).toBe(2);

    // The corrective retry must carry a short field/message summary, never
    // the raw first-attempt output re-embedded verbatim.
    const secondCallText = extractOutgoingText(client, providerName, 1);
    expect(secondCallText).toContain("score");
    expect(secondCallText).not.toContain(SCHEMA_INVALID_TEXT);
  });

  it("never includes the API key in a thrown error's message", async () => {
    const { provider } = build([{ type: "httpError", status: 401 }]);

    const err = await provider.generateStructured(baseRequest()).catch((e) => e);

    expect(err.message).not.toContain(secretApiKey);
    expect(String(err)).not.toContain(secretApiKey);
    expect(JSON.stringify(err, Object.getOwnPropertyNames(err))).not.toContain(secretApiKey);
  });
}

function extractOutgoingText(client, providerName, callIndex) {
  if (providerName === "groq") {
    const messages = client.receivedMessages[callIndex];
    return messages.map((m) => m.content).join("\n");
  }
  return client.receivedContents[callIndex];
}

// Re-exported so provider-specific test files don't need a second import
// just to wrap defineProviderContractTests in a describe() block.
export { describe };
