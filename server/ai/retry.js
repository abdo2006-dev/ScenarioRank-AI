/**
 * @file The single retry owner for the OpenAI provider adapter
 * (docs/decisions/ADR-0004-single-openai-provider.md).
 *
 * The OpenAI client is constructed with its own automatic retries turned
 * off (`maxRetries: 0` — confirmed against the installed SDK's own type
 * definitions), so this is the only place in the codebase that decides
 * whether to try an LLM call again. Whether an error is retryable at all
 * is decided once, in errors.js (`error.retryable`) — this function never
 * re-derives that.
 *
 * No generic backoff/jitter delay is used here; the OpenAI adapter itself
 * separately honors a safe, capped Retry-After delay for rate limits
 * before this function's next attempt runs (server/ai/providers/openaiProvider.js).
 */

import { AIProviderError, RetryExhaustedError } from "./errors.js";

/**
 * @template T
 * @param {(context: { attempt: number, previousError?: AIProviderError }) => Promise<T>} attemptFn
 * @param {{ maxAttempts?: number }} [options]
 * @returns {Promise<{ data: T, attempts: number }>}
 */
export async function withRetry(attemptFn, { maxAttempts = 2 } = {}) {
  let previousError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const data = await attemptFn({ attempt, previousError });
      return { data, attempts: attempt };
    } catch (err) {
      const retryable = err instanceof AIProviderError ? err.retryable : false;
      if (!retryable) throw err;
      if (attempt === maxAttempts) {
        throw new RetryExhaustedError(
          `Exhausted ${maxAttempts} attempt(s) — last error: ${err.message}`,
          { attempts: attempt, lastError: err }
        );
      }
      previousError = err;
      // loop continues: exactly one controlled retry for retryable errors
    }
  }
  // Unreachable when maxAttempts >= 1, kept for type-completeness.
  throw new RetryExhaustedError("Exhausted all attempts", { attempts: maxAttempts });
}
