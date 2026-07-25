/**
 * @file The single retry owner for provider adapters (Phase 1A).
 *
 * Both SDK clients are constructed with their own automatic retries turned
 * off (Groq: `maxRetries: 0`; Gemini: `httpOptions.retryOptions.attempts: 1`
 * — confirmed against each SDK's installed type definitions), so this is
 * the only place in the codebase that decides whether to try an LLM call
 * again. Whether an error is retryable at all is decided once, in
 * errors.js (`error.retryable`) — this function never re-derives that.
 *
 * No backoff/jitter delay is used: Phase 1A prioritizes deterministic,
 * fast tests over production backoff tuning, which can be layered on in
 * a later phase without changing this function's contract.
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
