/**
 * @file Offline fake-provider profiles (Phase 3A evaluation harness).
 *
 * These build a provider that satisfies the real provider-neutral contract
 * (server/ai/types.js) and is driven entirely by a benchmark case's
 * `fake_provider_plan`. The point is to exercise the *real* pipeline —
 * real prompts, real schemas, real deterministic scoring, real batch-identity
 * validation, real metadata accounting — with zero network access and zero
 * API cost.
 *
 * Two properties matter more than realism here:
 *
 *  1. **Order independence.** Every score is looked up by candidate ID, never
 *     by array position. A candidate-order permutation of a case therefore
 *     receives byte-identical scoring input, which is what makes case-011 a
 *     genuine test of the pipeline rather than a test of the fixture.
 *
 *  2. **Determinism.** No randomness, no clock reads, no environment reads.
 *     The same case executed twice produces the same decision content.
 *     Timestamps, durations, and `request_id` are produced by the pipeline
 *     itself and are excluded from every comparison.
 *
 * What this is NOT: evidence about how a real model behaves. A fixture run
 * proves the orchestration, the deterministic scoring, and the graders work.
 * It proves nothing about prompt quality. See docs/evaluation/EVALUATION_ARCHITECTURE.md.
 */
import { CRITERIA_KEYS } from "../../server/ai/schemas/criteriaKeys.js";
import { canonicalPairKey } from "../schemas/benchmarkCase.js";

/**
 * The fake role analysis always returns these baseline criterion weights.
 * They sum to exactly 100, so the pipeline's renormalisation guard is a no-op
 * and a case's declared weight deltas are the only thing shifting emphasis.
 */
export const BASELINE_WEIGHTS = Object.freeze({
  domain_expertise: 18,
  transformation_leadership: 16,
  operational_execution: 15,
  stakeholder_management: 14,
  crisis_management: 13,
  innovation_digital: 12,
  strategic_scalability: 12,
});

/**
 * Every profile this harness can run. Invalid profiles exist so the graders
 * can be proven to catch real defects; they are used in targeted tests, never
 * in the committed fixture baseline (docs/evaluation/RUNBOOK.md).
 */
export const FAKE_PROVIDER_PROFILES = Object.freeze({
  "valid-standard": { valid: true, description: "Complete, well-formed responses at every stage." },
  "valid-close-call": {
    valid: true,
    description: "Complete responses that compress candidate scores toward each other, so ranking margins are small.",
  },
  "valid-pairing": {
    valid: true,
    description: "Complete responses including full, valid coverage of every expected pair.",
  },
  "malformed-once-then-success": {
    valid: false,
    description: "Batch candidate scoring omits one candidate on the first attempt, then returns a complete set on the corrective retry. Exercises attempt accounting without changing the logical stage count.",
  },
  "missing-pair": {
    valid: false,
    description: "Batch pairing analysis always omits one expected pair, so pairing must honestly report itself unavailable rather than presenting a partial best pair.",
  },
  "unknown-candidate": {
    valid: false,
    description: "Batch candidate scoring returns a candidate ID that was never submitted, on every attempt. The scoring stage must fail rather than accept it.",
  },
  "contradictory-explanation": {
    valid: false,
    description: "Structurally valid responses whose narrative recommends the runner-up instead of the deterministically ranked winner.",
  },
});

/** Profiles that a committed benchmark case is allowed to declare. */
export const VALID_BASELINE_PROFILES = Object.freeze(
  Object.entries(FAKE_PROVIDER_PROFILES)
    .filter(([, meta]) => meta.valid)
    .map(([id]) => id),
);

const EVIDENCE_TEXT = Object.freeze({
  specific:
    "The supplied description names a dated, measurable outcome for this criterion.",
  vague: "Unclear.",
  conflicting:
    "The supplied description makes two claims about this criterion that cannot both be true, and gives no dates or figures to resolve them.",
  missing: "",
});

/**
 * Resolves one candidate's effective score plan for a given scenario index.
 * A scenario override is a shallow merge over the base plan — the base plan
 * stays the single place a candidate's default profile is stated.
 */
function resolveScorePlan(plan, candidateId, scenarioIndex) {
  const base = plan.candidate_scores[candidateId];
  const override = plan.scenario_overrides?.[String(scenarioIndex)]?.[candidateId];
  if (!override) return base;
  return {
    ...base,
    ...override,
    criteria: { ...(base.criteria ?? {}), ...(override.criteria ?? {}) },
  };
}

/**
 * Compresses a score toward the midpoint so ranking margins shrink without
 * ever producing an exact tie. Exact ties are avoided deliberately: the
 * production ranking resolves them by submission order (a stable sort over
 * the submitted candidate array), which would make a candidate-order
 * permutation legitimately change the winner. That behaviour is documented as
 * a limitation rather than exercised as a baseline expectation.
 */
function compressTowardMidpoint(score, index) {
  const compressed = 6.5 + (score - 6.5) * 0.15;
  const separation = index * 0.01;
  return Math.min(10, Math.max(1, Math.round((compressed + separation) * 100) / 100));
}

function buildCriteriaScores(scorePlan, { closeCall, candidateIndex }) {
  const confidence = scorePlan.confidence ?? 0.8;
  const evidence = EVIDENCE_TEXT[scorePlan.evidence_quality ?? "specific"];
  return Object.fromEntries(
    CRITERIA_KEYS.map((key) => {
      const raw = scorePlan.criteria?.[key] ?? scorePlan.default;
      const score = closeCall ? compressTowardMidpoint(raw, candidateIndex) : raw;
      return [
        key,
        {
          score,
          confidence,
          evidence,
          reasoning: `Derived from the ${scorePlan.evidence_quality ?? "specific"} evidence supplied for ${key.replace(/_/g, " ")}.`,
        },
      ];
    }),
  );
}

const DEFAULT_PAIR_METRICS = Object.freeze({
  scenario_coverage: 0.72,
  complementarity: 0.6,
  overlap_risk: 0.35,
  conflict_risk: 0.25,
  execution_cohesion: 0.68,
  pair_adaptability: 0.6,
});

/**
 * Candidate IDs appear in the scoring prompt as `candidate_id: X\nName:`.
 * Parsing them back out (rather than closing over the case's candidate list)
 * means the fixture responds to what the pipeline actually asked for, so a
 * pipeline bug that sends the wrong candidate set is visible instead of
 * masked.
 */
function candidateIdsFromPrompt(prompt) {
  return [...prompt.matchAll(/candidate_id: (\S+)\nName:/g)].map((match) => match[1]);
}

function pairsFromPrompt(prompt) {
  return [...prompt.matchAll(/candidate_id_a: ([^,\s]+), candidate_id_b: ([^,)\s]+)/g)].map(
    (match) => [match[1], match[2]],
  );
}

/** The decision prompt lists `Rank N: <name> | ...`; used only by the contradictory profile. */
function rankedNamesFromPrompt(prompt) {
  return [...prompt.matchAll(/Rank \d+: ([^|\n]+?) \|/g)].map((match) => match[1].trim());
}

/**
 * Builds a deterministic, offline provider for one execution of one case.
 *
 * @param {object} options
 * @param {object} options.benchmarkCase validated benchmark case
 * @param {number} options.scenarioIndex zero-based scenario index
 * @param {string} [options.profile] overrides the case's declared profile
 * @returns {{ name: string, model: string, generateStructured: Function, calls: object[] }}
 */
export function createEvalFakeProvider({ benchmarkCase, scenarioIndex, profile }) {
  const activeProfile = profile ?? benchmarkCase.fake_provider_plan.profile;
  if (!(activeProfile in FAKE_PROVIDER_PROFILES)) {
    throw new Error(
      `Unknown fake provider profile "${activeProfile}". Known profiles: ${Object.keys(FAKE_PROVIDER_PROFILES).join(", ")}.`,
    );
  }

  const plan = benchmarkCase.fake_provider_plan;
  const closeCall = activeProfile === "valid-close-call";
  const candidateOrder = benchmarkCase.input.candidates.map((candidate) => candidate.id);
  const calls = [];
  const attemptsByPrompt = new Map();

  function nextAttempt(promptId) {
    const attempt = (attemptsByPrompt.get(promptId) ?? 0) + 1;
    attemptsByPrompt.set(promptId, attempt);
    return attempt;
  }

  function contextAnalysis() {
    const deltas = plan.scenario_weight_deltas?.[String(scenarioIndex)] ?? {};
    return {
      role_analysis: {
        criteria: [...CRITERIA_KEYS],
        baseline_weights: { ...BASELINE_WEIGHTS },
        must_have_criteria: ["domain_expertise"],
        role_success_definition: "The role succeeds when the stated scenario outcome is achieved without a service or safety breach.",
        complexity_rating: "high",
      },
      scenario_analysis: {
        priority_shifts: Object.entries(deltas).map(
          ([key, value]) => `${key.replace(/_/g, " ")} weighted ${value >= 0 ? "up" : "down"} by ${Math.abs(value)}.`,
        ),
        weight_deltas: Object.fromEntries(
          CRITERIA_KEYS.map((key) => [key, deltas[key] ?? 0]),
        ),
        scenario_success_definition: "The scenario succeeds when its stated objective is met within the stated constraint.",
        scenario_failure_definition: "The scenario fails when the stated constraint is breached.",
        scenario_risks: ["Constraint breach", "Loss of key capability"],
        key_pressures: ["Time", "Capability fit"],
        weight_rationale: Object.keys(deltas).length > 0
          ? "Criterion weights were adjusted to reflect what this specific scenario actually demands."
          : "This scenario does not shift criterion emphasis away from the role baseline.",
      },
    };
  }

  function batchCandidateScoring(request) {
    const attempt = nextAttempt("batch-candidate-scoring");
    const requestedIds = candidateIdsFromPrompt(request.prompt);
    const results = requestedIds.map((id) => {
      const scorePlan = resolveScorePlan(plan, id, scenarioIndex);
      if (!scorePlan) {
        throw new Error(`Benchmark case ${benchmarkCase.case_id} has no score plan for "${id}".`);
      }
      return {
        candidate_id: id,
        criteria_scores: buildCriteriaScores(scorePlan, {
          closeCall,
          candidateIndex: candidateOrder.indexOf(id),
        }),
        strengths: ["Strength stated in the supplied description."],
        weaknesses: ["Gap stated in, or absent from, the supplied description."],
        best_fit_contexts: ["The context described in this scenario."],
      };
    });

    if (activeProfile === "unknown-candidate") {
      // Always invalid: the scoring stage must reject a candidate that was
      // never submitted, on the corrective retry as well as the first call.
      return { results: [...results.slice(1), { ...results[0], candidate_id: "ghost-candidate" }] };
    }
    if (activeProfile === "malformed-once-then-success" && attempt === 1) {
      // Incomplete on the first attempt only. The pipeline's batch-integrity
      // corrective retry should recover, spending a second real attempt
      // without entering a second logical stage.
      return { results: results.slice(1) };
    }
    return { results };
  }

  function batchPairingAnalysis(request) {
    nextAttempt("batch-pairing-analysis");
    const requestedPairs = pairsFromPrompt(request.prompt);
    const results = requestedPairs.map(([a, b]) => {
      const metrics = plan.pair_overrides?.[canonicalPairKey(a, b)] ?? DEFAULT_PAIR_METRICS;
      return {
        candidate_id_a: a,
        candidate_id_b: b,
        ...metrics,
        explanation: "Combination assessed on coverage, complementarity, overlap, and cohesion.",
      };
    });
    if (activeProfile === "missing-pair") {
      return { results: results.slice(1) };
    }
    return { results };
  }

  function decisionExplanation(request) {
    nextAttempt("decision-explanation");
    const rankedNames = rankedNamesFromPrompt(request.prompt);
    const winnerName = rankedNames[0] ?? "the top-ranked candidate";
    const runnerUpName = rankedNames[1] ?? winnerName;
    // The contradictory profile deliberately names the runner-up as the
    // recommendation while the structured result still names the winner. It
    // exists so the unsupported-claims grader can be proven to catch a real
    // narrative/structure disagreement.
    const namedChoice = activeProfile === "contradictory-explanation" ? runnerUpName : winnerName;

    return {
      final_label: "Best Fit",
      key_reason: `${namedChoice} scored highest on the criteria this scenario weights most heavily.`,
      executive_interpretation: `${namedChoice} is the recommended candidate for this scenario, based on the evidence supplied.`,
      winner_reason: `${namedChoice} leads on the criteria this scenario prioritises.`,
      runner_up_trade_off: `${runnerUpName} brings comparable strengths in adjacent areas but is weaker on the scenario's primary criterion.`,
      trade_offs: [
        {
          title: "Depth over breadth",
          description: "The recommendation favours depth in the scenario's primary criterion over broader coverage.",
          type: "sacrifice",
          severity: "medium",
        },
      ],
      executive_summary: {
        recommendation: `${namedChoice} is recommended.`,
        reason: "Highest deterministically computed score under the selected decision mode.",
        trade_off: "Breadth across secondary criteria is lower than for the runner-up.",
        opportunity_cost: "The runner-up's adjacent strengths are not obtained.",
        adaptability: "Adaptability is a heuristic from this run's criteria only; cross-scenario resilience was not measured.",
        alternative: runnerUpName,
      },
    };
  }

  const handlers = {
    "context-analysis": contextAnalysis,
    "batch-candidate-scoring": batchCandidateScoring,
    "batch-pairing-analysis": batchPairingAnalysis,
    "decision-explanation": decisionExplanation,
  };

  return {
    name: "fake-eval",
    model: `fixture:${activeProfile}`,
    profile: activeProfile,
    async generateStructured(request) {
      calls.push({ promptId: request.promptId });
      const handler = handlers[request.promptId];
      if (!handler) {
        throw new Error(`No fixture handler registered for promptId "${request.promptId}".`);
      }
      // Validating through the production schema here — exactly as the real
      // adapter does — means a fixture that drifts out of contract fails
      // loudly rather than quietly feeding invalid data into the pipeline.
      const data = request.schema.parse(handler(request));
      return { data, meta: { provider: "fake-eval", model: `fixture:${activeProfile}`, latencyMs: 0, attempts: 1 } };
    },
    get calls() {
      return calls;
    },
  };
}
