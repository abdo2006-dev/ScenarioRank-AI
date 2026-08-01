import { defineConfig } from "vitest/config";

/**
 * Evaluation-harness tests (Phase 3A). Kept in their own project so the
 * frontend, backend, and evaluation test counts stay separately reportable,
 * and so a change to the harness can be run in isolation.
 *
 * These tests execute the real production pipeline with offline fake
 * providers. None of them makes a network request, and none of them calls
 * OpenAI — a test in evals/repositoryProtection.test.js enforces that the
 * harness cannot reach the provider factory from fixture mode.
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["evals/**/*.test.js"],
  },
});
