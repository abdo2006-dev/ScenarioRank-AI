/**
 * @file Provider factory (docs/decisions/ADR-0004-single-openai-provider.md).
 *
 * `server.mjs` calls `createProvider()` once at process startup (see
 * `resolveStartupAiStatus()` in server/config/env.js) and reuses that one
 * instance for the process's entire lifetime. There is exactly one
 * supported provider — OpenAI — so this factory takes no provider-name
 * argument; there is no other branch for a config value to select. See
 * ADR-0004 for why Groq/Gemini runtime selection was removed rather than
 * kept dormant.
 */

import { ConfigurationError } from "./errors.js";
import { createOpenAIProvider, DEFAULT_OPENAI_MODEL, REASONING_EFFORT_VALUES } from "./providers/openaiProvider.js";

/**
 * @param {{ env?: Record<string, string|undefined> }} [options]
 * @returns {import("./types.js").AIProvider}
 */
export function createProvider({ env = process.env } = {}) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ConfigurationError("OPENAI_API_KEY is required to construct the OpenAI provider.");
  }
  const model = env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;

  let reasoningEffort;
  const rawEffort = env.OPENAI_REASONING_EFFORT;
  if (rawEffort !== undefined && rawEffort.trim() !== "") {
    if (!REASONING_EFFORT_VALUES.includes(rawEffort)) {
      throw new ConfigurationError(
        `Invalid OPENAI_REASONING_EFFORT "${rawEffort}". Supported values: ${REASONING_EFFORT_VALUES.join(", ")}.`
      );
    }
    reasoningEffort = rawEffort;
  }

  return createOpenAIProvider({ apiKey, model, reasoningEffort });
}
