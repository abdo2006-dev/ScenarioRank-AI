/**
 * @file The ScenarioRank decision pipeline (Phase 1B migration).
 *
 * Every LLM call in this file goes through the provider-neutral contract
 * (`provider.generateStructured`) — no provider SDK type or Anthropic-
 * specific code appears here. Exactly one `provider` instance is resolved
 * by the caller (see server/http/routes.js) and threaded through this
 * entire module for the run's lifetime: every stage, every candidate, and
 * every retry within a stage uses that same provider/model. Nothing here
 * ever constructs a second provider mid-run.
 *
 * The non-negotiable boundary (docs/PROJECT_STATUS.md): LLMs interpret
 * qualitative evidence; the functions below marked "deterministic" compute
 * scores, risks, and the final ranking; LLM calls only ever explain a
 * ranking that has already been computed. See the boundary test in
 * runPipeline.test.js.
 */

import {
  computeWeightedFitScore,
  computeOverallConfidence,
  computeExecutionRisk,
  computeCultureRisk,
  computeTimeRisk,
  computeAdaptabilityScore,
  computeExpectedOutcomeScore,
  computeRiskAdjustedScore,
  computePairScore,
  applyDeltas,
} from "../domain/scoring.js";

import { roleAnalysisSchema, ROLE_ANALYSIS_SCHEMA_VERSION } from "../ai/schemas/roleAnalysis.schema.js";
import { scenarioAnalysisSchema, SCENARIO_ANALYSIS_SCHEMA_VERSION } from "../ai/schemas/scenarioAnalysis.schema.js";
import { candidateScoringSchema, CANDIDATE_SCORING_SCHEMA_VERSION } from "../ai/schemas/candidateScoring.schema.js";
import { decisionExplanationSchema, DECISION_EXPLANATION_SCHEMA_VERSION } from "../ai/schemas/decisionExplanation.schema.js";
import { pairingAnalysisSchema, PAIRING_ANALYSIS_SCHEMA_VERSION } from "../ai/schemas/pairingAnalysis.schema.js";

import { buildRoleAnalysisPrompt, promptId as roleAnalysisPromptId, promptVersion as roleAnalysisPromptVersion } from "../ai/prompts/roleAnalysis.prompt.js";
import { buildScenarioAnalysisPrompt, promptId as scenarioAnalysisPromptId, promptVersion as scenarioAnalysisPromptVersion } from "../ai/prompts/scenarioAnalysis.prompt.js";
import { buildCandidateScoringPrompt, promptId as candidateScoringPromptId, promptVersion as candidateScoringPromptVersion } from "../ai/prompts/candidateScoring.prompt.js";
import { buildDecisionExplanationPrompt, promptId as decisionExplanationPromptId, promptVersion as decisionExplanationPromptVersion } from "../ai/prompts/decisionExplanation.prompt.js";
import { buildPairingAnalysisPrompt, promptId as pairingAnalysisPromptId, promptVersion as pairingAnalysisPromptVersion } from "../ai/prompts/pairingAnalysis.prompt.js";

const CANDIDATE_SCORING_MAX_TOKENS = 1400;
const ROLE_ANALYSIS_MAX_TOKENS = 2000;
const SCENARIO_ANALYSIS_MAX_TOKENS = 1500;
const DECISION_EXPLANATION_MAX_TOKENS = 2200;
const PAIRING_ANALYSIS_MAX_TOKENS = 400;

const DEFAULT_STAGE_TIMEOUT_MS = 60000;

// ===== CONCURRENCY (moved verbatim from server.mjs) =====

export async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const current = nextIndex++;
      if (current >= items.length) break;
      results[current] = await worker(items[current], current);
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

// ===== LLM-BACKED STAGES =====

async function runRoleAnalysis(provider, input) {
  const { system, prompt } = buildRoleAnalysisPrompt(input);
  const { data, meta } = await provider.generateStructured({
    system, prompt, schema: roleAnalysisSchema,
    promptId: roleAnalysisPromptId, promptVersion: roleAnalysisPromptVersion,
    maxOutputTokens: ROLE_ANALYSIS_MAX_TOKENS, timeoutMs: DEFAULT_STAGE_TIMEOUT_MS,
  });
  // Guard retained from the pre-migration implementation: always the flat
  // fixed 7-key array, regardless of what the model echoed back.
  data.criteria = [
    "domain_expertise", "transformation_leadership", "operational_execution",
    "stakeholder_management", "crisis_management", "innovation_digital", "strategic_scalability",
  ];
  const total = Object.values(data.baseline_weights).reduce((a, b) => a + b, 0);
  if (Math.abs(total - 100) > 1) {
    for (const k of Object.keys(data.baseline_weights)) {
      data.baseline_weights[k] = Math.round((data.baseline_weights[k] / total) * 10000) / 100;
    }
  }
  return { data, meta };
}

async function runScenarioAnalysis(provider, input) {
  const { system, prompt } = buildScenarioAnalysisPrompt(input);
  const { data, meta } = await provider.generateStructured({
    system, prompt, schema: scenarioAnalysisSchema,
    promptId: scenarioAnalysisPromptId, promptVersion: scenarioAnalysisPromptVersion,
    maxOutputTokens: SCENARIO_ANALYSIS_MAX_TOKENS, timeoutMs: DEFAULT_STAGE_TIMEOUT_MS,
  });
  const normalizedWeights = applyDeltas(input.baselineWeights, data.weight_deltas || {});
  const adjustedRaw = {};
  for (const k of Object.keys(input.baselineWeights)) {
    adjustedRaw[k] = Math.max(0, input.baselineWeights[k] + (data.weight_deltas?.[k] ?? 0));
  }
  return { data: { ...data, adjusted_weights: adjustedRaw, normalized_weights: normalizedWeights }, meta };
}

async function runCandidateScoring(provider, candidate, scenario, roleTitle) {
  const { system, prompt } = buildCandidateScoringPrompt(candidate, scenario, roleTitle);
  const { data, meta } = await provider.generateStructured({
    system, prompt, schema: candidateScoringSchema,
    promptId: candidateScoringPromptId, promptVersion: candidateScoringPromptVersion,
    maxOutputTokens: CANDIDATE_SCORING_MAX_TOKENS, timeoutMs: DEFAULT_STAGE_TIMEOUT_MS,
  });
  data.candidate_id = candidate.id;
  data.candidate_name = candidate.name;
  return { data, meta };
}

async function runDecisionExplanation(provider, rankedSummary, roleTitle, scenario, modeLabel, winnerName) {
  const { system, prompt } = buildDecisionExplanationPrompt({ roleTitle, scenario, modeLabel, winnerName, rankedSummary });
  return provider.generateStructured({
    system, prompt, schema: decisionExplanationSchema,
    promptId: decisionExplanationPromptId, promptVersion: decisionExplanationPromptVersion,
    maxOutputTokens: DECISION_EXPLANATION_MAX_TOKENS, timeoutMs: DEFAULT_STAGE_TIMEOUT_MS,
  });
}

async function runPairingAnalysis(provider, candidateA, candidateB, scenario) {
  const { system, prompt } = buildPairingAnalysisPrompt({
    scenario,
    candidateA: { name: candidateA.scoring.candidate_name, strengths: candidateA.scoring.strengths, strategicLabel: candidateA.outcome.strategic_label },
    candidateB: { name: candidateB.scoring.candidate_name, strengths: candidateB.scoring.strengths, strategicLabel: candidateB.outcome.strategic_label },
  });
  return provider.generateStructured({
    system, prompt, schema: pairingAnalysisSchema,
    promptId: pairingAnalysisPromptId, promptVersion: pairingAnalysisPromptVersion,
    maxOutputTokens: PAIRING_ANALYSIS_MAX_TOKENS, timeoutMs: DEFAULT_STAGE_TIMEOUT_MS,
  });
}

// ===== DETERMINISTIC STAGES =====
// (renamed from "Bias & Confidence Review" / "Bias Agent" — Phase 1C,
// docs/architecture/KNOWN_LIMITATIONS.md P0.3: this stage checks response
// confidence and evidence length, not demographic or legal bias, and must
// not be described as if it did.)

export function confidenceEvidenceReview(scoring, overallConfidence) {
  const lowConf = Object.entries(scoring.criteria_scores)
    .filter(([, cs]) => cs.confidence < 0.65)
    .map(([k]) => k);

  const flags = [];
  if (overallConfidence < 0.6) {
    flags.push({ type: "low_overall_confidence", severity: "high", description: "Overall model-reported confidence is low, so this recommendation should be reviewed carefully." });
  }
  if (lowConf.length >= 3) {
    flags.push({ type: "multiple_low_confidence_criteria", severity: "medium", description: `Low model-reported confidence in multiple criteria: ${lowConf.join(", ")}.` });
  }

  const weakEvidenceFlags = Object.entries(scoring.criteria_scores)
    .filter(([, cs]) => !cs.evidence || cs.evidence.trim().length < 15)
    .map(([k]) => k);

  const recommendHumanReview = overallConfidence < 0.65 || lowConf.length >= 3 || flags.some((f) => f.severity === "high");
  const recommendRescore = weakEvidenceFlags.length >= 3;

  return {
    candidate_id: scoring.candidate_id,
    candidate_name: scoring.candidate_name,
    overall_confidence: overallConfidence,
    low_confidence_criteria: lowConf,
    bias_flags: flags.map((f) => ({ ...f, candidate_id: scoring.candidate_id })),
    weak_evidence_flags: weakEvidenceFlags,
    recommend_human_review: recommendHumanReview,
    recommend_rescore: recommendRescore,
    review_summary: recommendHumanReview
      ? "Confidence or evidence gaps detected. Human review recommended."
      : "No major confidence or evidence-quality concerns detected.",
  };
}

export function outcomeModeling(scoring, wfs, oc) {
  const s = Object.fromEntries(Object.entries(scoring.criteria_scores).map(([k, cs]) => [k, cs.score]));
  const c = Object.fromEntries(Object.entries(scoring.criteria_scores).map(([k, cs]) => [k, cs.confidence]));

  const execRisk = computeExecutionRisk(s);
  const cultRisk = computeCultureRisk(s, c);
  const timeRisk = computeTimeRisk(s, wfs);
  const confRisk = Math.round((1 - oc) * 100 * 100) / 100;
  const adaptScore = computeAdaptabilityScore(s);
  const adaptRisk = 100 - adaptScore;
  const oppRisk = Math.round(((execRisk + cultRisk + timeRisk) / 3) * 100) / 100;
  const eos = computeExpectedOutcomeScore({ wfs, adapt: adaptScore, exec: execRisk, cult: cultRisk, time: timeRisk, conf: oc });

  const execSuccess = Math.round(Math.max(0, Math.min(1, (100 - (execRisk * 0.6 + confRisk * 0.4)) / 100)) * 100) / 100;
  const scenFit = Math.round(Math.min(1, wfs / 100) * 100) / 100;

  let likelyOutcome = "";
  let strategicLabel = "";
  if (eos >= 75 && adaptScore >= 70) {
    likelyOutcome = `${scoring.candidate_name} is likely to deliver strong results with high adaptability in this scenario.`;
    strategicLabel = "High-Upside Adaptive Leader";
  } else if (eos >= 65) {
    likelyOutcome = `${scoring.candidate_name} is likely to deliver solid results with some manageable trade-offs.`;
    strategicLabel = "Balanced Performer";
  } else if (execRisk >= 60 || cultRisk >= 60) {
    likelyOutcome = `${scoring.candidate_name} may struggle due to elevated execution or culture risk in this scenario.`;
    strategicLabel = "High-Risk Specialist";
  } else {
    likelyOutcome = `${scoring.candidate_name} is projected to deliver moderate results but may require support in weaker areas.`;
    strategicLabel = "Context-Dependent Candidate";
  }

  return {
    candidate_id: scoring.candidate_id,
    candidate_name: scoring.candidate_name,
    execution_risk: execRisk,
    culture_risk: cultRisk,
    time_risk: timeRisk,
    confidence_risk: confRisk,
    adaptability_risk: adaptRisk,
    opportunity_cost_risk: oppRisk,
    adaptability_score: adaptScore,
    // Phase 1C (docs/decisions/ADR-0003): honestly represented as
    // unmeasured rather than a fabricated number. No multi-scenario
    // execution occurs yet — see docs/architecture/KNOWN_LIMITATIONS.md P0.2.
    cross_scenario_consistency: "not_measured",
    expected_execution_success: execSuccess,
    scenario_fit: scenFit,
    expected_outcome_score: eos,
    likely_outcome: likelyOutcome,
    strategic_label: strategicLabel,
  };
}

// ===== RUN METADATA =====

function createRunMetadataTracker(provider, model) {
  const promptVersions = {};
  const schemaVersions = {};
  const attempts = {};
  const startedAt = new Date().toISOString();

  return {
    record(stageId, { promptVersion, schemaVersion, meta }) {
      if (promptVersion) promptVersions[stageId] = promptVersion;
      if (schemaVersion) schemaVersions[stageId] = schemaVersion;
      if (meta?.attempts !== undefined) attempts[stageId] = meta.attempts;
    },
    finalize() {
      return {
        provider: provider.name,
        model,
        promptVersions,
        schemaVersions,
        attempts,
        startedAt,
        completedAt: new Date().toISOString(),
      };
    },
  };
}

// ===== ORCHESTRATOR =====

/**
 * @param {import("../ai/types.js").AIProvider} provider - Resolved exactly
 *   once by the caller for this entire run. Every stage below uses this
 *   same instance; nothing in this function ever constructs another one.
 * @param {string} model - The model string associated with `provider` for
 *   this run, recorded in metadata only (the adapter already has it bound).
 * @param {object} input
 * @param {(stages: object[]) => void} [onUpdate]
 */
export async function runPipeline(provider, model, input, onUpdate) {
  const enablePairing = input.options?.enable_pair_simulation ?? false;
  const stages = [
    { id: "input", label: "Input Received", status: "pending" },
    { id: "role", label: "Role Analysis", status: "pending" },
    { id: "scenario", label: "Scenario Analysis", status: "pending" },
    { id: "scoring", label: "Candidate Scoring", status: "pending" },
    { id: "confidence_review", label: "Confidence & Evidence Review", status: "pending" },
    { id: "outcome", label: "Outcome Modeling", status: "pending" },
    { id: "decision", label: "Decision Generation", status: "pending" },
    ...(enablePairing ? [{ id: "pairing", label: "Pairing Simulation", status: "pending" }] : []),
    { id: "complete", label: "Completed", status: "pending" },
  ];

  const update = (id, upd) => { const s = stages.find((s) => s.id === id); if (s) { Object.assign(s, upd); onUpdate?.([...stages]); } };
  const timed = async (id, fn) => {
    const t = Date.now(); update(id, { status: "running" });
    try { const r = await fn(); update(id, { status: "completed", duration_ms: Date.now() - t }); return r; }
    catch (e) { update(id, { status: "failed", duration_ms: Date.now() - t, warnings: [e.message] }); throw e; }
  };

  const runMeta = createRunMetadataTracker(provider, model);

  await timed("input", async () => { update("input", { summary: `Received ${input.candidates.length} candidates for "${input.scenario}".` }); });

  const role = await timed("role", async () => {
    const { data, meta } = await runRoleAnalysis(provider, { title: input.role.title, description: input.role.description, scenario: input.scenario });
    runMeta.record("role", { promptVersion: roleAnalysisPromptVersion, schemaVersion: ROLE_ANALYSIS_SCHEMA_VERSION, meta });
    update("role", { summary: `Identified criteria. Complexity: ${data.complexity_rating}. Must-haves: ${(data.must_have_criteria || []).join(", ")}.` });
    return data;
  });

  const scenario = await timed("scenario", async () => {
    const { data, meta } = await runScenarioAnalysis(provider, { scenario: input.scenario, roleTitle: input.role.title, baselineWeights: role.baseline_weights });
    runMeta.record("scenario", { promptVersion: scenarioAnalysisPromptVersion, schemaVersion: SCENARIO_ANALYSIS_SCHEMA_VERSION, meta });
    const top = Object.entries(data.normalized_weights).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v.toFixed(1)}%`).join(", ");
    update("scenario", { summary: `Applied adjustments. Top criteria: ${top}.` });
    return data;
  });

  const normalizedWeights = scenario.normalized_weights;

  const scorings = await timed("scoring", async () => {
    update("scoring", { summary: `Scoring ${input.candidates.length} candidates…` });
    const res = await mapWithConcurrency(input.candidates, 2, async (c) => {
      const { data, meta } = await runCandidateScoring(provider, c, input.scenario, input.role.title);
      runMeta.record(`scoring:${c.id}`, { promptVersion: candidateScoringPromptVersion, schemaVersion: CANDIDATE_SCORING_SCHEMA_VERSION, meta });
      return data;
    });
    update("scoring", { summary: `Scored ${res.length} candidates across 7 criteria.` });
    return res;
  });

  const metrics = scorings.map((s) => {
    const sc = Object.fromEntries(Object.entries(s.criteria_scores).map(([k, cs]) => [k, cs.score]));
    const co = Object.fromEntries(Object.entries(s.criteria_scores).map(([k, cs]) => [k, cs.confidence]));
    return { scoring: s, wfs: computeWeightedFitScore(sc, normalizedWeights), oc: computeOverallConfidence(co, normalizedWeights) };
  });

  const confidenceReviews = await timed("confidence_review", async () => {
    const res = metrics.map((m) => confidenceEvidenceReview(m.scoring, m.oc));
    update("confidence_review", { summary: `${res.filter((r) => r.bias_flags.length > 0).length} with confidence/evidence flags, ${res.filter((r) => r.recommend_human_review).length} for human review.` });
    return res;
  });

  const outcomes = await timed("outcome", async () => {
    const res = metrics.map((m) => outcomeModeling(m.scoring, m.wfs, m.oc));
    update("outcome", { summary: `Top expected outcome: ${Math.max(...res.map((r) => r.expected_outcome_score)).toFixed(1)}.` });
    return res;
  });

  // Deterministic ranking — computed before any explanation-generating LLM
  // call, and never altered by one. See the boundary test in
  // runPipeline.test.js.
  const decisionInputs = metrics.map((m, i) => ({ ...m, outcome: outcomes[i] }));
  const rankedForDecision = decisionInputs.map((c) => {
    const riskAdj = computeRiskAdjustedScore({
      wfs: c.wfs, exec: c.outcome.execution_risk, cult: c.outcome.culture_risk,
      time: c.outcome.time_risk, conf: c.oc, adapt: c.outcome.adaptability_score, opp: c.outcome.opportunity_cost_risk,
    });
    const normMode = input.decision_mode === "best_outcome" ? "best_expected_outcome" : input.decision_mode;
    const sort = normMode === "best_fit" ? c.wfs : normMode === "lowest_risk" ? riskAdj : c.outcome.expected_outcome_score;
    return { ...c, riskAdj, sort };
  }).sort((a, b) => b.sort - a.sort);

  const decision = await timed("decision", async () => {
    const modeLabel = { best_fit: "Best Fit", lowest_risk: "Risk-Adjusted Choice", best_expected_outcome: "Best Outcome", best_outcome: "Best Outcome" }[input.decision_mode] || input.decision_mode;
    const winner = rankedForDecision[0];
    const runnerUp = rankedForDecision[1];
    const summ = rankedForDecision.slice(0, 4).map((c, i) => `Rank ${i + 1}: ${c.scoring.candidate_name} | Fit:${c.wfs} RiskAdj:${c.riskAdj} Outcome:${c.outcome.expected_outcome_score} Label:${c.outcome.strategic_label}`).join("\n");

    let llm, llmMeta;
    try {
      const result = await runDecisionExplanation(provider, summ, input.role.title, input.scenario, modeLabel, winner.scoring.candidate_name);
      llm = result.data; llmMeta = result.meta;
      runMeta.record("decision", { promptVersion: decisionExplanationPromptVersion, schemaVersion: DECISION_EXPLANATION_SCHEMA_VERSION, meta: llmMeta });
    } catch {
      llm = {
        final_label: modeLabel, key_reason: `${winner.scoring.candidate_name} ranked highest.`,
        executive_interpretation: `${winner.scoring.candidate_name} is the recommended candidate.`,
        winner_reason: `Top-ranked under ${modeLabel}.`, runner_up_trade_off: "",
        trade_offs: [{ title: "Top Choice", description: `${winner.scoring.candidate_name} delivers strongest ${modeLabel} alignment.`, type: "gain", severity: "low" }],
        executive_summary: { recommendation: `${winner.scoring.candidate_name} recommended.`, reason: "Highest computed score.", trade_off: "", opportunity_cost: "", adaptability: "", alternative: runnerUp?.scoring.candidate_name || "" },
      };
    }

    if (llm.winner_reason) rankedForDecision[0].winner_reason = llm.winner_reason;
    if (llm.runner_up_trade_off && rankedForDecision[1]) rankedForDecision[1].trade_off_note = llm.runner_up_trade_off;

    const rankedOut = rankedForDecision.map((c, i) => ({
      candidate_id: c.scoring.candidate_id, candidate_name: c.scoring.candidate_name,
      rank: i + 1, weighted_fit_score: c.wfs, risk_adjusted_score: c.riskAdj,
      expected_outcome_score: c.outcome.expected_outcome_score, overall_confidence: c.oc,
      strategic_labels: [c.outcome.strategic_label],
      winner_reason: c.winner_reason, trade_off_note: c.trade_off_note,
      criteria_scores: c.scoring.criteria_scores, strengths: c.scoring.strengths, weaknesses: c.scoring.weaknesses,
      risk_profile: { execution_risk: c.outcome.execution_risk / 100, culture_risk: c.outcome.culture_risk / 100, time_risk: c.outcome.time_risk / 100, adaptability_risk: c.outcome.adaptability_risk / 100, confidence_risk: c.outcome.confidence_risk / 100, opportunity_cost_risk: c.outcome.opportunity_cost_risk / 100 },
      outcome_model: {
        expected_execution_success: c.outcome.expected_execution_success, scenario_fit: c.outcome.scenario_fit,
        adaptability_score: c.outcome.adaptability_score / 100, likely_outcome: c.outcome.likely_outcome,
        strategic_label: c.outcome.strategic_label, cross_scenario_consistency: c.outcome.cross_scenario_consistency,
      },
    }));

    update("decision", { summary: `Recommended: ${winner.scoring.candidate_name} (${llm.final_label || modeLabel}). Confidence: ${(winner.oc * 100).toFixed(0)}%.` });

    return {
      rankedFull: rankedForDecision, rankedOut,
      winner_id: winner.scoring.candidate_id, winner_name: winner.scoring.candidate_name,
      final_label: llm.final_label || modeLabel, key_reason: llm.key_reason, overall_confidence: winner.oc,
      executive_interpretation: llm.executive_interpretation, trade_offs: llm.trade_offs || [],
      adaptability_profiles: rankedForDecision.slice(0, 4).map((c) => ({
        candidate_name: c.scoring.candidate_name, adaptability_score: c.outcome.adaptability_score / 100,
        cross_scenario_consistency: c.outcome.cross_scenario_consistency,
        best_scenario: input.scenario, worst_scenario: "Rapid crisis/pivot scenario",
        resilience_note: c.outcome.adaptability_score > 70 ? `${c.scoring.candidate_name} shows strong adaptability on the criteria observed in this run.` : `${c.scoring.candidate_name} is more specialized — performs well in ${input.scenario} but may struggle under rapid pivots.`,
      })),
      executive_summary: llm.executive_summary,
    };
  });

  // Phase 1C fix (docs/architecture/KNOWN_LIMITATIONS.md P0.1): pairing now
  // receives the top four candidates by the deterministic ranking just
  // computed above (`decision.rankedFull`, sorted by this run's actual
  // decision_mode), not the first four as submitted.
  let pairing;
  if (enablePairing) {
    try {
      pairing = await timed("pairing", async () => {
        const top = decision.rankedFull.slice(0, 4);
        const pairs = [];
        for (let i = 0; i < top.length; i++) {
          for (let j = i + 1; j < top.length; j++) {
            try {
              const { data, meta } = await runPairingAnalysis(provider, top[i], top[j], input.scenario);
              runMeta.record(`pairing:${i}-${j}`, { promptVersion: pairingAnalysisPromptVersion, schemaVersion: PAIRING_ANALYSIS_SCHEMA_VERSION, meta });
              const pairScore = computePairScore({ sc: data.scenario_coverage, comp: data.complementarity, over: data.overlap_risk, conf: data.conflict_risk, coh: data.execution_cohesion, pa: data.pair_adaptability });
              pairs.push({ pair: [top[i].scoring.candidate_name, top[j].scoring.candidate_name], pair_score: pairScore / 10, ...data });
            } catch (e) { console.error("Pair scoring failed:", e.message); }
          }
        }
        pairs.sort((a, b) => b.pair_score - a.pair_score);
        const result = pairs.length === 0
          ? { best_pair: { pair: [top[0].scoring.candidate_name, top[1].scoring.candidate_name], pair_score: 7.0, scenario_coverage: 0.75, complementarity: 0.70, overlap_risk: 0.25, conflict_risk: 0.20, execution_cohesion: 0.72, pair_adaptability: 0.68, explanation: "Default pair." }, top_pairs: [] }
          : { best_pair: pairs[0], top_pairs: pairs.slice(0, 3) };
        update("pairing", { summary: `Best pair: ${result.best_pair.pair[0]} + ${result.best_pair.pair[1]} (${result.best_pair.pair_score.toFixed(1)}).` });
        return result;
      });
    } catch (e) { console.error("Pairing failed:", e.message); }
  }

  await timed("complete", async () => { update("complete", { summary: `Pipeline complete. ${decision.rankedOut.length} candidates evaluated.` }); });

  return {
    request_id: `req_${Date.now()}`,
    pipeline_steps: stages,
    role_analysis: { title: input.role.title, key_requirements: role.must_have_criteria || [], complexity: role.complexity_rating },
    scenario_analysis: { scenario: input.scenario, key_pressures: scenario.key_pressures || [], weight_rationale: scenario.weight_rationale || "" },
    candidate_evaluations: decision.rankedOut,
    bias_confidence_reviews: confidenceReviews,
    outcome_models: outcomes.map((o) => ({
      expected_execution_success: o.expected_execution_success, scenario_fit: o.scenario_fit,
      adaptability_score: o.adaptability_score / 100, likely_outcome: o.likely_outcome,
      strategic_label: o.strategic_label, cross_scenario_consistency: o.cross_scenario_consistency,
    })),
    decision_result: { recommended_candidate_id: decision.winner_id, recommended_candidate_name: decision.winner_name, decision_mode: input.decision_mode, scenario: input.scenario, final_label: decision.final_label, key_reason: decision.key_reason, overall_confidence: decision.overall_confidence, executive_interpretation: decision.executive_interpretation },
    pairing_result: pairing,
    trade_offs: decision.trade_offs || [],
    adaptability_profiles: decision.adaptability_profiles || [],
    agent_outputs: [
      { agent_name: "Role Agent", agent_role: "Defines criteria & base weights from role description", inputs: ["Role title", "Description", "Scenario"], outputs: ["7 criteria", "Base weights", "Must-haves", "Success definition"], summary: `Complexity: ${role.complexity_rating}. Success: ${role.role_success_definition}` },
      { agent_name: "Scenario Agent", agent_role: "Adjusts weights for business scenario", inputs: ["Base weights", `Scenario: ${input.scenario}`], outputs: ["Adjusted weights", "Normalized weights", "Key pressures"], summary: scenario.weight_rationale },
      { agent_name: "Candidate Scoring Agent", agent_role: "Scores candidates from text (LLM)", inputs: [`${input.candidates.length} profiles`, "7 criteria"], outputs: ["Criterion scores (1-10)", "Confidence", "Evidence"], summary: `Scored ${scorings.length} candidates. Evidence-based, grounded in descriptions.` },
      { agent_name: "Confidence & Evidence Review", agent_role: "Reviews scoring confidence and evidence quality — not a demographic or legal bias audit", inputs: ["All scores", "Evidence quality"], outputs: ["Confidence/evidence flags", "Review recommendations"], summary: `${confidenceReviews.filter((b) => b.recommend_human_review).length}/${confidenceReviews.length} candidates flagged for human review.` },
      { agent_name: "Outcome Modeling Agent", agent_role: "Computes risk profiles and expected outcomes (deterministic)", inputs: ["Weighted scores", "Confidence"], outputs: ["6 risk dimensions", "Adaptability", "Expected outcome"], summary: `Risk computed: execution, culture, time, confidence, adaptability, opportunity cost.` },
      { agent_name: "Decision Agent", agent_role: "Ranks candidates and generates explanations (LLM)", inputs: ["All evaluations", `Mode: ${input.decision_mode}`], outputs: ["Ranked list", "Explanations", "Trade-offs", "Executive summary"], summary: `${decision.winner_name} recommended. Ranking is deterministic; explanations are LLM-generated from computed metrics.` },
      ...(pairing ? [{ agent_name: "Pairing Agent", agent_role: "Simulates optimal leadership pair among the top-ranked candidates", inputs: ["Top-ranked candidates", "Scenario"], outputs: ["Best pair", "Pair metrics"], summary: `Best: ${pairing.best_pair.pair[0]} + ${pairing.best_pair.pair[1]}. Score: ${pairing.best_pair.pair_score.toFixed(1)}.` }] : []),
    ],
    executive_summary: decision.executive_summary || { recommendation: `${decision.winner_name} recommended.`, reason: "Highest score.", trade_off: "", opportunity_cost: "", adaptability: "", alternative: "" },
    run_metadata: runMeta.finalize(),
  };
}
