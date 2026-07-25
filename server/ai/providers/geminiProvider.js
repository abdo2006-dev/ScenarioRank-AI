/**
 * @file Gemini adapter. An optional alternative provider, wired into the
 * active pipeline via server/ai/providerFactory.js for controlled
 * comparison and experimentation (set AI_PROVIDER=gemini to use it).
 *
 * Uses the official `@google/genai` package. The client is constructed with
 * `httpOptions.retryOptions.attempts: 1` — confirmed against the SDK's own
 * type definitions, where "1 means no retries" and the unconfigured default
 * is 5 — so the shared retry.js remains the sole retry owner.
 *
 * There is no compiled-in default model here (unlike Groq): Gemini model
 * identifiers change over time, so GEMINI_MODEL must always be supplied by
 * the caller/factory. The response is always parsed and re-validated
 * locally against the caller's Zod schema before it is returned (see
 * providerBase.js), the same as the Groq adapter.
 */

import { GoogleGenAI } from "@google/genai";
import {
  AuthenticationError,
  RateLimitError,
  TimeoutError,
  ProviderServerError,
  MalformedResponseError,
} from "../errors.js";
import { toJsonSchema } from "../schemaConversion.js";
import { runStructuredGeneration } from "../providerBase.js";

/**
 * @param {{ apiKey: string, model: string, client?: object }} options
 * @returns {import("../types.js").AIProvider}
 */
export function createGeminiProvider({ apiKey, model, client } = {}) {
  if (!model) {
    throw new Error("createGeminiProvider requires an explicit model — there is no built-in default.");
  }
  const sdk = client ?? new GoogleGenAI({ apiKey, httpOptions: { retryOptions: { attempts: 1 } } });

  return {
    name: "gemini",
    model,
    /** @param {import("../types.js").StructuredGenerationRequest} request */
    async generateStructured(request) {
      return runStructuredGeneration({
        providerName: "gemini",
        model,
        request,
        callSdk: async ({ system, prompt, correctivePromptSuffix }) => {
          const controller = new AbortController();
          const timeout = request.timeoutMs
            ? setTimeout(() => controller.abort(), request.timeoutMs)
            : undefined;
          try {
            const response = await sdk.models.generateContent({
              model,
              contents: prompt + correctivePromptSuffix,
              config: {
                systemInstruction: system,
                maxOutputTokens: request.maxOutputTokens,
                responseMimeType: "application/json",
                responseJsonSchema: toJsonSchema(request.schema),
                abortSignal: controller.signal,
              },
            });

            const text = response?.text;
            if (!text) {
              throw new MalformedResponseError(
                `Gemini returned no text content for "${request.promptId}".`
              );
            }
            const usageMetadata = response.usageMetadata;
            const usage = usageMetadata
              ? { inputTokens: usageMetadata.promptTokenCount, outputTokens: usageMetadata.candidatesTokenCount }
              : undefined;
            return { text, usage };
          } catch (err) {
            throw mapGeminiError(err, { aborted: controller.signal.aborted });
          } finally {
            if (timeout) clearTimeout(timeout);
          }
        },
      });
    },
  };
}

/**
 * Maps a raw @google/genai error into the shared, caller-safe error
 * taxonomy. Gemini's ApiError exposes a numeric `status`; anything else
 * (network failure, unexpected shape) is treated as a provider-server
 * failure rather than surfaced verbatim.
 */
function mapGeminiError(err, { aborted }) {
  if (err instanceof MalformedResponseError) return err;
  if (aborted) {
    return new TimeoutError("Gemini request timed out.", { cause: err });
  }
  const status = err?.status;
  if (status === 401 || status === 403) {
    return new AuthenticationError("Gemini rejected the request's credentials.", { cause: err });
  }
  if (status === 429) {
    return new RateLimitError("Gemini rate-limited the request.", { cause: err });
  }
  if (typeof status === "number" && status >= 500) {
    return new ProviderServerError(`Gemini server error (status ${status}).`, { cause: err });
  }
  return new ProviderServerError("Gemini request failed.", { cause: err });
}
