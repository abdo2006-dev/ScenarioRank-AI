/**
 * @file Environment loading and provider-config validation
 * (docs/decisions/ADR-0004-single-openai-provider.md).
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
 * when loadEnv() started running. This precedence behavior is unchanged
 * by ADR-0004 — only which keys are read has changed (OPENAI_-prefixed
 * variables instead of AI_PROVIDER, GROQ_-prefixed, and GEMINI_-prefixed
 * variables).
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { REASONING_EFFORT_VALUES } from "../ai/providers/openaiProvider.js";

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

/**
 * Pure check — does not throw, does not read files, does not log. Used by
 * both startup validation and /health. There is exactly one supported
 * provider (OpenAI), so this only ever checks OPENAI_API_KEY.
 * @param {{env?: Record<string,string|undefined>}} [options]
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function checkProviderConfig({ env = process.env } = {}) {
  if (!env.OPENAI_API_KEY) {
    return { ok: false, reason: "OPENAI_API_KEY is required." };
  }
  const rawEffort = env.OPENAI_REASONING_EFFORT;
  if (rawEffort !== undefined && rawEffort.trim() !== "" && !REASONING_EFFORT_VALUES.includes(rawEffort)) {
    return {
      ok: false,
      reason: `Invalid OPENAI_REASONING_EFFORT "${rawEffort}". Supported values: ${REASONING_EFFORT_VALUES.join(", ")}.`,
    };
  }
  return { ok: true };
}

/**
 * Startup gate. In production, invalid/missing provider configuration
 * fails the process immediately and clearly (throws) rather than starting
 * in a half-broken state. In development, it's tolerated: the server
 * starts with AI marked unavailable so the rest of the app (frontend
 * work, non-AI routes) stays usable without live credentials.
 * @param {{env?: Record<string,string|undefined>, nodeEnv?: string}} [options]
 * @returns {{ aiEnabled: boolean, reason: string|null }}
 */
export function resolveStartupAiStatus({ env = process.env, nodeEnv = env.NODE_ENV || "development" } = {}) {
  const check = checkProviderConfig({ env });
  if (!check.ok) {
    if (nodeEnv === "production") {
      throw new Error(`AI provider configuration is invalid at startup: ${check.reason}`);
    }
    return { aiEnabled: false, reason: check.reason };
  }
  return { aiEnabled: true, reason: null };
}

// ===== CANDIDATE-COUNT SAFEGUARD =====

export const DEFAULT_AI_MAX_CANDIDATES = 5;
export const MIN_AI_MAX_CANDIDATES = 2; // matches the existing "2+ candidates" input requirement
export const MAX_AI_MAX_CANDIDATES = 10; // hard technical ceiling — see docs/PROJECT_STATUS.md for why 5 is the default

/**
 * Resolves AI_MAX_CANDIDATES — the most candidates a single evaluation run
 * may batch-score in one provider request. Rejecting an over-limit request
 * before calling the model (server/http/routes.js) is what actually
 * protects API budget; this is a tuning knob for that ceiling, not a
 * correctness requirement, so an invalid value falls back to the safe
 * default with a clear reason rather than failing startup.
 * @param {{env?: Record<string,string|undefined>}} [options]
 * @returns {{ value: number, usedDefault: boolean, invalidInput?: string }}
 */
export function resolveMaxCandidates({ env = process.env } = {}) {
  const raw = env.AI_MAX_CANDIDATES;
  if (raw === undefined || raw.trim() === "") {
    return { value: DEFAULT_AI_MAX_CANDIDATES, usedDefault: true };
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < MIN_AI_MAX_CANDIDATES || parsed > MAX_AI_MAX_CANDIDATES) {
    return { value: DEFAULT_AI_MAX_CANDIDATES, usedDefault: true, invalidInput: raw };
  }
  return { value: parsed, usedDefault: false };
}

// ===== PROVIDER-REQUEST-BUDGET SAFEGUARD =====

export const DEFAULT_AI_MAX_PROVIDER_REQUESTS_PER_RUN = 4;
export const MIN_AI_MAX_PROVIDER_REQUESTS_PER_RUN = 1;
export const MAX_AI_MAX_PROVIDER_REQUESTS_PER_RUN = 4; // this architecture never legitimately needs more than 4 — see server/pipeline/runPipeline.js

/**
 * Resolves AI_MAX_PROVIDER_REQUESTS_PER_RUN — a safety net, not a normal-
 * path limiter. The pipeline's own architecture never needs more than 4
 * provider requests for a normal run (combined context analysis, batch
 * scoring, batch pairing, decision explanation); this cap exists so a bug
 * or future code change that accidentally made more requests fails safely
 * instead of silently spending API credit. An invalid value falls back to
 * the safe default with a clear reason.
 * @param {{env?: Record<string,string|undefined>}} [options]
 * @returns {{ value: number, usedDefault: boolean, invalidInput?: string }}
 */
export function resolveMaxProviderRequestsPerRun({ env = process.env } = {}) {
  const raw = env.AI_MAX_PROVIDER_REQUESTS_PER_RUN;
  if (raw === undefined || raw.trim() === "") {
    return { value: DEFAULT_AI_MAX_PROVIDER_REQUESTS_PER_RUN, usedDefault: true };
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < MIN_AI_MAX_PROVIDER_REQUESTS_PER_RUN || parsed > MAX_AI_MAX_PROVIDER_REQUESTS_PER_RUN) {
    return { value: DEFAULT_AI_MAX_PROVIDER_REQUESTS_PER_RUN, usedDefault: true, invalidInput: raw };
  }
  return { value: parsed, usedDefault: false };
}
