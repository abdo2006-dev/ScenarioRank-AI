/**
 * A fake OpenAI SDK client implementing only `responses.parse()`, driven
 * by a script of steps — no real network calls, no real API key needed.
 * Injected via `createOpenAIProvider({ client })`'s test-only escape
 * hatch (server/ai/providers/openaiProvider.js).
 */
export function createFakeOpenAIClient(script) {
  let call = 0;
  const calls = [];
  return {
    responses: {
      async parse(body, options) {
        calls.push({ body, options });
        const step = script[call];
        call += 1;
        if (!step) throw new Error("Fake OpenAI client script exhausted — the adapter made more calls than the test expected.");
        return applyStep(step);
      },
    },
    get callCount() {
      return call;
    },
    get calls() {
      return calls;
    },
  };
}

function usageFromStep(usage) {
  if (!usage) return undefined;
  return {
    input_tokens: usage.inputTokens ?? 0,
    input_tokens_details: { cached_tokens: usage.cachedInputTokens ?? 0, cache_write_tokens: 0 },
    output_tokens: usage.outputTokens ?? 0,
    output_tokens_details: { reasoning_tokens: usage.reasoningTokens ?? 0 },
    total_tokens: usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
  };
}

function applyStep(step) {
  switch (step.type) {
    case "success":
      return {
        status: "completed",
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(step.parsed) }] }],
        output_parsed: step.parsed,
        incomplete_details: null,
        usage: usageFromStep(step.usage),
      };
    case "refusal":
      return {
        status: "completed",
        output: [{ type: "message", content: [{ type: "refusal", refusal: step.reason || "I can't help with that." }] }],
        output_parsed: null,
        incomplete_details: null,
      };
    case "incomplete":
      return {
        status: "incomplete",
        output: [],
        output_parsed: null,
        incomplete_details: { reason: step.reason || "max_output_tokens" },
      };
    case "noContent":
      return { status: "completed", output: [], output_parsed: null, incomplete_details: null };
    case "httpError": {
      const err = new Error(step.message || `HTTP ${step.status}`);
      err.status = step.status;
      if (step.headers) err.headers = new Headers(step.headers);
      throw err;
    }
    case "connectionError": {
      const err = new Error(step.message || "Could not reach the OpenAI API.");
      err.name = "APIConnectionError";
      throw err;
    }
    case "timeout": {
      const err = new Error("Request timed out.");
      err.name = "APIConnectionTimeoutError";
      throw err;
    }
    default:
      throw new Error(`Unknown fake OpenAI client step type: ${step.type}`);
  }
}
