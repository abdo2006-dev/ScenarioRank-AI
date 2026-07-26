/**
 * @file Provider-neutral contract types.
 *
 * These are JSDoc typedefs, not TypeScript — the backend stays plain ESM
 * JavaScript (see docs/decisions/ADR-0002-provider-abstraction.md for why).
 * No provider SDK type ever appears outside server/ai/providers/*; every
 * caller of a provider only ever sees the shapes defined here. Kept even
 * with a single provider (OpenAI) because it separates pipeline logic
 * from SDK-specific request handling — see docs/decisions/
 * ADR-0004-single-openai-provider.md, "why the provider-neutral contract
 * is still worth keeping with one provider."
 */

/**
 * @typedef {Object} StructuredGenerationRequest
 * @property {string} system - System/instruction prompt.
 * @property {string} prompt - User-turn prompt content.
 * @property {import("zod").ZodType} schema - Canonical schema the parsed
 *   response must satisfy. Always Zod; the OpenAI adapter converts it
 *   internally via the official SDK's own `zodTextFormat()` helper
 *   (openai/helpers/zod), then re-validates the result against this exact
 *   schema instance a second time — see server/ai/providers/openaiProvider.js.
 * @property {string} promptId - Stable identifier for the calling prompt,
 *   e.g. "context-analysis". Used for logging/metadata, never for
 *   branching provider behavior.
 * @property {string} promptVersion - Version tag for the calling prompt,
 *   e.g. "v1". Bumped only when prompt wording changes meaningfully.
 * @property {number} [maxOutputTokens] - Upper bound on generated tokens.
 * @property {number} [timeoutMs] - Per-attempt timeout in milliseconds.
 */

/**
 * @typedef {Object} StructuredGenerationMeta
 * @property {"openai"} provider
 * @property {string} model - Exact model identifier used for this call.
 * @property {number} latencyMs - Wall-clock time for the (final) attempt.
 * @property {number} attempts - Total attempts made, including the one that
 *   ultimately succeeded (1 = succeeded on the first try).
 * @property {{inputTokens?: number, cachedInputTokens?: number, outputTokens?: number, reasoningTokens?: number, totalTokens?: number}} [usage] -
 *   Token counts, when the provider reports them. Absent, not zero, when
 *   unknown. `outputTokens` already includes any `reasoningTokens` (a
 *   labeled subset, not additive) — see server/ai/pricing/openaiPricing.js.
 */

/**
 * @typedef {Object} StructuredGenerationResult
 * @property {*} data - Parsed response, already validated against the
 *   caller-supplied Zod schema. Callers never receive unvalidated data.
 * @property {StructuredGenerationMeta} meta
 */

/**
 * @typedef {Object} AIProvider
 * @property {"openai"} name
 * @property {string} model - The exact model this instance was constructed
 *   with. Constant for the instance's lifetime — callers resolve one
 *   provider instance per run and never mutate or re-resolve it mid-run.
 * @property {(request: StructuredGenerationRequest) => Promise<StructuredGenerationResult>} generateStructured
 */

export {};
