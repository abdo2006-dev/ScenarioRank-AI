/**
 * @file Provider factory.
 *
 * Since Phase 1B, this is the sole way the live application constructs an
 * AI provider — server.mjs calls createProvider() once at process startup
 * (see resolveStartupAiStatus() in server/config/env.js) and reuses that
 * one instance for the process's entire lifetime. The Anthropic-specific
 * request path this factory was designed to replace has been removed.
 *
 * createProvider() validates and builds a provider only when explicitly
 * called with a provider name — there is no implicit "read AI_PROVIDER and
 * construct something" behavior that runs on import.
 */

import { ConfigurationError } from "./errors.js";
import { createGroqProvider } from "./providers/groqProvider.js";
import { createGeminiProvider } from "./providers/geminiProvider.js";

export const SUPPORTED_PROVIDERS = Object.freeze(["groq", "gemini"]);

/**
 * @param {string} providerName - Must be exactly "groq" or "gemini".
 * @param {{ env?: Record<string, string|undefined> }} [options]
 * @returns {import("./types.js").AIProvider}
 */
export function createProvider(providerName, { env = process.env } = {}) {
  if (providerName !== "groq" && providerName !== "gemini") {
    throw new ConfigurationError(
      `Unsupported AI_PROVIDER "${providerName}". Supported providers: ${SUPPORTED_PROVIDERS.join(", ")}.`
    );
  }

  if (providerName === "groq") {
    const apiKey = env.GROQ_API_KEY;
    if (!apiKey) {
      throw new ConfigurationError('GROQ_API_KEY is required when AI_PROVIDER is "groq".');
    }
    const model = env.GROQ_MODEL || "openai/gpt-oss-120b";
    return createGroqProvider({ apiKey, model });
  }

  // providerName === "gemini"
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new ConfigurationError('GEMINI_API_KEY is required when AI_PROVIDER is "gemini".');
  }
  const model = env.GEMINI_MODEL;
  if (!model) {
    throw new ConfigurationError(
      'GEMINI_MODEL is required when AI_PROVIDER is "gemini" — there is no built-in default because ' +
      "Gemini model identifiers change over time. See .env.example / https://ai.google.dev/gemini-api/docs/models."
    );
  }
  return createGeminiProvider({ apiKey, model });
}
