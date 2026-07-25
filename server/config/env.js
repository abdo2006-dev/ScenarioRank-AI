/**
 * @file Environment loading and provider-config validation (Phase 1B).
 *
 * Precedence (highest wins):
 *   1. real process environment (already set before loadEnv() runs — e.g.
 *      exported in a shell, or injected by CI/hosting) — never overridden;
 *   2. .env.local (developer-local overrides; git-ignored);
 *   3. .env (checked-in-shape template values / shared defaults).
 *
 * Implementation: load .env.local first, then .env, each pass only filling
 * in keys not already present in `env`. Because .env.local is applied
 * before .env, its values win whenever both files define the same key.
 * Because every pass checks "not already present" before writing, nothing
 * ever overwrites a value that was already in the real process environment
 * when loadEnv() started running.
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function parseEnvFile(path) {
  const result = {};
  const lines = readFileSync(path, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    result[key] = value;
  }
  return result;
}

/**
 * @param {{cwd?: string, env?: Record<string,string|undefined>}} [options]
 * @returns {{ loadedFiles: string[] }} which files were found and applied,
 *   in the order they were applied (.env.local before .env) — never the
 *   values themselves, so this is safe to log.
 */
export function loadEnv({ cwd = process.cwd(), env = process.env } = {}) {
  const loadedFiles = [];
  const candidates = [
    [resolve(cwd, ".env.local"), ".env.local"],
    [resolve(cwd, ".env"), ".env"],
  ];

  for (const [path, label] of candidates) {
    if (!existsSync(path)) continue;
    const parsed = parseEnvFile(path);
    for (const [key, value] of Object.entries(parsed)) {
      if (!(key in env)) env[key] = value;
    }
    loadedFiles.push(label);
  }

  return { loadedFiles };
}

export const SUPPORTED_PROVIDERS = Object.freeze(["groq", "gemini"]);

/**
 * Pure check — does not throw, does not read files, does not log. Used by
 * both startup validation and /health.
 * @param {{env?: Record<string,string|undefined>}} [options]
 * @returns {{ok: true, provider: "groq"|"gemini"} | {ok: false, provider: string|undefined, reason: string}}
 */
export function checkProviderConfig({ env = process.env } = {}) {
  const provider = env.AI_PROVIDER;
  if (!provider) {
    return { ok: false, provider: undefined, reason: "AI_PROVIDER is not set." };
  }
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    return {
      ok: false,
      provider,
      reason: `Unsupported AI_PROVIDER "${provider}". Supported providers: ${SUPPORTED_PROVIDERS.join(", ")}.`,
    };
  }
  if (provider === "groq" && !env.GROQ_API_KEY) {
    return { ok: false, provider, reason: 'GROQ_API_KEY is required when AI_PROVIDER="groq".' };
  }
  if (provider === "gemini") {
    if (!env.GEMINI_API_KEY) {
      return { ok: false, provider, reason: 'GEMINI_API_KEY is required when AI_PROVIDER="gemini".' };
    }
    if (!env.GEMINI_MODEL) {
      return {
        ok: false,
        provider,
        reason: 'GEMINI_MODEL is required when AI_PROVIDER="gemini" (no built-in default — model IDs change over time).',
      };
    }
  }
  return { ok: true, provider };
}

export const DEFAULT_CANDIDATE_CONCURRENCY = 1;
export const MIN_CANDIDATE_CONCURRENCY = 1;
export const MAX_CANDIDATE_CONCURRENCY = 4;

/**
 * Resolves AI_CANDIDATE_CONCURRENCY — how many candidate-scoring requests
 * run at once. Defaults to 1: a real Groq smoke test during Phase 1D
 * showed the default account tier returning HTTP 429 the moment two
 * candidate-scoring requests ran concurrently, while sequential calls
 * succeeded reliably (see docs/PROJECT_STATUS.md and
 * docs/decisions/ADR-0003-runtime-provider-configuration.md). Operators
 * with a higher provider quota may deliberately raise this — see
 * .env.example.
 *
 * This is a performance/reliability tuning knob, not a correctness
 * requirement, so an invalid value falls back to the safe default with a
 * clear reason rather than failing startup (unlike provider
 * configuration, which does fail startup in production).
 * @param {{env?: Record<string,string|undefined>}} [options]
 * @returns {{ value: number, usedDefault: boolean, invalidInput?: string }}
 */
export function resolveCandidateConcurrency({ env = process.env } = {}) {
  const raw = env.AI_CANDIDATE_CONCURRENCY;
  if (raw === undefined || raw.trim() === "") {
    return { value: DEFAULT_CANDIDATE_CONCURRENCY, usedDefault: true };
  }
  const parsed = Number(raw);
  const isValidInteger = Number.isInteger(parsed);
  if (!isValidInteger || parsed < MIN_CANDIDATE_CONCURRENCY || parsed > MAX_CANDIDATE_CONCURRENCY) {
    return { value: DEFAULT_CANDIDATE_CONCURRENCY, usedDefault: true, invalidInput: raw };
  }
  return { value: parsed, usedDefault: false };
}

/**
 * Startup gate. In production, invalid/missing selected-provider
 * configuration fails the process immediately and clearly (throws) rather
 * than starting in a half-broken state. In development, it's tolerated:
 * the server starts with AI marked unavailable so the rest of the app
 * (frontend work, non-AI routes) stays usable without live credentials —
 * mirroring the tolerant behavior the codebase already had for
 * ANTHROPIC_API_KEY before this migration.
 * @param {{env?: Record<string,string|undefined>, nodeEnv?: string}} [options]
 * @returns {{ aiEnabled: boolean, provider: string|undefined, reason: string|null }}
 */
export function resolveStartupAiStatus({ env = process.env, nodeEnv = env.NODE_ENV || "development" } = {}) {
  const check = checkProviderConfig({ env });
  if (!check.ok) {
    if (nodeEnv === "production") {
      throw new Error(`AI provider configuration is invalid at startup: ${check.reason}`);
    }
    return { aiEnabled: false, provider: check.provider, reason: check.reason };
  }
  return { aiEnabled: true, provider: check.provider, reason: null };
}
