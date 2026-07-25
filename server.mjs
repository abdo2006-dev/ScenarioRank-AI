/**
 * ScenarioRank AI V2 — Backend entry point
 *
 * This file is now a thin composition root: load environment, resolve the
 * configured AI provider once for the process's lifetime, build the
 * Express app, and listen. All actual behavior lives in server/:
 *   server/config/   — environment loading + provider-config validation
 *   server/ai/        — provider-neutral contract, adapters, schemas, prompts
 *   server/domain/     — deterministic scoring formulas
 *   server/pipeline/   — orchestration (LLM stages + deterministic stages)
 *   server/http/       — Express transport (routes only)
 *
 * Run with: node server.mjs
 */

import { loadEnv, resolveStartupAiStatus, resolveCandidateConcurrency } from "./server/config/env.js";
import { createProvider } from "./server/ai/providerFactory.js";
import { createApp } from "./server/http/app.js";

loadEnv();

const NODE_ENV = process.env.NODE_ENV || "development";
const PORT = process.env.PORT || 3001;

// In production, invalid/missing provider configuration throws here and
// the process exits — a clear startup failure instead of a server that
// silently can't do anything useful. In development, it's tolerated: the
// server starts with AI marked unavailable so non-AI work (frontend
// development, /health) stays usable without live credentials.
const aiStatus = resolveStartupAiStatus({ nodeEnv: NODE_ENV });

// Resolved once, here, and passed down explicitly — server/pipeline and
// server/http never read process.env themselves. Defaults to 1: a real
// Groq smoke test showed the default account tier rate-limiting at
// concurrency 2 (see docs/PROJECT_STATUS.md). An invalid value falls back
// to the default with a visible warning rather than failing startup —
// this is a tuning knob, not a required-for-correctness setting.
const concurrency = resolveCandidateConcurrency();
if (concurrency.invalidInput !== undefined) {
  console.warn(
    `⚠️  AI_CANDIDATE_CONCURRENCY="${concurrency.invalidInput}" is invalid (must be an integer 1-4) — using the default of ${concurrency.value}.`
  );
}

let provider = null;
if (aiStatus.aiEnabled) {
  provider = createProvider(aiStatus.provider);
}

const app = createApp({ provider, aiEnabled: aiStatus.aiEnabled, candidateConcurrency: concurrency.value });

app.listen(PORT, () => {
  console.log(`\n🚀 ScenarioRank AI V2 Backend`);
  console.log(`   Running on: http://localhost:${PORT}`);
  console.log(`   Health:     http://localhost:${PORT}/health`);
  console.log(`   API:        http://localhost:${PORT}/api/decision`);
  console.log(`   Stream:     http://localhost:${PORT}/api/decision/stream\n`);
  if (aiStatus.aiEnabled) {
    console.log(`   AI provider: ${provider.name} (${provider.model})`);
    console.log(`   Candidate-scoring concurrency: ${concurrency.value}${concurrency.usedDefault ? " (default)" : " (configured)"}`);
  } else {
    console.warn(`⚠️  AI provider unavailable: ${aiStatus.reason}`);
  }
});
