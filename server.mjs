/**
 * ScenarioRank AI V2 — Backend entry point
 *
 * This file is a thin composition root: load environment, resolve the
 * OpenAI provider once for the process's lifetime, build the Express app,
 * and listen. All actual behavior lives in server/:
 *   server/config/   — environment loading + provider-config validation
 *   server/ai/        — provider-neutral contract, the OpenAI adapter, schemas, prompts, pricing
 *   server/domain/     — deterministic scoring formulas
 *   server/pipeline/   — orchestration (LLM stages + deterministic stages)
 *   server/http/       — Express transport (routes only)
 *
 * There is exactly one supported provider (OpenAI) — see
 * docs/decisions/ADR-0004-single-openai-provider.md. `createProvider()`
 * therefore takes no provider-name argument; there is no other branch to
 * select.
 *
 * Run with: node server.mjs
 */

import {
  loadEnv,
  resolveStartupAiStatus,
  resolveMaxCandidates,
  resolveMaxProviderRequestsPerRun,
} from "./server/config/env.js";
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
// server/http never read process.env themselves. Both are safety nets,
// not normal-path limiters: AI_MAX_CANDIDATES protects API budget by
// rejecting oversized requests before they reach the model;
// AI_MAX_PROVIDER_REQUESTS_PER_RUN protects against a future bug that
// would make more than the 4 provider requests this architecture ever
// legitimately needs (docs/PROJECT_STATUS.md).
const maxCandidates = resolveMaxCandidates();
if (maxCandidates.invalidInput !== undefined) {
  console.warn(
    `⚠️  AI_MAX_CANDIDATES="${maxCandidates.invalidInput}" is invalid (must be an integer 2-10) — using the default of ${maxCandidates.value}.`
  );
}
const maxProviderRequestsPerRun = resolveMaxProviderRequestsPerRun();
if (maxProviderRequestsPerRun.invalidInput !== undefined) {
  console.warn(
    `⚠️  AI_MAX_PROVIDER_REQUESTS_PER_RUN="${maxProviderRequestsPerRun.invalidInput}" is invalid (must be an integer 1-4) — using the default of ${maxProviderRequestsPerRun.value}.`
  );
}

let provider = null;
if (aiStatus.aiEnabled) {
  provider = createProvider();
}

const app = createApp({
  provider,
  aiEnabled: aiStatus.aiEnabled,
  maxCandidates: maxCandidates.value,
  maxProviderRequestsPerRun: maxProviderRequestsPerRun.value,
});

app.listen(PORT, () => {
  console.log(`\n🚀 ScenarioRank AI V2 Backend`);
  console.log(`   Running on: http://localhost:${PORT}`);
  console.log(`   Health:     http://localhost:${PORT}/health`);
  console.log(`   API:        http://localhost:${PORT}/api/decision`);
  console.log(`   Stream:     http://localhost:${PORT}/api/decision/stream\n`);
  if (aiStatus.aiEnabled) {
    console.log(`   AI provider: ${provider.name} (${provider.model})`);
    console.log(`   Max candidates per run: ${maxCandidates.value}${maxCandidates.usedDefault ? " (default)" : " (configured)"}`);
    console.log(`   Max provider requests per run: ${maxProviderRequestsPerRun.value}${maxProviderRequestsPerRun.usedDefault ? " (default)" : " (configured)"}`);
  } else {
    console.warn(`⚠️  AI provider unavailable: ${aiStatus.reason}`);
  }
});
