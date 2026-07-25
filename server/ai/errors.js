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
