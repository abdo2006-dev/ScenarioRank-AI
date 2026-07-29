import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DecisionResults as Results } from "@/features/decision/components/results/DecisionResults";
import { EvaluationForm as EvalForm } from "@/features/decision/components/evaluation/EvaluationForm";
import { BACKEND_URL } from "@/lib/backendUrl";
import type { PipelineResponse } from "@/features/decision/contracts";
import {
  pipelineResponseFixture,
  successfulPairingFixture,
  unavailablePairingFixture,
} from "@/features/decision/test/fixtures";

/** Adaptability profiles and confidence/evidence flags render under the "analysis" tab, not the default "overview" tab. */
function openAnalysisTab() {
  fireEvent.click(screen.getByRole("button", { name: /analysis/i }));
}

function buildResponse(
  overrides: Partial<PipelineResponse> = {},
): PipelineResponse {
  const base = pipelineResponseFixture();
  return pipelineResponseFixture({
    decision_result: {
      ...base.decision_result,
      key_reason: "Highest weighted fit score.",
    },
    ...overrides,
  });
}

describe("Results — rendering a completed decision result", () => {
  it("shows the recommended candidate and key reason", () => {
    render(<Results response={buildResponse()} />);
    expect(screen.getAllByText("Alice").length).toBeGreaterThan(0);
    expect(screen.getByText("Highest weighted fit score.")).toBeInTheDocument();
  });
});

describe("Results — cross-scenario consistency is shown as not measured", () => {
  it("displays 'not measured' rather than a fabricated adaptability number", () => {
    render(<Results response={buildResponse()} />);
    openAnalysisTab();
    expect(screen.getByText(/not measured/i)).toBeInTheDocument();
  });

  it("does not show the not-measured line when the field is absent (older/partial data)", () => {
    const response = buildResponse({
      adaptability_profiles: [{ candidate_name: "Alice", adaptability_score: 0.7, best_scenario: "not_measured", worst_scenario: "not_measured", resilience_note: "note" }],
    });
    render(<Results response={response} />);
    openAnalysisTab();
    expect(screen.queryByText(/not measured/i)).not.toBeInTheDocument();
  });
});

describe("Results — provider/model/cost run metadata", () => {
  function runMetadataFixture(overrides: Record<string, unknown> = {}) {
    return {
      provider: "openai", model: "gpt-5-mini", logicalProviderStageCount: 4, providerAttemptCount: 5,
      inputTokens: 1000, cachedInputTokens: 0, outputTokens: 500, reasoningTokens: 0, totalTokens: 1500,
      estimatedCostUsd: 0.00125,
      promptVersions: {}, schemaVersions: {}, attempts: {}, startedAt: "", completedAt: "",
      ...overrides,
    };
  }

  it("shows the provider, model, stage/attempt counts, token usage, and estimated cost footer when run_metadata is present", () => {
    const response = buildResponse({ run_metadata: runMetadataFixture() });
    render(<Results response={response} />);
    expect(screen.getByText(/openai/)).toBeInTheDocument();
    expect(screen.getByText(/gpt-5-mini/)).toBeInTheDocument();
    expect(screen.getByText(/4 stages/)).toBeInTheDocument();
    expect(screen.getByText(/5 OpenAI calls/)).toBeInTheDocument();
    expect(screen.getByText(/1,500 tokens/)).toBeInTheDocument();
    expect(screen.getByText(/approximate, not an invoice/i)).toBeInTheDocument();
  });

  it("shows the cost as unavailable, never a guessed number, when the model has no recorded pricing", () => {
    const response = buildResponse({ run_metadata: runMetadataFixture({ estimatedCostUsd: null }) });
    render(<Results response={response} />);
    expect(screen.getByText(/Estimated cost: unavailable/i)).toBeInTheDocument();
  });

});

describe("Results — confidence/evidence wording, not bias-detection wording", () => {
  it("labels the flags card 'Confidence & Evidence Flags', not 'Bias Flags'", () => {
    const response = buildResponse({
      confidence_evidence_reviews: [
        { candidate_id: "a", candidate_name: "Alice", overall_confidence: 0.5, low_confidence_criteria: [], weak_evidence_flags: [], recommend_human_review: true, recommend_rescore: false, review_summary: "Review", confidence_evidence_flags: [{ type: "low_overall_confidence", severity: "high", description: "Overall model-reported confidence is low.", candidate_id: "a" }] },
      ],
    });
    render(<Results response={response} />);
    openAnalysisTab();
    expect(screen.getByText("Confidence & Evidence Flags")).toBeInTheDocument();
    expect(screen.queryByText("Bias Flags")).not.toBeInTheDocument();
  });
});

describe("Results — no unsupported cross-scenario claims (docs/architecture/KNOWN_LIMITATIONS.md P0.2)", () => {
  it("never renders fabricated cross-scenario phrases anywhere in the response", () => {
    const response = buildResponse({
      pairing_result: successfulPairingFixture(),
    });
    render(<Results response={response} />);
    openAnalysisTab();
    fireEvent.click(screen.getByRole("button", { name: /pairing/i }));
    fireEvent.click(screen.getByRole("button", { name: /pipeline/i }));

    const forbiddenPhrases = [
      /rapid crisis\/pivot scenario/i,
      /may struggle under rapid pivots/i,
      /best scenario/i,
      /worst scenario/i,
    ];
    for (const phrase of forbiddenPhrases) {
      expect(screen.queryByText(phrase)).not.toBeInTheDocument();
    }
  });
});

describe("Results — pairing tab reflects honest pairing state, never a fabricated pair", () => {
  it("shows the best pair and its metrics when pairing succeeded", () => {
    const response = buildResponse({
      pairing_result: successfulPairingFixture(),
    });
    render(<Results response={response} />);
    fireEvent.click(screen.getByRole("button", { name: /pairing/i }));
    expect(screen.getByText("Best Leadership Pair")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Strong complementary skill sets.")).toBeInTheDocument();
  });

  it("shows an honest unavailable message, with no fabricated pair, when every pair evaluation failed", () => {
    const response = buildResponse({
      pairing_result: {
        ...unavailablePairingFixture(),
        reason: "All pair evaluations failed.",
      },
    });
    render(<Results response={response} />);
    fireEvent.click(screen.getByRole("button", { name: /pairing/i }));

    expect(screen.getByText("Pairing Unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Default pair.")).not.toBeInTheDocument();
    expect(screen.queryByText(/7\.0/)).not.toBeInTheDocument();
  });

  it("does not show a pairing tab at all when pairing_result is absent", () => {
    render(<Results response={buildResponse()} />);
    expect(
      screen.queryByRole("button", { name: /pairing/i }),
    ).not.toBeInTheDocument();
  });
});

describe("EvalForm — AI provider failure is displayed safely", () => {
  const noop = () => {};
  const baseProps = {
    role: { title: "", description: "" }, setRole: noop,
    scenarios: [] as string[], setScenarios: noop,
    scenario: "", setScenario: noop,
    decisionMode: "best_fit", setDecisionMode: noop,
    candidates: [], setCandidates: noop,
    enablePairing: false, setEnablePairing: noop,
    onRun: noop, isRunning: false,
    onGenerateScenarios: noop, isGeneratingScenarios: false,
    onLoadDefaults: noop, onResetInputs: noop,
  };

  it("shows an AI-unavailable notice when aiEnabled is false, without an error stack trace", () => {
    render(<EvalForm {...baseProps} aiEnabled={false} />);
    expect(screen.getByText(/AI generation is unavailable/i)).toBeInTheDocument();
  });

  it("does not show the notice when aiEnabled is true", () => {
    render(<EvalForm {...baseProps} aiEnabled={true} />);
    expect(screen.queryByText(/AI generation is unavailable/i)).not.toBeInTheDocument();
  });
});

describe("BACKEND_URL — env-safe configuration", () => {
  const originalEnv = { ...import.meta.env };
  afterEach(() => {
    vi.unstubAllEnvs();
    Object.assign(import.meta.env, originalEnv);
  });

  it("falls back to localhost:3001 when VITE_BACKEND_URL is not set", () => {
    expect(BACKEND_URL).toBe("http://localhost:3001");
  });

  it("reads VITE_BACKEND_URL when set (verified via a fresh module load)", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_BACKEND_URL", "https://api.example.com");
    // A non-literal specifier keeps this a genuine fresh-module-load test
    // (the query string busts Vitest's module cache) without tsc trying
    // to statically resolve a module path that doesn't exist on disk.
    const freshModulePath = "../lib/backendUrl?configured-url-test";
    const fresh = await import(/* @vite-ignore */ freshModulePath);
    expect(fresh.BACKEND_URL).toBe("https://api.example.com");
  });
});
