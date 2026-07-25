/**
 * A fake AIProvider implementing the real contract (server/ai/types.js)
 * directly, routed by promptId, for pipeline-level tests. This is above
 * the adapter layer — it does not exercise retry.js or a real SDK, so
 * "retry exhaustion" at this level means the fake rejects once and the
 * pipeline stage is expected to propagate that rejection (never retry a
 * second time itself — retries are owned exclusively by the adapter layer
 * a real provider would use in production).
 */
export function createFakePipelineProvider({ handlers, name = "fake", model = "fake-model" } = {}) {
  const calls = [];
  return {
    name,
    model,
    async generateStructured(request) {
      calls.push({ promptId: request.promptId, prompt: request.prompt, system: request.system });
      const handler = handlers[request.promptId];
      if (!handler) throw new Error(`No fake handler registered for promptId "${request.promptId}"`);
      const result = typeof handler === "function" ? await handler(request) : handler;
      const data = request.schema.parse(result);
      return { data, meta: { provider: name, model, latencyMs: 1, attempts: 1 } };
    },
    get calls() {
      return calls;
    },
  };
}

const CRITERIA_KEYS = [
  "domain_expertise", "transformation_leadership", "operational_execution",
  "stakeholder_management", "crisis_management", "innovation_digital", "strategic_scalability",
];

export function criteriaScoresFixture(score = 6) {
  return Object.fromEntries(CRITERIA_KEYS.map((k) => [k, { score, confidence: 0.8, evidence: "Evidence long enough to pass validation.", reasoning: "Reasoning text." }]));
}

/**
 * Builds a full set of default handlers sufficient to run the whole
 * pipeline end-to-end. `scoreByCandidateId` lets a test control each
 * candidate's criterion scores (and therefore the deterministic ranking)
 * without touching prompt text.
 */
export function defaultHandlers({ scoreByCandidateId = {} } = {}) {
  return {
    "role-analysis": {
      criteria: CRITERIA_KEYS,
      baseline_weights: Object.fromEntries(CRITERIA_KEYS.map((k) => [k, Math.round(100 / CRITERIA_KEYS.length)])),
      must_have_criteria: ["domain_expertise"],
      role_success_definition: "Leads the org through the scenario.",
      complexity_rating: "high",
    },
    "scenario-analysis": {
      priority_shifts: ["Stakeholder management weighted higher."],
      weight_deltas: Object.fromEntries(CRITERIA_KEYS.map((k) => [k, 0])),
      scenario_success_definition: "Integration completes smoothly.",
      scenario_failure_definition: "Key talent departs.",
      scenario_risks: ["Culture clash"],
      key_pressures: ["Speed", "Sensitivity"],
      weight_rationale: "Stakeholder management matters most here.",
    },
    "candidate-scoring": (request) => {
      const idMatch = request.prompt.match(/Candidate ID: (\S+)/);
      const id = idMatch?.[1] ?? "unknown";
      const score = scoreByCandidateId[id] ?? 6;
      return {
        candidate_id: id,
        candidate_name: id,
        criteria_scores: criteriaScoresFixture(score),
        strengths: ["Strong stakeholder trust"],
        weaknesses: ["Limited digital experience"],
        best_fit_contexts: ["Post-merger integration"],
      };
    },
    "decision-explanation": {
      final_label: "Best Fit",
      key_reason: "Highest weighted fit score.",
      executive_interpretation: "Recommended for strongest alignment.",
      winner_reason: "Top-ranked under Best Fit.",
      runner_up_trade_off: "Slightly lower cultural fit.",
      trade_offs: [{ title: "Top Choice", description: "Strongest alignment.", type: "gain", severity: "low" }],
      executive_summary: {
        recommendation: "Recommended.", reason: "Highest computed score.", trade_off: "None significant.",
        opportunity_cost: "Minimal.", adaptability: "Strong.", alternative: "Runner-up",
      },
    },
    "pairing-analysis": {
      scenario_coverage: 0.8, complementarity: 0.7, overlap_risk: 0.2,
      conflict_risk: 0.1, execution_cohesion: 0.75, pair_adaptability: 0.65,
      explanation: "Complementary strengths with low overlap.",
    },
  };
}

export function defaultInput({ candidateIds = ["a", "b"], decisionMode = "best_fit", enablePairing = false } = {}) {
  return {
    role: { title: "VP of People", description: "Leads through the scenario." },
    scenario: "Post-merger integration",
    decision_mode: decisionMode,
    candidates: candidateIds.map((id) => ({ id, name: id, description: `Candidate ID: ${id}` })),
    options: { enable_pair_simulation: enablePairing },
  };
}
