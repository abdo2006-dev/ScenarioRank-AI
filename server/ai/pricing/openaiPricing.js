/**
 * @file Versioned OpenAI pricing table and cost estimation
 * (docs/decisions/ADR-0004-single-openai-provider.md).
 *
 * Pricing retrieved directly from OpenAI's own model-specific
 * documentation page, not a third-party aggregator or training data:
 *   https://platform.openai.com/docs/models/gpt-5-mini
 *   (redirects to https://developers.openai.com/api/docs/models/gpt-5-mini)
 * Retrieved: 2026-07-26.
 *
 * `gpt-5-mini` no longer appears in OpenAI's primary "Standard pricing"
 * comparison table (which currently leads with the `gpt-5.6` family and
 * `gpt-5.4-mini`/`gpt-5.4-nano`) but its own model page was live, current,
 * and not marked deprecated at the time this was written — see ADR-0004
 * for the full verification trail, including a real API probe confirming
 * the model is available to this project's account.
 *
 * OpenAI bills reasoning tokens at the same per-token rate as ordinary
 * output tokens — `usage.output_tokens_details.reasoning_tokens` is a
 * labeled *subset* of `usage.output_tokens`, not a separate line item, so
 * this module only ever multiplies input/cached-input/output token
 * counts, never reasoning tokens again on top of output tokens (that
 * would double-count them).
 *
 * IMPORTANT: this is a displayed *estimate* for the user's own awareness
 * of their ~$3 budget, not an invoice — OpenAI's own billing dashboard is
 * the source of truth. Update PRICING_RETRIEVED_ON and the table below
 * together whenever pricing is re-verified; never silently assume a price
 * is still correct.
 */

export const PRICING_RETRIEVED_ON = "2026-07-26";
export const PRICING_SOURCE_URL = "https://platform.openai.com/docs/models/gpt-5-mini";

/**
 * Prices are USD per 1,000,000 tokens. Only models this project has
 * actually verified pricing for are listed — see `estimateCostUsd()`
 * below for what happens for any other model.
 */
const PRICING_PER_MILLION_TOKENS_USD = Object.freeze({
  "gpt-5-mini": Object.freeze({
    input: 0.25,
    cachedInput: 0.025,
    output: 2.0,
  }),
});

/**
 * @param {string} model
 * @returns {{ input: number, cachedInput: number, output: number } | null}
 */
export function getPricingForModel(model) {
  return PRICING_PER_MILLION_TOKENS_USD[model] ?? null;
}

/**
 * @param {{ model: string, inputTokens?: number, cachedInputTokens?: number, outputTokens?: number }} usage
 *   `outputTokens` must already include any reasoning tokens (that is how
 *   `response.usage.output_tokens` is reported) — do not add
 *   `reasoningTokens` on top of this value.
 * @returns {number|null} an estimated cost in USD, or `null` if this
 *   model's pricing is not in the table above — never a guessed or
 *   extrapolated number for an unrecognized model.
 */
export function estimateCostUsd({ model, inputTokens = 0, cachedInputTokens = 0, outputTokens = 0 }) {
  const pricing = getPricingForModel(model);
  if (!pricing) return null;

  const uncachedInputTokens = Math.max(0, inputTokens - cachedInputTokens);
  const cost =
    (uncachedInputTokens / 1_000_000) * pricing.input +
    (cachedInputTokens / 1_000_000) * pricing.cachedInput +
    (outputTokens / 1_000_000) * pricing.output;

  return Math.round(cost * 1_000_000) / 1_000_000;
}
