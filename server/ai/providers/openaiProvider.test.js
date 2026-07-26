import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createOpenAIProvider, DEFAULT_OPENAI_MODEL } from "./openaiProvider.js";
import { createFakeOpenAIClient } from "./testSupport/fakeOpenAIClient.js";
import {
  AuthenticationError,
  RateLimitError,
  TimeoutError,
  ProviderServerError,
  MalformedResponseError,
  SchemaValidationError,
  RefusalError,
  RetryExhaustedError,
} from "../errors.js";

const TestSchema = z.object({ answer: z.string(), score: z.number() });
const VALID = { answer: "ok", score: 5 };
const SCHEMA_INVALID = { answer: "ok" }; // missing `score`

function baseRequest(overrides = {}) {
  return {
    system: "system prompt",
    prompt: "user prompt",
    schema: TestSchema,
    promptId: "contract-test",
    promptVersion: "v1",
    maxOutputTokens: 100,
    timeoutMs: 5000,
    ...overrides,
  };
}

function buildProvider(script, opts = {}) {
  const client = createFakeOpenAIClient(script);
  const provider = createOpenAIProvider({ apiKey: "sk-test-fake-not-real", model: "gpt-5-mini", client, ...opts });
  return { provider, client };
}

describe("createOpenAIProvider — valid structured responses", () => {
  it("returns locally validated data plus metadata for a valid response", async () => {
    const { provider } = buildProvider([{ type: "success", parsed: VALID, usage: { inputTokens: 12, cachedInputTokens: 2, outputTokens: 7, reasoningTokens: 1, totalTokens: 19 } }]);
    const result = await provider.generateStructured(baseRequest());

    expect(result.data).toEqual(VALID);
    expect(result.meta.provider).toBe("openai");
    expect(result.meta.model).toBe("gpt-5-mini");
    expect(result.meta.attempts).toBe(1);
    expect(typeof result.meta.latencyMs).toBe("number");
    expect(result.meta.usage).toEqual({ inputTokens: 12, cachedInputTokens: 2, outputTokens: 7, reasoningTokens: 1, totalTokens: 19 });
  });

  it("defaults to gpt-5-mini when no model is specified", () => {
    expect(DEFAULT_OPENAI_MODEL).toBe("gpt-5-mini");
    const { provider } = buildProvider([]);
    expect(provider.name).toBe("openai");
  });
});

describe("createOpenAIProvider — refusal handling (distinct from malformed/incomplete)", () => {
  it("maps a refusal to RefusalError without retrying", async () => {
    const { provider, client } = buildProvider([{ type: "refusal", reason: "Cannot help with that request." }]);
    const err = await provider.generateStructured(baseRequest()).catch((e) => e);

    expect(err).toBeInstanceOf(RefusalError);
    expect(err.retryable).toBe(false);
    expect(client.callCount).toBe(1); // no blind retry on refusal
  });

  it("treats a content-filter incomplete reason like a refusal — no blind retry", async () => {
    const { provider, client } = buildProvider([{ type: "incomplete", reason: "content_filter" }]);
    const err = await provider.generateStructured(baseRequest()).catch((e) => e);

    expect(err).toBeInstanceOf(RefusalError);
    expect(client.callCount).toBe(1);
  });
});

describe("createOpenAIProvider — truncated/incomplete output (distinct from refusal/malformed)", () => {
  it("retries a max_output_tokens truncation once, with a larger output-token budget", async () => {
    const { provider, client } = buildProvider([
      { type: "incomplete", reason: "max_output_tokens" },
      { type: "success", parsed: VALID },
    ]);
    const result = await provider.generateStructured(baseRequest({ maxOutputTokens: 100 }));

    expect(result.data).toEqual(VALID);
    expect(result.meta.attempts).toBe(2);
    // The retried request must use a strictly larger max_output_tokens
    // than the original insufficient budget — never the same one twice.
    expect(client.calls[1].body.max_output_tokens).toBeGreaterThan(100);
  });

  it("exhausts after one retry if still truncated, never retrying a third time with the same budget", async () => {
    const { provider, client } = buildProvider([
      { type: "incomplete", reason: "max_output_tokens" },
      { type: "incomplete", reason: "max_output_tokens" },
    ]);
    const err = await provider.generateStructured(baseRequest()).catch((e) => e);

    expect(err).toBeInstanceOf(RetryExhaustedError);
    expect(client.callCount).toBe(2);
  });
});

describe("createOpenAIProvider — malformed/missing content", () => {
  it("treats missing parsed content as a malformed response and retries once", async () => {
    const { provider, client } = buildProvider([{ type: "noContent" }, { type: "success", parsed: VALID }]);
    const result = await provider.generateStructured(baseRequest());
    expect(result.data).toEqual(VALID);
    expect(client.callCount).toBe(2);
  });

  it("exhausts retries when every response has no parsed content", async () => {
    const { provider } = buildProvider([{ type: "noContent" }, { type: "noContent" }]);
    const err = await provider.generateStructured(baseRequest()).catch((e) => e);
    expect(err).toBeInstanceOf(RetryExhaustedError);
    expect(err.lastError).toBeInstanceOf(MalformedResponseError);
  });
});

describe("createOpenAIProvider — schema-invalid response (defense-in-depth local re-validation)", () => {
  it("re-validates output_parsed locally and rejects a shape the schema does not allow, then retries once", async () => {
    const { provider, client } = buildProvider([{ type: "success", parsed: SCHEMA_INVALID }, { type: "success", parsed: VALID }]);
    const result = await provider.generateStructured(baseRequest());
    expect(result.data).toEqual(VALID);
    expect(client.callCount).toBe(2);
  });

  it("exhausts retries when every response fails local schema validation", async () => {
    const { provider } = buildProvider([{ type: "success", parsed: SCHEMA_INVALID }, { type: "success", parsed: SCHEMA_INVALID }]);
    const err = await provider.generateStructured(baseRequest()).catch((e) => e);
    expect(err).toBeInstanceOf(RetryExhaustedError);
    expect(err.lastError).toBeInstanceOf(SchemaValidationError);
  });
});

describe("createOpenAIProvider — provider-neutral error mapping", () => {
  it("maps 401 to AuthenticationError without retrying", async () => {
    const { provider, client } = buildProvider([{ type: "httpError", status: 401 }]);
    const err = await provider.generateStructured(baseRequest()).catch((e) => e);
    expect(err).toBeInstanceOf(AuthenticationError);
    expect(err.retryable).toBe(false);
    expect(client.callCount).toBe(1);
  });

  it("maps 403 (permission/model-access) to AuthenticationError without retrying", async () => {
    const { provider, client } = buildProvider([{ type: "httpError", status: 403 }]);
    const err = await provider.generateStructured(baseRequest()).catch((e) => e);
    expect(err).toBeInstanceOf(AuthenticationError);
    expect(client.callCount).toBe(1);
  });

  it("maps 404 (model not found) to AuthenticationError without retrying", async () => {
    const { provider, client } = buildProvider([{ type: "httpError", status: 404 }]);
    const err = await provider.generateStructured(baseRequest()).catch((e) => e);
    expect(err).toBeInstanceOf(AuthenticationError);
    expect(client.callCount).toBe(1);
  });

  it("maps 429 to RateLimitError and retries it", async () => {
    const { provider, client } = buildProvider([{ type: "httpError", status: 429 }, { type: "httpError", status: 429 }]);
    const err = await provider.generateStructured(baseRequest()).catch((e) => e);
    expect(err).toBeInstanceOf(RetryExhaustedError);
    expect(err.lastError).toBeInstanceOf(RateLimitError);
    expect(client.callCount).toBe(2);
  });

  it("waits out a safe, capped Retry-After delay on a rate limit before retrying", async () => {
    const { provider } = buildProvider([
      { type: "httpError", status: 429, headers: { "retry-after": "0.05" } },
      { type: "success", parsed: VALID },
    ]);
    const start = Date.now();
    const result = await provider.generateStructured(baseRequest());
    expect(result.data).toEqual(VALID);
    expect(Date.now() - start).toBeGreaterThanOrEqual(40); // ~50ms Retry-After was honored
  });

  it("caps an excessive Retry-After delay rather than waiting the full reported time", async () => {
    const { provider } = buildProvider([
      { type: "httpError", status: 429, headers: { "retry-after": "9999" } },
      { type: "success", parsed: VALID },
    ]);
    const start = Date.now();
    await provider.generateStructured(baseRequest());
    expect(Date.now() - start).toBeLessThan(3000); // capped, never waits 9999s
  }, 5000);

  it("recovers from a transient 5xx server failure on the single allowed retry", async () => {
    const { provider, client } = buildProvider([{ type: "httpError", status: 500 }, { type: "success", parsed: VALID }]);
    const result = await provider.generateStructured(baseRequest());
    expect(result.data).toEqual(VALID);
    expect(client.callCount).toBe(2);
  });

  it("maps a connection error to a retryable ProviderServerError", async () => {
    const { provider, client } = buildProvider([{ type: "connectionError" }, { type: "success", parsed: VALID }]);
    const result = await provider.generateStructured(baseRequest());
    expect(result.data).toEqual(VALID);
    expect(client.callCount).toBe(2);
  });

  it("maps a timeout to TimeoutError and retries it", async () => {
    const { provider, client } = buildProvider([{ type: "timeout" }, { type: "timeout" }]);
    const err = await provider.generateStructured(baseRequest()).catch((e) => e);
    expect(err).toBeInstanceOf(RetryExhaustedError);
    expect(err.lastError).toBeInstanceOf(TimeoutError);
    expect(client.callCount).toBe(2);
  });

  it("maps an unrecognized error to a retryable ProviderServerError rather than crashing", async () => {
    const { provider, client } = buildProvider([{ type: "httpError", status: 502 }, { type: "httpError", status: 502 }]);
    const err = await provider.generateStructured(baseRequest()).catch((e) => e);
    expect(err).toBeInstanceOf(RetryExhaustedError);
    expect(err.lastError).toBeInstanceOf(ProviderServerError);
    expect(client.callCount).toBe(2);
  });
});

describe("createOpenAIProvider — no secret or raw-payload leakage", () => {
  it("never includes the API key in a thrown error's message", async () => {
    const secretApiKey = "sk-super-secret-value-should-never-appear";
    const client = createFakeOpenAIClient([{ type: "httpError", status: 401 }]);
    const provider = createOpenAIProvider({ apiKey: secretApiKey, model: "gpt-5-mini", client });

    const err = await provider.generateStructured(baseRequest()).catch((e) => e);
    expect(err.message).not.toContain(secretApiKey);
    expect(String(err)).not.toContain(secretApiKey);
    expect(JSON.stringify(err, Object.getOwnPropertyNames(err))).not.toContain(secretApiKey);
  });

  it("never echoes the raw prompt or system text into a thrown error's message", async () => {
    const { provider } = buildProvider([{ type: "httpError", status: 400 }]);
    const secretPrompt = "CONFIDENTIAL_CANDIDATE_DESCRIPTION_TEXT";
    const err = await provider.generateStructured(baseRequest({ prompt: secretPrompt, system: secretPrompt })).catch((e) => e);
    expect(err.message).not.toContain(secretPrompt);
  });
});

describe("createOpenAIProvider — reasoning and output-token configuration reach only the OpenAI request", () => {
  it("forwards a configured reasoning effort into the request, not anywhere else", async () => {
    const { provider, client } = buildProvider([{ type: "success", parsed: VALID }], { reasoningEffort: "minimal" });
    await provider.generateStructured(baseRequest());
    expect(client.calls[0].body.reasoning).toEqual({ effort: "minimal" });
  });

  it("omits the reasoning field entirely when no reasoning effort is configured", async () => {
    const { provider, client } = buildProvider([{ type: "success", parsed: VALID }]);
    await provider.generateStructured(baseRequest());
    expect(client.calls[0].body.reasoning).toBeUndefined();
  });

  it("forwards the caller's maxOutputTokens as max_output_tokens on the request", async () => {
    const { provider, client } = buildProvider([{ type: "success", parsed: VALID }]);
    await provider.generateStructured(baseRequest({ maxOutputTokens: 777 }));
    expect(client.calls[0].body.max_output_tokens).toBe(777);
  });

  it("never sets store:true (no unnecessary response retention)", async () => {
    const { provider, client } = buildProvider([{ type: "success", parsed: VALID }]);
    await provider.generateStructured(baseRequest());
    expect(client.calls[0].body.store).toBe(false);
  });
});

describe("createOpenAIProvider — usage metadata extraction", () => {
  it("extracts input/cached-input/output/reasoning/total tokens exactly as reported", async () => {
    const { provider } = buildProvider([{ type: "success", parsed: VALID, usage: { inputTokens: 100, cachedInputTokens: 40, outputTokens: 50, reasoningTokens: 10, totalTokens: 150 } }]);
    const result = await provider.generateStructured(baseRequest());
    expect(result.meta.usage).toEqual({ inputTokens: 100, cachedInputTokens: 40, outputTokens: 50, reasoningTokens: 10, totalTokens: 150 });
  });

  it("omits usage from metadata when the response reports none", async () => {
    const { provider } = buildProvider([{ type: "success", parsed: VALID }]);
    const result = await provider.generateStructured(baseRequest());
    expect(result.meta.usage).toBeUndefined();
  });
});
