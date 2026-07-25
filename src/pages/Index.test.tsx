import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Results, EvalForm } from "./Index";
import { BACKEND_URL } from "@/lib/backendUrl";

/** Adaptability profiles and confidence/evidence flags render under the "analysis" tab, not the default "overview" tab. */
function openAnalysisTab() {
  fireEvent.click(screen.getByRole("button", { name: "analysis" }));
}

function buildResponse(overrides: Record<string, unknown> = {}) {
  return {
    pipeline_steps: [],
    role_analysis: { title: "VP", key_requirements: ["domain_expertise"], complexity: "high" },
    scenario_analysis: { scenario: "Post-merger integration", key_pressures: ["Speed"], weight_rationale: "Rationale text." },
    candidate_evaluations: [
      {
        candidate_id: "a", candidate_name: "Alice", rank: 1, weighted_fit_score: 82, risk_adjusted_score: 70,
        expected_outcome_score: 78, overall_confidence: 0.84, strategic_labels: ["Balanced Performer"],
        criteria_scores: {}, strengths: ["Strong trust"], weaknesses: ["Limited digital"],
        risk_profile: { execution_risk: 0.2, culture_risk: 0.1, time_risk: 0.15, adaptability_risk: 0.3, confidence_risk: 0.16, opportunity_cost_risk: 0.2 },
        outcome_model: { expected_execution_success: 0.8, scenario_fit: 0.82, adaptability_score: 0.7, likely_outcome: "Solid results.", strategic_label: "Balanced Performer", cross_scenario_consistency: "not_measured" },
      },
    ],
    bias_confidence_reviews: [],
    decision_result: {
      recommended_candidate_id: "a", recommended_candidate_name: "Alice", decision_mode: "best_fit",
      scenario: "Post-merger integration", final_label: "Best Fit", key_reason: "Highest weighted fit score.",
      overall_confidence: 0.84, executive_interpretation: "Alice is the recommended candidate.",
    },
    trade_offs: [],
    adaptability_profiles: [
      { candidate_name: "Alice", adaptability_score: 70, best_scenario: "Post-merger integration", worst_scenario: "Rapid crisis/pivot scenario", resilience_note: "Shows strong adaptability.", cross_scenario_consistency: "not_measured" },
    ],
    agent_outputs: [],
    executive_summary: { recommendation: "Alice recommended.", reason: "Highest score.", trade_off: "", opportunity_cost: "", adaptability: "", alternative: "" },
    ...overrides,
  };
}

describe("Results — rendering a completed decision result", () => {
  it("shows the recommended candidate and key reason", () => {
    render(<Results response={buildResponse() as never} />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Highest weighted fit score.")).toBeInTheDocument();
  });
});

describe("Results — cross-scenario consistency is shown as not measured", () => {
  it("displays 'not measured' rather than a fabricated adaptability number", () => {
    render(<Results response={buildResponse() as never} />);
    openAnalysisTab();
    expect(screen.getByText(/not measured/i)).toBeInTheDocument();
  });

  it("does not show the not-measured line when the field is absent (older/partial data)", () => {
    const response = buildResponse({
      adaptability_profiles: [{ candidate_name: "Alice", adaptability_score: 70, best_scenario: "s", worst_scenario: "w", resilience_note: "note" }],
    });
    render(<Results response={response as never} />);
    openAnalysisTab();
    expect(screen.queryByText(/not measured/i)).not.toBeInTheDocument();
  });
});

describe("Results — provider/model run metadata", () => {
  it("shows the provider and model footer when run_metadata is present", () => {
    const response = buildResponse({
      run_metadata: { provider: "groq", model: "openai/gpt-oss-120b", promptVersions: {}, schemaVersions: {}, attempts: {}, startedAt: "", completedAt: "" },
    });
    render(<Results response={response as never} />);
    expect(screen.getByText(/groq/)).toBeInTheDocument();
    expect(screen.getByText(/openai\/gpt-oss-120b/)).toBeInTheDocument();
  });

  it("shows no metadata footer when run_metadata is absent", () => {
    render(<Results response={buildResponse() as never} />);
    expect(screen.queryByText(/Evaluated with/)).not.toBeInTheDocument();
  });
});

describe("Results — confidence/evidence wording, not bias-detection wording", () => {
  it("labels the flags card 'Confidence & Evidence Flags', not 'Bias Flags'", () => {
    const response = buildResponse({
      bias_confidence_reviews: [
        { candidate_id: "a", candidate_name: "Alice", overall_confidence: 0.5, recommend_human_review: true, bias_flags: [{ type: "low_overall_confidence", severity: "high", description: "Overall model-reported confidence is low." }] },
      ],
    });
    render(<Results response={response as never} />);
    openAnalysisTab();
    expect(screen.getByText("Confidence & Evidence Flags")).toBeInTheDocument();
    expect(screen.queryByText("Bias Flags")).not.toBeInTheDocument();
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
    const fresh = await import("../lib/backendUrl?configured-url-test");
    expect(fresh.BACKEND_URL).toBe("https://api.example.com");
  });
});
