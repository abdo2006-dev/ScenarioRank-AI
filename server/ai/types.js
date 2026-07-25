/**
 * @file Provider-neutral contract types (Phase 1A).
 *
 * These are JSDoc typedefs, not TypeScript — the backend stays plain ESM
 * JavaScript (see docs/decisions/ADR-0002-provider-abstraction.md for why).
 * No provider SDK type ever appears outside server/ai/providers/*; every
 * caller of a provider only ever sees the shapes defined here.
 */

/**
 * @typedef {Object} StructuredGenerationRequest
 * @property {string} system - System/instruction prompt.
 * @property {string} prompt - User-turn prompt content.
 * @property {import("zod").ZodType} schema - Canonical schema the parsed
 *   response must satisfy. Always Zod; each adapter converts it internally
 *   into whatever shape its own SDK requires (see schemaConversion.js).
 * @property {string} promptId - Stable identifier for the calling prompt,
 *   e.g. "role-analysis". Used for logging/metadata, never for branching
 *   provider behavior.
 * @property {string} promptVersion - Version tag for the calling prompt,
 *   e.g. "v1". Bumped only when prompt wording changes meaningfully.
 * @property {number} [maxOutputTokens] - Upper bound on generated tokens.
 * @property {number} [timeoutMs] - Per-attempt timeout in milliseconds.
 */

/**
 * @typedef {Object} StructuredGenerationMeta
 * @property {"groq"|"gemini"} provider
 * @property {string} model - Exact model identifier used for this call.
 * @property {number} latencyMs - Wall-clock time for the (final) attempt.
 * @property {number} attempts - Total attempts made, including the one that
 *   ultimately succeeded (1 = succeeded on the first try).
 * @property {{inputTokens?: number, outputTokens?: number}} [usage] - Token
 *   counts, when the provider reports them. Absent, not zero, when unknown.
 */

/**
 * @typedef {Object} StructuredGenerationResult
 * @property {*} data - Parsed response, already validated against the
 *   caller-supplied Zod schema. Callers never receive unvalidated data.
 * @property {StructuredGenerationMeta} meta
 */

/**
 * @typedef {Object} AIProvider
 * @property {"groq"|"gemini"} name
 * @property {(request: StructuredGenerationRequest) => Promise<StructuredGenerationResult>} generateStructured
 */

export {};
