import { describe, it, expect } from "vitest";
import { estimateCostUsd, getPricingForModel } from "./openaiPricing.js";

describe("openaiPricing — estimateCostUsd", () => {
  it("returns null for a model with no recorded pricing, never a guessed number", () => {
    expect(estimateCostUsd({ model: "gpt-5.4-mini", inputTokens: 1000, outputTokens: 1000 })).toBeNull();
    expect(estimateCostUsd({ model: "unknown-model-xyz", inputTokens: 1000, outputTokens: 1000 })).toBeNull();
    expect(getPricingForModel("gpt-5.4-mini")).toBeNull();
  });

  it("computes cost from uncached input, cached input, and output tokens at gpt-5-mini's real rates", () => {
    // gpt-5-mini: $0.25 / 1M input, $0.025 / 1M cached input, $2.00 / 1M output.
    const cost = estimateCostUsd({ model: "gpt-5-mini", inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 1_000_000 });
    expect(cost).toBeCloseTo(0.25 + 2.0, 6);
  });

  it("bills cached input tokens at the cached rate, not the standard input rate", () => {
    const allCached = estimateCostUsd({ model: "gpt-5-mini", inputTokens: 1_000_000, cachedInputTokens: 1_000_000, outputTokens: 0 });
    const noneCached = estimateCostUsd({ model: "gpt-5-mini", inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 0 });
    expect(allCached).toBeCloseTo(0.025, 6);
    expect(noneCached).toBeCloseTo(0.25, 6);
    expect(allCached).toBeLessThan(noneCached);
  });

  it("does not double-count reasoning tokens (they are already part of outputTokens)", () => {
    // A caller must pass outputTokens as the SDK reports it (already
    // inclusive of reasoning tokens) — this test documents that contract
    // by asserting cost scales only with outputTokens, not any separate
    // reasoning figure.
    const cost = estimateCostUsd({ model: "gpt-5-mini", inputTokens: 0, outputTokens: 500 });
    expect(cost).toBeCloseTo((500 / 1_000_000) * 2.0, 9);
  });

  it("defaults missing token counts to zero", () => {
    expect(estimateCostUsd({ model: "gpt-5-mini" })).toBe(0);
  });

  it("returns a real pricing object for gpt-5-mini with input/cachedInput/output keys", () => {
    expect(getPricingForModel("gpt-5-mini")).toEqual({ input: 0.25, cachedInput: 0.025, output: 2.0 });
  });
});
