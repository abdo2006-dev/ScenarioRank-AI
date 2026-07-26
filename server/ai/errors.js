/**
 * @file Provider-neutral error taxonomy (Phase 1A).
 *
 * Every adapter maps its own SDK's errors into one of these classes before
 * they leave server/ai/providers/*. Callers (and, eventually, the SSE route
 * in Phase 1B) only ever need to branch on these types, never on a
 * provider-specific error shape.
 *
 * Safety rule enforced by every constructor here: `message` must already be
 * a short, sanitized, developer-safe string. Never pass a raw API key, a raw
 * provider response body, candidate/PII data, or a raw stack trace as the
 * message. Use the `cause` option (standard Error cause chaining) if you
 * need to keep the original error for local debugging — `cause` is not
 * printed by default and must never itself be surfaced to an HTTP response.
 */

/** Base class for every provider-neutral AI error. */
export class AIProviderError extends Error {
  /**
   * @param {string} message - Sanitized, safe-to-display message.
   * @param {{ code: string, retryable: boolean, cause?: unknown }} options
   */
  constructor(message, { code, retryable, cause }) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = new.target.name;
    this.code = code;
    this.retryable = retryable;
  }
}

/** AI_PROVIDER is unset/unsupported, or a selected provider is missing required config. */
export class ConfigurationError extends AIProviderError {
  constructor(message, opts = {}) {
    super(message, { code: "configuration", retryable: false, ...opts });
  }
}

/** The provider rejected the request's credentials. */
export class AuthenticationError extends AIProviderError {
  constructor(message, opts = {}) {
    super(message, { code: "authentication", retryable: false, ...opts });
  }
}

/** The provider throttled the request. */
export class RateLimitError extends AIProviderError {
  constructor(message, opts = {}) {
    super(message, { code: "rate_limit", retryable: true, ...opts });
  }
}

/** The request did not complete within the configured timeout. */
export class TimeoutError extends AIProviderError {
  constructor(message, opts = {}) {
    super(message, { code: "timeout", retryable: true, ...opts });
  }
}

/** The provider itself failed (5xx / transient infrastructure failure). */
export class ProviderServerError extends AIProviderError {
  constructor(message, opts = {}) {
    super(message, { code: "provider_server", retryable: true, ...opts });
  }
}

/** The response could not be parsed into JSON at all, or had no content. */
export class MalformedResponseError extends AIProviderError {
  constructor(message, opts = {}) {
    super(message, { code: "malformed_response", retryable: true, ...opts });
  }
}

/** The response parsed as JSON but failed local Zod validation. */
export class SchemaValidationError extends AIProviderError {
  /**
   * @param {string} message
   * @param {{ issues?: string[] }} [details] - Short, sanitized validation
   *   summary lines (e.g. "role.title: expected string, received number").
   *   Never the raw model output.
   */
  constructor(message, { issues, ...opts } = {}) {
    super(message, { code: "schema_validation", retryable: true, ...opts });
    this.issues = issues ?? [];
  }
}

/** Every attempt (initial + retry) was exhausted without success. */
export class RetryExhaustedError extends AIProviderError {
  /**
   * @param {string} message
   * @param {{ attempts: number, lastError?: AIProviderError }} details
   */
  constructor(message, { attempts, lastError, ...opts } = {}) {
    super(message, { code: "retry_exhausted", retryable: false, ...opts });
    this.attempts = attempts;
    this.lastError = lastError;
  }
}

/**
 * The model declined to produce the requested content (a distinct
 * response state from a malformed or schema-invalid response — see
 * docs/decisions/ADR-0004-single-openai-provider.md). Never blindly
 * retried: a refusal is the model's decision, not a transient failure, so
 * retrying identically is not expected to change the outcome.
 */
export class RefusalError extends AIProviderError {
  constructor(message, opts = {}) {
    super(message, { code: "refusal", retryable: false, ...opts });
  }
}

/**
 * The response was cut off before completing (e.g. OpenAI's
 * `status: "incomplete"` with `incomplete_details.reason ===
 * "max_output_tokens"`). Retryable so the single retry owner can attempt
 * again — but only the caller (the adapter) may decide to raise the
 * output-token budget on that one retry; retry.js itself never invents a
 * larger budget, and this error must never be retried twice with the same
 * insufficient budget.
 */
export class IncompleteOutputError extends AIProviderError {
  constructor(message, opts = {}) {
    super(message, { code: "incomplete_output", retryable: true, ...opts });
  }
}

/**
 * A batch response (candidate scoring or pairing analysis) passed Zod
 * schema validation for every individual item, but the set of IDs it
 * covered did not exactly match what was submitted — a duplicate, a
 * missing entry, or an ID/pair that was never asked about. This is
 * business-level integrity, not shape validation, so it is detected by
 * the pipeline after a successful `generateStructured()` call, not by the
 * provider adapter itself. Retryable: treated the same as a schema
 * failure — one controlled corrective retry, never a fabricated fallback
 * for the missing entries.
 */
export class BatchIntegrityError extends AIProviderError {
  /**
   * @param {string} message
   * @param {{ missing?: string[], unknown?: string[], duplicate?: string[] }} [details]
   */
  constructor(message, { missing, unknown, duplicate, ...opts } = {}) {
    super(message, { code: "batch_integrity", retryable: true, ...opts });
    this.missing = missing ?? [];
    this.unknown = unknown ?? [];
    this.duplicate = duplicate ?? [];
  }
}

/**
 * A safety net, not a normal-path limiter: the pipeline tracks how many
 * provider requests a single run has made and refuses to make another
 * once the configured cap (AI_MAX_PROVIDER_REQUESTS_PER_RUN) would be
 * exceeded. Firing this means a bug or a future code change made more
 * provider requests than this architecture is designed to need — fail
 * safely rather than spend API credit unexpectedly. Never retryable.
 */
export class ProviderRequestBudgetExceededError extends AIProviderError {
  constructor(message, opts = {}) {
    super(message, { code: "request_budget_exceeded", retryable: false, ...opts });
  }
}
