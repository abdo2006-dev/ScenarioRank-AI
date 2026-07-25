/**
 * @file Groq adapter (Phase 1A). Not wired into the active pipeline yet.
 *
 * Uses the official `groq-sdk` package. The client is constructed with
 * `maxRetries: 0` — confirmed against groq-sdk's own type definitions
 * (default is 2) — so the shared retry.js is the only retry owner; the SDK
 * never retries on its own behind our backs.
 *
 * Regardless of Groq's `strict: true` structured-output mode, the response
 * is always parsed and re-validated locally against the caller's Zod
 * schema before it is returned (see providerBase.js) — strict mode has a
 * documented reliability caveat (community reports of it occasionally
 * returning free-form text instead of schema-conforming JSON), so
 * provider-side guarantees are never trusted alone.
 */

import Groq from "groq-sdk";
import {
  AuthenticationError,
  RateLimitError,
  TimeoutError,
  ProviderServerError,
  MalformedResponseError,
} from "../errors.js";
import { toGroqResponseFormat } from "../schemaConversion.js";
import { runStructuredGeneration } from "../providerBase.js";

export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

/**
 * @param {{ apiKey: string, model?: string, client?: object }} options
 * @returns {import("../types.js").AIProvider}
 */
export function createGroqProvider({ apiKey, model = DEFAULT_GROQ_MODEL, client } = {}) {
  const sdk = client ?? new Groq({ apiKey, maxRetries: 0 });

  return {
    name: "groq",
    model,
    /** @param {import("../types.js").StructuredGenerationRequest} request */
    async generateStructured(request) {
      return runStructuredGeneration({
        providerName: "groq",
        model,
        request,
        callSdk: async ({ system, prompt, correctivePromptSuffix }) => {
          const controller = new AbortController();
          const timeout = request.timeoutMs
            ? setTimeout(() => controller.abort(), request.timeoutMs)
            : undefined;
          try {
            const response = await sdk.chat.completions.create(
              {
                model,
                max_tokens: request.maxOutputTokens,
                messages: [
                  { role: "system", content: system },
                  { role: "user", content: prompt + correctivePromptSuffix },
                ],
                response_format: toGroqResponseFormat(request.schema, request.promptId),
              },
              { signal: controller.signal }
            );

            const text = response?.choices?.[0]?.message?.content;
            if (!text) {
              throw new MalformedResponseError(
                `Groq returned no message content for "${request.promptId}".`
              );
            }
            const usage = response.usage
              ? { inputTokens: response.usage.prompt_tokens, outputTokens: response.usage.completion_tokens }
              : undefined;
            return { text, usage };
          } catch (err) {
            throw mapGroqError(err, { aborted: controller.signal.aborted });
          } finally {
            if (timeout) clearTimeout(timeout);
          }
        },
      });
    },
  };
}

/**
 * Maps a raw groq-sdk (or generic fetch/network) error into the shared,
 * caller-safe error taxonomy. Never forwards the raw error's message
 * verbatim if it might contain request headers or key material — groq-sdk
 * error messages are developer-facing HTTP failure descriptions, not model
 * output, so they are safe to summarize but not to expose unfiltered.
 */
function mapGroqError(err, { aborted }) {
  if (err instanceof MalformedResponseError) return err;
  if (aborted) {
    return new TimeoutError("Groq request timed out.", { cause: err });
  }
  const status = err?.status;
  if (status === 401 || status === 403) {
    return new AuthenticationError("Groq rejected the request's credentials.", { cause: err });
  }
  if (status === 429) {
    return new RateLimitError("Groq rate-limited the request.", { cause: err });
  }
  if (typeof status === "number" && status >= 500) {
    return new ProviderServerError(`Groq server error (status ${status}).`, { cause: err });
  }
  return new ProviderServerError("Groq request failed.", { cause: err });
}
