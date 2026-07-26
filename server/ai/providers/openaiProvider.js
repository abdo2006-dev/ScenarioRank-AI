/**
 * @file OpenAI adapter (docs/decisions/ADR-0004-single-openai-provider.md).
 * The only implementation of the `AIProvider` contract — no other vendor
 * SDK is imported anywhere in this codebase.
 *
 * Uses the official `openai` npm package's Responses API with Structured
 * Outputs via the SDK's own Zod helper (`openai/helpers/zod`), which both
 * converts the canonical Zod schema to JSON Schema strict mode AND
 * re-parses the result through that exact Zod schema instance internally
 * (confirmed by reading the installed SDK's own source, not assumed —
 * see ADR-0004's "Model and API verification"). This adapter still calls
 * `schema.parse()` on the result a second time, explicitly, below —
 * defense in depth: never trust a provider-side guarantee alone, the same
 * principle ADR-0002 established for Groq's strict mode.
 *
 * The SDK's own automatic retries are disabled (`maxRetries: 0`) so
 * server/ai/retry.js remains the single retry owner in this codebase.
 *
 * Never logs a raw prompt, raw model output, candidate description, API
 * key, request header, or full provider error payload — every thrown
 * error carries only a short, sanitized message (server/ai/errors.js's
 * safety rule); the original SDK error is kept only as `cause`, which is
 * never itself surfaced to an HTTP response.
 */

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  AuthenticationError,
  RateLimitError,
  TimeoutError,
  ProviderServerError,
  MalformedResponseError,
  SchemaValidationError,
  RefusalError,
  IncompleteOutputError,
} from "../errors.js";
import { withRetry } from "../retry.js";

export const DEFAULT_OPENAI_MODEL = "gpt-5-mini";

/**
 * Reasoning effort values currently accepted by the OpenAI Responses API,
 * confirmed against the installed SDK's own type definitions
 * (`openai/resources/shared.d.ts`, `Reasoning.effort`) — not every model
 * supports every value (verified directly: `gpt-5.4-mini` rejects
 * `"minimal"` with a 400 listing its own supported subset), so an
 * unsupported combination surfaces as a clear 400 error from the API
 * itself, never a silent downgrade. See ADR-0004.
 */
export const REASONING_EFFORT_VALUES = Object.freeze(["none", "minimal", "low", "medium", "high", "xhigh", "max"]);

// A response truncated by max_output_tokens is retried at most once, with
// a larger budget — never with the same insufficient one. This is the
// only allowed multiplier and this file's only retry-time budget change;
// server/ai/retry.js still owns whether a retry happens at all.
const TRUNCATION_RETRY_MULTIPLIER = 1.5;

// Rate-limit retries use the server-reported Retry-After delay when
// available ("use safe retry-delay metadata where available" —
// docs/PROJECT_STATUS.md), capped so a misbehaving or huge reported delay
// can never make a single request hang indefinitely.
const MAX_RATE_LIMIT_DELAY_MS = 2000;

/** Waits out a rate limit's reported Retry-After delay, capped, if present. */
async function delayForRateLimit(err) {
  const retryAfterHeader = err?.headers?.get?.("retry-after");
  if (!retryAfterHeader) return;
  const seconds = Number(retryAfterHeader);
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  const delayMs = Math.min(seconds * 1000, MAX_RATE_LIMIT_DELAY_MS);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * @param {{ apiKey: string, model?: string, reasoningEffort?: string, client?: object }} options
 *   `client` is an injection point for tests (a fake object implementing
 *   only `responses.parse()`); production code never supplies it.
 * @returns {import("../types.js").AIProvider}
 */
export function createOpenAIProvider({ apiKey, model = DEFAULT_OPENAI_MODEL, reasoningEffort, client } = {}) {
  const sdk = client ?? new OpenAI({ apiKey, maxRetries: 0 });

  return {
    name: "openai",
    model,
    async generateStructured(request) {
      const { system, prompt, schema, promptId, promptVersion, maxOutputTokens, timeoutMs } = request;
      const schemaName = promptId.replace(/[^a-zA-Z0-9_-]/g, "_");

      const { data: attemptResult, attempts } = await withRetry(async ({ previousError }) => {
        const effectiveMaxTokens =
          previousError instanceof IncompleteOutputError
            ? Math.ceil(maxOutputTokens * TRUNCATION_RETRY_MULTIPLIER)
            : maxOutputTokens;

        const start = Date.now();
        let response;
        try {
          response = await sdk.responses.parse(
            {
              model,
              instructions: system,
              input: prompt,
              max_output_tokens: effectiveMaxTokens,
              ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
              text: { format: zodTextFormat(schema, schemaName) },
              store: false,
            },
            { timeout: timeoutMs }
          );
        } catch (err) {
          const mapped = mapOpenAIError(err, { promptId, promptVersion });
          if (mapped instanceof RateLimitError) {
            await delayForRateLimit(err);
          }
          throw mapped;
        }
        const latencyMs = Date.now() - start;

        const refusalText = findRefusal(response);
        if (refusalText !== null) {
          throw new RefusalError(`OpenAI declined to generate a structured response for "${promptId}" (${promptVersion}).`);
        }

        if (response.status === "incomplete") {
          const reason = response.incomplete_details?.reason ?? "unknown";
          if (reason === "content_filter") {
            // Policy-blocked, like a refusal: retrying identically will not help.
            throw new RefusalError(`OpenAI withheld the response for "${promptId}" (${promptVersion}) due to content filtering.`);
          }
          throw new IncompleteOutputError(
            `OpenAI response for "${promptId}" (${promptVersion}) was truncated (${reason}).`
          );
        }

        if (response.output_parsed === null || response.output_parsed === undefined) {
          throw new MalformedResponseError(`OpenAI response for "${promptId}" (${promptVersion}) had no parsed content.`);
        }

        // Defense in depth (see file header): re-validate against the
        // exact same canonical schema, never trusting output_parsed alone.
        let validated;
        try {
          validated = schema.parse(response.output_parsed);
        } catch (zodErr) {
          throw new SchemaValidationError(
            `OpenAI response for "${promptId}" (${promptVersion}) failed local schema validation.`,
            { issues: summarizeZodIssues(zodErr) }
          );
        }

        const usage = response.usage
          ? {
              inputTokens: response.usage.input_tokens,
              cachedInputTokens: response.usage.input_tokens_details?.cached_tokens ?? 0,
              outputTokens: response.usage.output_tokens,
              reasoningTokens: response.usage.output_tokens_details?.reasoning_tokens ?? 0,
              totalTokens: response.usage.total_tokens,
            }
          : undefined;

        return { value: validated, usage, latencyMs };
      });

      return {
        data: attemptResult.value,
        meta: {
          provider: "openai",
          model,
          latencyMs: attemptResult.latencyMs,
          attempts,
          ...(attemptResult.usage ? { usage: attemptResult.usage } : {}),
        },
      };
    },
  };
}

/** @returns {string|null} the refusal text if the response contains one, else null. */
function findRefusal(response) {
  for (const item of response.output ?? []) {
    if (item.type !== "message" || !Array.isArray(item.content)) continue;
    const refusalItem = item.content.find((c) => c.type === "refusal");
    if (refusalItem) return refusalItem.refusal ?? "";
  }
  return null;
}

/**
 * Maps the OpenAI SDK's own error classes into this codebase's
 * provider-neutral taxonomy (server/ai/errors.js). Every returned message
 * is short and sanitized; the original SDK error is attached only as
 * `cause`, never interpolated into the message itself (it may contain a
 * raw response body).
 */
function mapOpenAIError(err, { promptId, promptVersion }) {
  const label = `"${promptId}" (${promptVersion})`;
  const status = err?.status;

  if (status === 401) return new AuthenticationError(`OpenAI rejected the request's credentials for ${label}.`, { cause: err });
  if (status === 403) return new AuthenticationError(`OpenAI denied model/permission access for ${label}.`, { cause: err });
  if (status === 404) return new AuthenticationError(`OpenAI could not find the configured model for ${label}.`, { cause: err });
  if (status === 400) return new MalformedResponseError(`OpenAI rejected the request for ${label} (invalid configuration or request shape).`, { cause: err });
  if (status === 429) return new RateLimitError(`OpenAI rate-limited the request for ${label}.`, { cause: err });
  if (typeof status === "number" && status >= 500) return new ProviderServerError(`OpenAI's server failed processing ${label}.`, { cause: err });
  if (err?.name === "APIConnectionTimeoutError" || err?.name === "APIUserAbortError") return new TimeoutError(`OpenAI request for ${label} timed out.`, { cause: err });
  if (err?.name === "APIConnectionError") return new ProviderServerError(`Could not reach OpenAI for ${label}.`, { cause: err });

  return new ProviderServerError(`Unexpected OpenAI error for ${label}.`, { cause: err });
}

/** Sanitized, bounded validation summary — never the raw model output. */
function summarizeZodIssues(zodError) {
  if (!zodError?.issues) return [];
  return zodError.issues.slice(0, 8).map((issue) => {
    const path = issue.path.join(".") || "(root)";
    return `${path}: ${issue.message}`;
  });
}
