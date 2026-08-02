/**
 * Live-mode safeguard and budget tests.
 *
 * Every test here drives injected values. None of them constructs an OpenAI
 * client, and none of them makes a network request — the point is to prove the
 * refusals fire *before* anything reaches the API.
 */
import { describe, it, expect, beforeAll } from "vitest";

import { loadBenchmark } from "../datasets/loadBenchmark.js";
import {
  assertLiveModeAllowed,
  assertBudgetCoversPlan,
  estimateExecutionCost,
  estimateRunBudget,
  resolveBudgetLimit,
  createBudgetGuard,
  renderLivePlan,
  LiveModeRefusedError,
  BUDGET_ASSUMPTIONS,
} from "./liveRunner.js";

const PRICED_MODEL = "gpt-5-mini";
let benchmarkCases;

beforeAll(async () => {
  benchmarkCases = (await loadBenchmark()).cases;
});

/** A configuration that passes every guard, so each test can break exactly one. */
const validOptions = (overrides = {}) => ({
  live: true,
  allowCi: false,
  caseIds: ["case-001"],
  allCases: false,
  repetitions: 1,
  maxBudgetUsd: "1.00",
  env: { OPENAI_API_KEY: "test-key-not-used" },
  benchmarkCases,
  ...overrides,
});

describe("live mode refusals", () => {
  it("refuses without the --live flag", () => {
    expect(() => assertLiveModeAllowed(validOptions({ live: false }))).toThrow(
      /requires the explicit --live flag/,
    );
  });

  it("refuses without an API key", () => {
    expect(() => assertLiveModeAllowed(validOptions({ env: {} }))).toThrow(/OPENAI_API_KEY/);
  });

  it("refuses in CI by default", () => {
    expect(() =>
      assertLiveModeAllowed(validOptions({ env: { OPENAI_API_KEY: "k", CI: "true" } })),
    ).toThrow(/refuses to run in CI by default/);
  });

  it("permits CI only with the explicit escape hatch", () => {
    expect(() =>
      assertLiveModeAllowed(
        validOptions({ env: { OPENAI_API_KEY: "k", CI: "true" }, allowCi: true }),
      ),
    ).not.toThrow();
  });

  it("treats CI=false as a CI environment declaring itself", () => {
    expect(() =>
      assertLiveModeAllowed(validOptions({ env: { OPENAI_API_KEY: "k", CI: "false" } })),
    ).not.toThrow();
  });

  it("refuses without a budget limit", () => {
    expect(() => assertLiveModeAllowed(validOptions({ maxBudgetUsd: undefined }))).toThrow(
      /requires an explicit budget limit/,
    );
  });

  it("refuses a zero, negative, or non-numeric budget", () => {
    for (const value of ["0", "-1", "abc", "Infinity"]) {
      expect(() => assertLiveModeAllowed(validOptions({ maxBudgetUsd: value })), value).toThrow(
        /positive, finite number/,
      );
    }
  });

  it("accepts a budget from the environment when no flag is given", () => {
    const resolved = assertLiveModeAllowed(
      validOptions({
        maxBudgetUsd: undefined,
        env: { OPENAI_API_KEY: "k", EVAL_MAX_BUDGET_USD: "0.5" },
      }),
    );
    expect(resolved.budgetUsd).toBe(0.5);
  });

  it("prefers an explicit flag over the environment", () => {
    expect(resolveBudgetLimit({ maxBudgetUsd: "2", env: { EVAL_MAX_BUDGET_USD: "9" } })).toBe(2);
  });

  it("refuses when no case is selected", () => {
    expect(() => assertLiveModeAllowed(validOptions({ caseIds: [] }))).toThrow(
      /never defaults to the whole benchmark/,
    );
  });

  it("requires an explicit flag to run the whole benchmark", () => {
    const resolved = assertLiveModeAllowed(validOptions({ caseIds: [], allCases: true }));
    expect(resolved.selectedIds).toHaveLength(benchmarkCases.length);
  });

  it("refuses both --case and --all-cases together", () => {
    expect(() => assertLiveModeAllowed(validOptions({ allCases: true }))).toThrow(/not both/);
  });

  it("refuses an unknown case id", () => {
    expect(() => assertLiveModeAllowed(validOptions({ caseIds: ["case-999"] }))).toThrow(
      /Unknown case id/,
    );
  });

  it("refuses a non-integer or non-positive repetition count", () => {
    for (const value of [0, -1, 1.5]) {
      expect(() => assertLiveModeAllowed(validOptions({ repetitions: value })), value).toThrow(
        /--repetitions/,
      );
    }
  });

  it("defaults to a single repetition and a single selected case", () => {
    const resolved = assertLiveModeAllowed(validOptions());
    expect(resolved.repetitions).toBe(1);
    expect(resolved.selectedIds).toEqual(["case-001"]);
  });

  it("throws a typed error so callers can distinguish a refusal from a crash", () => {
    try {
      assertLiveModeAllowed(validOptions({ live: false }));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(LiveModeRefusedError);
    }
  });
});

describe("budget estimation", () => {
  it("estimates more for a pairing case than a non-pairing case", () => {
    const pairing = benchmarkCases.find((entry) => entry.deterministic_expectations.pairing_enabled);
    const plain = benchmarkCases.find(
      (entry) => !entry.deterministic_expectations.pairing_enabled && entry.input.candidates.length === 3,
    );
    expect(estimateExecutionCost(pairing, PRICED_MODEL).estimatedCostUsd).toBeGreaterThan(
      estimateExecutionCost(plain, PRICED_MODEL).estimatedCostUsd,
    );
  });

  it("includes adapter retries, batch-integrity retries, and truncation headroom", () => {
    const plain = benchmarkCases.find((entry) => !entry.deterministic_expectations.pairing_enabled);
    // Context and decision each permit two provider attempts; scoring can make
    // two integrity passes, each of which can make two provider attempts.
    expect(estimateExecutionCost(plain, PRICED_MODEL).maxAttempts).toBe(
      BUDGET_ASSUMPTIONS.providerAttemptsPerRequest *
        (1 + BUDGET_ASSUMPTIONS.batchIntegrityPasses + 1),
    );
  });

  it("includes a separately retryable pairing batch when pairing is enabled", () => {
    const pairing = benchmarkCases.find((entry) => entry.deterministic_expectations.pairing_enabled);
    expect(estimateExecutionCost(pairing, PRICED_MODEL).maxAttempts).toBe(
      BUDGET_ASSUMPTIONS.providerAttemptsPerRequest *
        (1 + BUDGET_ASSUMPTIONS.batchIntegrityPasses * 2 + 1),
    );
  });

  it("scales with repetitions and scenario count", () => {
    const multi = benchmarkCases.find((entry) => entry.input.scenarios.length === 2);
    const single = estimateRunBudget([multi], PRICED_MODEL, 1);
    const doubled = estimateRunBudget([multi], PRICED_MODEL, 2);
    expect(single.executionCount).toBe(2);
    expect(doubled.executionCount).toBe(4);
    expect(doubled.maxEstimatedCostUsd).toBeCloseTo(single.maxEstimatedCostUsd * 2, 6);
  });

  it("reports an unpriced model rather than guessing a price", () => {
    const estimate = estimateRunBudget([benchmarkCases[0]], "not-a-real-model", 1);
    expect(estimate.priced).toBe(false);
    expect(estimate.maxEstimatedCostUsd).toBeNull();
  });

  it("refuses to start when the worst case exceeds the budget", () => {
    const estimate = estimateRunBudget(benchmarkCases, PRICED_MODEL, 5);
    expect(() => assertBudgetCoversPlan(estimate, 0.0001)).toThrow(/above the .* budget limit/);
  });

  it("permits a plan that fits inside the budget", () => {
    const estimate = estimateRunBudget([benchmarkCases[0]], PRICED_MODEL, 1);
    expect(assertBudgetCoversPlan(estimate, 100)).toBe(true);
  });

  it("refuses an unpriced model outright, because a budget cannot be enforced", () => {
    const estimate = estimateRunBudget([benchmarkCases[0]], "not-a-real-model", 1);
    expect(() => assertBudgetCoversPlan(estimate, 100)).toThrow(/No recorded pricing/);
  });
});

describe("budget guard", () => {
  it("permits execution while the worst case fits", () => {
    const guard = createBudgetGuard({ budgetUsd: 100, model: PRICED_MODEL });
    expect(guard.canProceed(benchmarkCases[0])).toBe(true);
    expect(guard.stoppedReason).toBeNull();
  });

  it("stops before starting an execution that could exceed the limit", () => {
    const guard = createBudgetGuard({ budgetUsd: 0.02, model: PRICED_MODEL });
    guard.record(0.019);
    expect(guard.canProceed(benchmarkCases[0])).toBe(false);
    expect(guard.stoppedReason).toContain("would exceed the");
  });

  it("stays stopped once it has stopped", () => {
    const guard = createBudgetGuard({ budgetUsd: 0.000001, model: PRICED_MODEL });
    expect(guard.canProceed(benchmarkCases[0])).toBe(false);
    const reason = guard.stoppedReason;
    expect(guard.canProceed(benchmarkCases[0])).toBe(false);
    expect(guard.stoppedReason).toBe(reason);
  });

  it("stops when the model has no recorded pricing", () => {
    const guard = createBudgetGuard({ budgetUsd: 100, model: "not-a-real-model" });
    expect(guard.canProceed(benchmarkCases[0])).toBe(false);
    expect(guard.stoppedReason).toContain("no recorded pricing");
  });

  it("accumulates only real reported spend", () => {
    const guard = createBudgetGuard({ budgetUsd: 100, model: PRICED_MODEL });
    guard.record(0.01);
    guard.record(null);
    guard.record(Number.NaN);
    guard.record(0.02);
    expect(guard.spentUsd).toBeCloseTo(0.03, 10);
  });

  it("warns that reported spend can under-report true spend", () => {
    const guard = createBudgetGuard({ budgetUsd: 0.001, model: PRICED_MODEL });
    guard.record(0.001);
    guard.canProceed(benchmarkCases[0]);
    expect(guard.stoppedReason).toContain("true spend may be higher");
  });
});

describe("live plan disclosure", () => {
  it("shows the model, cases, repetitions, worst-case calls, cost, and budget", () => {
    const estimate = estimateRunBudget([benchmarkCases[0]], PRICED_MODEL, 1);
    const plan = renderLivePlan({
      model: PRICED_MODEL,
      selectedIds: ["case-001"],
      repetitions: 1,
      estimate,
      budgetUsd: 0.25,
    });
    expect(plan).toContain(PRICED_MODEL);
    expect(plan).toContain("case-001");
    expect(plan).toContain("repetitions:        1");
    expect(plan).toContain("max provider calls:");
    expect(plan).toContain("max estimated cost:");
    expect(plan).toContain("budget limit:       $0.250000");
    expect(plan).toContain("worst case, not a quote");
  });

  it("says so plainly when the model is unpriced", () => {
    const estimate = estimateRunBudget([benchmarkCases[0]], "not-a-real-model", 1);
    const plan = renderLivePlan({
      model: "not-a-real-model",
      selectedIds: ["case-001"],
      repetitions: 1,
      estimate,
      budgetUsd: 1,
    });
    expect(plan).toContain("not in the pricing table");
  });

  it("contains no ANSI escape codes", () => {
    const estimate = estimateRunBudget([benchmarkCases[0]], PRICED_MODEL, 1);
    const plan = renderLivePlan({ model: PRICED_MODEL, selectedIds: ["case-001"], repetitions: 1, estimate, budgetUsd: 1 });
    // eslint-disable-next-line no-control-regex
    expect(/\u001b\[/.test(plan)).toBe(false);
  });
});
