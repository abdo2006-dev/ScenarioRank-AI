/**
 * ScenarioRank AI v3 — Complete Backend Server
 * Single-file compiled server. Run with: node server.mjs
 * Requires: ANTHROPIC_API_KEY env var
 *
 * Install deps first: npm install express cors
 */

import express from "express";
import cors from "cors";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// ── Auto-load .env file (so you don't need to export manually) ──────────────
const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
  console.log("✅ Loaded .env file");
}
// ────────────────────────────────────────────────────────────────────────────

const app = express();
const PORT = process.env.PORT || 3001;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const HAS_API_KEY = Boolean(ANTHROPIC_API_KEY);
const MODEL = "claude-sonnet-4-5";

// FIX #2: Hard ceiling on the entire pipeline so the server never runs
// longer than the frontend is willing to wait. Frontend waits 3 minutes,
// so we cap the pipeline at 2.5 minutes to ensure we always respond first.
const PIPELINE_TIMEOUT_MS = 150_000; // 2.5 minutes

app.use(cors({ origin: true, methods: ["GET", "POST", "OPTIONS"] }));
app.use(express.json({ limit: "10mb" }));

// ===== ANTHROPIC CLIENT =====

// Sanitize common LLM JSON quirks before parsing:
// - "+5" → "5"  (valid JS but invalid JSON)
// - trailing commas before } or ]
function sanitizeJSON(text) {
  return text
    .replace(/:\s*\+(\d)/g, ': $1')           // ": +5" → ": 5"
    .replace(/,(\s*[}\]])/g, '$1');            // trailing commas
}
function extractFirstJSON(text) {
  const start = text.search(/[{[]/);
  if (start === -1) return null;
  const opener = text[start];
  const closer = opener === "{" ? "}" : "]";
  let depth = 0, inString = false, escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\" && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === opener) depth++;
    else if (ch === closer) { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return null;
}

// FIX #1: The original code called clearTimeout() in a finally block that ran
// right after fetch() resolved (i.e. after HTTP *headers* arrived). This meant
// response.json() — which reads the *body* — had zero timeout protection.
// If Anthropic sent headers but stalled sending the body, response.json()
// would hang forever and the pipeline would never complete.
//
// Fix: keep everything inside one try/catch/finally so clearTimeout only fires
// after the full body has been read. The AbortController stays alive the whole time.
async function callClaudeJSON(systemPrompt, userMessage, maxTokens = 2000, timeoutMs = 90000) {
  if (!HAS_API_KEY) throw new Error("ANTHROPIC_API_KEY is missing on the server");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
      signal: controller.signal,
    });
    // response.text() and response.json() are now inside the try block,
    // so the AbortController is still armed while the body is being read.
    if (!response.ok) throw new Error(`Anthropic API ${response.status}: ${await response.text()}`);
    const data = await response.json();
    const text = data.content?.find(b => b.type === "text")?.text || "";
    const cleaned = sanitizeJSON(
      text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim()
    );
    try { return JSON.parse(cleaned); }
    catch {
      const extracted = extractFirstJSON(cleaned);
      if (extracted) return JSON.parse(sanitizeJSON(extracted));
      throw new Error(`Bad JSON: ${cleaned.slice(0, 200)}`);
    }
  } catch (err) {
    if (err && typeof err === "object" && err.name === "AbortError") {
      throw new Error(`Anthropic API request timed out after ${Math.round(timeoutMs / 1000)} seconds`);
    }
    throw err;
  } finally {
    // clearTimeout only runs here, after the full body has been consumed.
    clearTimeout(timeout);
  }
}

// ===== NORMALIZATION =====
function normalizeWeights(adjusted) {
  const clamped = {};
  for (const k of Object.keys(adjusted)) clamped[k] = Math.max(0, adjusted[k]);
  const total = Object.values(clamped).reduce((a, b) => a + b, 0);
  if (total === 0) { const eq = 100 / Object.keys(clamped).length; return Object.fromEntries(Object.keys(clamped).map(k => [k, eq])); }
  const norm = {};
  let run = 0;
  const keys = Object.keys(clamped);
  for (let i = 0; i < keys.length; i++) {
    if (i === keys.length - 1) norm[keys[i]] = Math.round((100 - run) * 100) / 100;
    else { const v = Math.round((clamped[keys[i]] / total) * 10000) / 100; norm[keys[i]] = v; run += v; }
  }
  return norm;
}

function applyDeltas(base, deltas) {
  const adj = {};
  for (const k of Object.keys(base)) adj[k] = base[k] + (deltas[k] ?? 0);
  return normalizeWeights(adj);
}

// ===== SCORING =====
function clamp(v, min = 0, max = 100) { return Math.max(min, Math.min(max, v)); }

function computeWeightedFitScore(scores, weights) {
  let total = 0;
  for (const k of Object.keys(weights)) total += (scores[k] ?? 0) * (weights[k] ?? 0) / 10;
  return Math.round(total * 100) / 100;
}

function computeOverallConfidence(confs, weights) {
  let ws = 0, tw = 0;
  for (const k of Object.keys(weights)) { ws += (confs[k] ?? 0) * (weights[k] ?? 0); tw += weights[k] ?? 0; }
  return tw === 0 ? 0 : Math.round(ws / tw * 100) / 100;
}

function computeExecutionRisk(s) {
  return clamp(Math.round((100 - (0.45 * (s.operational_execution ?? 0) * 10 + 0.30 * (s.domain_expertise ?? 0) * 10 + 0.25 * (s.crisis_management ?? 0) * 10)) * 100) / 100);
}

function computeCultureRisk(s, c) {
  return clamp(Math.round((100 - (0.60 * (s.stakeholder_management ?? 0) * 10 + 0.20 * (s.transformation_leadership ?? 0) * 10 + 0.20 * (c.stakeholder_management ?? 0) * 100)) * 100) / 100);
}

function computeTimeRisk(s, wfs) {
  return clamp(Math.round((100 - (0.40 * (s.domain_expertise ?? 0) * 10 + 0.35 * (s.operational_execution ?? 0) * 10 + 0.25 * wfs)) * 100) / 100);
}

function computeAdaptabilityScore(s, consistency) {
  return clamp(Math.round((0.35 * consistency + 0.25 * (s.transformation_leadership ?? 0) * 10 + 0.20 * (s.stakeholder_management ?? 0) * 10 + 0.20 * (s.innovation_digital ?? 0) * 10) * 100) / 100);
}

function computeExpectedOutcomeScore(p) {
  return Math.round((0.35 * p.wfs + 0.20 * p.adapt + 0.20 * (100 - p.exec) + 0.10 * (100 - p.cult) + 0.10 * (100 - p.time) + 0.05 * p.conf * 100) * 100) / 100;
}

function computeRiskAdjustedScore(p) {
  // All terms normalized to a roughly 0-100 scale.
  return Math.round((p.wfs - 0.25 * p.exec - 0.20 * p.cult - 0.15 * p.time - 0.15 * (1 - p.conf) * 100 - 0.10 * (100 - p.adapt) - 0.15 * p.opp) * 100) / 100;
}

function computePairScore(m) {
  return clamp(Math.round((0.30 * m.sc * 100 + 0.25 * m.comp * 100 + 0.20 * m.coh * 100 + 0.15 * m.pa * 100 - 0.10 * m.conf * 100 - 0.05 * m.over * 100) * 100) / 100);
}

// ===== AGENTS =====

async function runRoleAgent(input) {
  const sys = `You are an expert organizational psychologist. Return valid JSON only. No explanation, no markdown, just the JSON object.`;
  const msg = `Analyze this role and return evaluation weights.
Role: ${input.title}
Description: ${input.description}
Scenario: ${input.scenario}

Return this exact JSON structure (fill in the values, keep all 7 keys):
{
  "criteria": ["domain_expertise","transformation_leadership","operational_execution","stakeholder_management","crisis_management","innovation_digital","strategic_scalability"],
  "baseline_weights": {"domain_expertise":15,"transformation_leadership":15,"operational_execution":15,"stakeholder_management":15,"crisis_management":15,"innovation_digital":12,"strategic_scalability":13},
  "must_have_criteria": ["domain_expertise","stakeholder_management"],
  "role_success_definition": "one sentence",
  "complexity_rating": "high"
}
Rules: criteria must be the exact 7 strings shown. baseline_weights must use those same 7 keys and sum to 100. complexity_rating must be low, medium, or high.`;
  const r = await callClaudeJSON(sys, msg, 2000);
  // Ensure criteria is always the flat string array (guard against Claude returning objects)
  r.criteria = ["domain_expertise","transformation_leadership","operational_execution","stakeholder_management","crisis_management","innovation_digital","strategic_scalability"];
  // Normalize weights
  const keys = Object.keys(r.baseline_weights || {});
  if (keys.length === 0) {
    r.baseline_weights = { domain_expertise:15, transformation_leadership:15, operational_execution:15, stakeholder_management:15, crisis_management:15, innovation_digital:12, strategic_scalability:13 };
  } else {
    const total = Object.values(r.baseline_weights).reduce((a, b) => a + b, 0);
    if (Math.abs(total - 100) > 1) for (const k of keys) r.baseline_weights[k] = Math.round(r.baseline_weights[k] / total * 10000) / 100;
  }
  return r;
}

async function runScenarioAgent(input) {
  const sys = `You are a strategic leadership analyst. Return valid JSON only.
Criteria: domain_expertise, transformation_leadership, operational_execution, stakeholder_management, crisis_management, innovation_digital, strategic_scalability.`;
  const msg = `Analyze scenario weight adjustments:
Role: ${input.roleTitle}
Scenario: ${input.scenario}
Baseline weights: ${JSON.stringify(input.baselineWeights)}

Return JSON: { "priority_shifts": {...}, "weight_deltas": {"domain_expertise": 0, "transformation_leadership": 0, "operational_execution": 0, "stakeholder_management": 0, "crisis_management": 0, "innovation_digital": 0, "strategic_scalability": 0}, "scenario_success_definition": "...", "scenario_failure_definition": "...", "scenario_risks": [...], "key_pressures": [...], "weight_rationale": "..." }
IMPORTANT: weight_deltas values must be plain integers like -5 or 10. Never use + prefix (write 5 not +5).`;
  const r = await callClaudeJSON(sys, msg, 1500);
  const normalized = applyDeltas(input.baselineWeights, r.weight_deltas || {});
  const adjustedRaw = {};
  for (const k of Object.keys(input.baselineWeights)) adjustedRaw[k] = Math.max(0, input.baselineWeights[k] + (r.weight_deltas?.[k] ?? 0));
  return { ...r, adjusted_weights: adjustedRaw, normalized_weights: normalized };
}

async function runCandidateScoringAgent(candidate, scenario, roleTitle) {
  const sys = `You are an expert executive recruiter. Score candidates 1-10 on criteria and return valid JSON only. Keep evidence and reasoning brief.`;
  const msg = `Evaluate candidate for ${roleTitle} in scenario: ${scenario}.
Candidate: ${candidate.name}
Profile: ${candidate.description}

Return JSON only with this exact shape:
{
  "candidate_id": "${candidate.id}",
  "candidate_name": "${candidate.name}",
  "criteria_scores": {
    "domain_expertise": {"score": N, "confidence": N, "evidence": "...", "reasoning": "..."},
    "transformation_leadership": {"score": N, "confidence": N, "evidence": "...", "reasoning": "..."},
    "operational_execution": {"score": N, "confidence": N, "evidence": "...", "reasoning": "..."},
    "stakeholder_management": {"score": N, "confidence": N, "evidence": "...", "reasoning": "..."},
    "crisis_management": {"score": N, "confidence": N, "evidence": "...", "reasoning": "..."},
    "innovation_digital": {"score": N, "confidence": N, "evidence": "...", "reasoning": "..."},
    "strategic_scalability": {"score": N, "confidence": N, "evidence": "...", "reasoning": "..."}
  },
  "strengths": ["...", "..."],
  "weaknesses": ["...", "..."],
  "best_fit_contexts": ["...", "..."]
}`;
  const r = await callClaudeJSON(sys, msg, 1400, 60000);
  r.candidate_id = candidate.id;
  r.candidate_name = candidate.name;
  return r;
}

async function runBiasConfidenceAgent(scoring, overallConfidence) {
  const lowConf = Object.entries(scoring.criteria_scores)
    .filter(([, cs]) => cs.confidence < 0.65)
    .map(([k]) => k);

  const biasFlags = [];

  if (overallConfidence < 0.6) {
    biasFlags.push({
      type: "low_overall_confidence",
      severity: "high",
      description: "Overall confidence is low, so this recommendation should be reviewed carefully."
    });
  }

  if (lowConf.length >= 3) {
    biasFlags.push({
      type: "multiple_low_confidence_criteria",
      severity: "medium",
      description: `Low confidence in multiple criteria: ${lowConf.join(", ")}.`
    });
  }

  const weakEvidenceFlags = Object.entries(scoring.criteria_scores)
    .filter(([, cs]) => !cs.evidence || cs.evidence.trim().length < 15)
    .map(([k]) => k);

  const recommendHumanReview =
    overallConfidence < 0.65 ||
    lowConf.length >= 3 ||
    biasFlags.some(f => f.severity === "high");

  const recommendRescore = weakEvidenceFlags.length >= 3;

  return {
    candidate_id: scoring.candidate_id,
    candidate_name: scoring.candidate_name,
    overall_confidence: overallConfidence,
    low_confidence_criteria: lowConf,
    bias_flags: biasFlags.map(f => ({
      ...f,
      candidate_id: scoring.candidate_id
    })),
    weak_evidence_flags: weakEvidenceFlags,
    recommend_human_review: recommendHumanReview,
    recommend_rescore: recommendRescore,
    review_summary:
      recommendHumanReview
        ? "Confidence or evidence gaps detected. Human review recommended."
        : "No major bias/confidence concerns detected."
  };
}

async function runOutcomeModelingAgent(scoring, wfs, oc, scenario) {
  const s = Object.fromEntries(
    Object.entries(scoring.criteria_scores).map(([k, cs]) => [k, cs.score])
  );

  const c = Object.fromEntries(
    Object.entries(scoring.criteria_scores).map(([k, cs]) => [k, cs.confidence])
  );

  const execRisk = computeExecutionRisk(s);
  const cultRisk = computeCultureRisk(s, c);
  const timeRisk = computeTimeRisk(s, wfs);
  const confRisk = Math.round((1 - oc) * 100 * 100) / 100;
  const adaptScore = computeAdaptabilityScore(s, 75);
  const adaptRisk = 100 - adaptScore;
  const oppRisk = Math.round((execRisk + cultRisk + timeRisk) / 3 * 100) / 100;
  const eos = computeExpectedOutcomeScore({
    wfs,
    adapt: adaptScore,
    exec: execRisk,
    cult: cultRisk,
    time: timeRisk,
    conf: oc
  });

  const execSuccess =
    Math.round(
      Math.max(0, Math.min(1, (100 - (execRisk * 0.6 + confRisk * 0.4)) / 100)) * 100
    ) / 100;

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
    cross_scenario_consistency: 75,
    expected_execution_success: execSuccess,
    scenario_fit: scenFit,
    expected_outcome_score: eos,
    likely_outcome: likelyOutcome,
    strategic_label: strategicLabel
  };
}

async function runDecisionAgent(candidates, decisionMode, scenario, roleTitle) {
  const ranked = candidates.map(c => {
    const riskAdj = computeRiskAdjustedScore({
      wfs: c.wfs, exec: c.outcome.execution_risk, cult: c.outcome.culture_risk,
      time: c.outcome.time_risk, conf: c.oc, adapt: c.outcome.adaptability_score, opp: c.outcome.opportunity_cost_risk,
    });
    // "best_outcome" is a frontend alias for "best_expected_outcome"
    const normMode = decisionMode === "best_outcome" ? "best_expected_outcome" : decisionMode;
    const sort = normMode === "best_fit" ? c.wfs : normMode === "lowest_risk" ? riskAdj : c.outcome.expected_outcome_score;
    return { ...c, riskAdj, sort };
  }).sort((a, b) => b.sort - a.sort);

  const modeLabel = { best_fit: "Best Fit", lowest_risk: "Risk-Adjusted Choice", best_expected_outcome: "Best Outcome", best_outcome: "Best Outcome" }[decisionMode] || decisionMode;
  const winner = ranked[0];
  const runnerUp = ranked[1];

  const summ = ranked.slice(0, 4).map((c, i) => `Rank ${i+1}: ${c.scoring.candidate_name} | Fit:${c.wfs} RiskAdj:${c.riskAdj} Outcome:${c.outcome.expected_outcome_score} Label:${c.outcome.strategic_label}`).join("\n");

  const sys = `You are a senior leadership advisor. Generate explanations grounded ONLY in the computed metrics. Return valid JSON only.`;
  const msg = `Generate explanations for this decision:
Role: ${roleTitle}, Scenario: ${scenario}, Mode: ${modeLabel}, Winner: ${winner.scoring.candidate_name}
${summ}
Return JSON: { "final_label":"...","key_reason":"...","executive_interpretation":"...","winner_reason":"...","runner_up_trade_off":"...","trade_offs":[{"title":"...","description":"...","type":"gain|sacrifice|opportunity_cost|risk|adaptability","severity":"low|medium|high"}],"executive_summary":{"recommendation":"...","reason":"...","trade_off":"...","opportunity_cost":"...","adaptability":"...","alternative":"..."} }`;

  let llm;
  try { llm = await callClaudeJSON(sys, msg, 2200); }
  catch {
    llm = {
      final_label: modeLabel, key_reason: `${winner.scoring.candidate_name} ranked highest.`,
      executive_interpretation: `${winner.scoring.candidate_name} is the recommended candidate.`,
      winner_reason: `Top-ranked under ${modeLabel}.`, runner_up_trade_off: "",
      trade_offs: [{ title: "Top Choice", description: `${winner.scoring.candidate_name} delivers strongest ${modeLabel} alignment.`, type: "gain" }],
      executive_summary: { recommendation: `${winner.scoring.candidate_name} recommended.`, reason: "Highest computed score.", trade_off: "", opportunity_cost: "", adaptability: "", alternative: runnerUp?.scoring.candidate_name || "" },
    };
  }

  if (llm.winner_reason) ranked[0].winner_reason = llm.winner_reason;
  if (llm.runner_up_trade_off && ranked[1]) ranked[1].trade_off_note = llm.runner_up_trade_off;

  const rankedOut = ranked.map((c, i) => ({
    candidate_id: c.scoring.candidate_id, candidate_name: c.scoring.candidate_name,
    rank: i + 1, weighted_fit_score: c.wfs, risk_adjusted_score: c.riskAdj,
    expected_outcome_score: c.outcome.expected_outcome_score, overall_confidence: c.oc,
    strategic_labels: [c.outcome.strategic_label],
    winner_reason: c.winner_reason, trade_off_note: c.trade_off_note,
    criteria_scores: c.scoring.criteria_scores, strengths: c.scoring.strengths, weaknesses: c.scoring.weaknesses,
    risk_profile: { execution_risk: c.outcome.execution_risk/100, culture_risk: c.outcome.culture_risk/100, time_risk: c.outcome.time_risk/100, adaptability_risk: c.outcome.adaptability_risk/100, confidence_risk: c.outcome.confidence_risk/100, opportunity_cost_risk: c.outcome.opportunity_cost_risk/100 },
    outcome_model: { expected_execution_success: c.outcome.expected_execution_success, scenario_fit: c.outcome.scenario_fit, adaptability_score: c.outcome.adaptability_score/100, likely_outcome: c.outcome.likely_outcome, strategic_label: c.outcome.strategic_label },
  }));

  return {
    ranked_candidates: rankedOut,
    winner_id: winner.scoring.candidate_id, winner_name: winner.scoring.candidate_name,
    decision_mode: decisionMode, final_label: llm.final_label || modeLabel,
    key_reason: llm.key_reason, overall_confidence: winner.oc,
    executive_interpretation: llm.executive_interpretation,
    trade_offs: llm.trade_offs || [],
    adaptability_profiles: ranked.slice(0, 4).map(c => ({
      candidate_name: c.scoring.candidate_name, adaptability_score: c.outcome.adaptability_score/100,
      best_scenario: scenario, worst_scenario: "Rapid crisis/pivot scenario",
      resilience_note: c.outcome.adaptability_score > 70 ? `${c.scoring.candidate_name} shows strong cross-scenario adaptability.` : `${c.scoring.candidate_name} is more specialized — performs well in ${scenario} but may struggle under rapid pivots.`,
    })),
    executive_summary: llm.executive_summary,
  };
}

async function runPairingAgent(candidates, scenario) {
  if (candidates.length < 2) throw new Error("Need 2+ candidates");
  const top = candidates.slice(0, 4);
  const pairs = [];
  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) {
      try {
        const c1 = top[i], c2 = top[j];
        const sys = `You are a leadership team dynamics expert. Return valid JSON only. All values 0.0-1.0.`;
        const msg = `Evaluate pair for ${scenario}:
${c1.scoring.candidate_name}: strengths=${c1.scoring.strengths.slice(0,2).join("; ")}, label=${c1.outcome.strategic_label}
${c2.scoring.candidate_name}: strengths=${c2.scoring.strengths.slice(0,2).join("; ")}, label=${c2.outcome.strategic_label}
Return JSON: {"scenario_coverage":N,"complementarity":N,"overlap_risk":N,"conflict_risk":N,"execution_cohesion":N,"pair_adaptability":N,"explanation":"..."}`;
        const r = await callClaudeJSON(sys, msg, 400);
        const pairScore = computePairScore({ sc: r.scenario_coverage ?? 0.7, comp: r.complementarity ?? 0.6, over: r.overlap_risk ?? 0.3, conf: r.conflict_risk ?? 0.2, coh: r.execution_cohesion ?? 0.7, pa: r.pair_adaptability ?? 0.65 });
        pairs.push({ pair: [c1.scoring.candidate_name, c2.scoring.candidate_name], pair_score: pairScore/10, scenario_coverage: r.scenario_coverage ?? 0.7, complementarity: r.complementarity ?? 0.6, overlap_risk: r.overlap_risk ?? 0.3, conflict_risk: r.conflict_risk ?? 0.2, execution_cohesion: r.execution_cohesion ?? 0.7, pair_adaptability: r.pair_adaptability ?? 0.65, explanation: r.explanation || "Pair evaluated." });
      } catch(e) { console.error("Pair scoring failed:", e); }
    }
  }
  pairs.sort((a, b) => b.pair_score - a.pair_score);
  if (pairs.length === 0) return { best_pair: { pair: [candidates[0].scoring.candidate_name, candidates[1].scoring.candidate_name], pair_score: 7.0, scenario_coverage: 0.75, complementarity: 0.70, overlap_risk: 0.25, conflict_risk: 0.20, execution_cohesion: 0.72, pair_adaptability: 0.68, explanation: "Default pair." }, top_pairs: [] };
  return { best_pair: pairs[0], top_pairs: pairs.slice(0, 3) };
}

// ===== PIPELINE ORCHESTRATOR =====

async function mapWithConcurrency(items, limit, worker) {
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

async function runPipeline(input, onUpdate) {
  const enablePairing = input.options?.enable_pair_simulation ?? false;
  const stages = [
    { id: "input", label: "Input Received", status: "pending" },
    { id: "role", label: "Role Analysis", status: "pending" },
    { id: "scenario", label: "Scenario Analysis", status: "pending" },
    { id: "scoring", label: "Candidate Scoring", status: "pending" },
    { id: "bias", label: "Bias & Confidence Review", status: "pending" },
    { id: "outcome", label: "Outcome Modeling", status: "pending" },
    { id: "decision", label: "Decision Generation", status: "pending" },
    ...(enablePairing ? [{ id: "pairing", label: "Pairing Simulation", status: "pending" }] : []),
    { id: "complete", label: "Completed", status: "pending" },
  ];

  const update = (id, upd) => { const s = stages.find(s => s.id === id); if (s) { Object.assign(s, upd); onUpdate?.([...stages]); } };
  const timed = async (id, fn) => {
    const t = Date.now(); update(id, { status: "running" });
    try { const r = await fn(); update(id, { status: "completed", duration_ms: Date.now()-t }); return r; }
    catch(e) { update(id, { status: "failed", duration_ms: Date.now()-t, warnings: [e.message] }); throw e; }
  };

  await timed("input", async () => { update("input", { summary: `Received ${input.candidates.length} candidates for "${input.scenario}".` }); });

  const role = await timed("role", async () => {
    const r = await runRoleAgent({ title: input.role.title, description: input.role.description, scenario: input.scenario });
    update("role", { summary: `Identified criteria. Complexity: ${r.complexity_rating}. Must-haves: ${(r.must_have_criteria||[]).join(", ")}.` });
    return r;
  });

  const scenario = await timed("scenario", async () => {
    const r = await runScenarioAgent({ scenario: input.scenario, roleTitle: input.role.title, baselineWeights: role.baseline_weights });
    const top = Object.entries(r.normalized_weights).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>`${k.replace(/_/g," ")}: ${v.toFixed(1)}%`).join(", ");
    update("scenario", { summary: `Applied adjustments. Top criteria: ${top}.` });
    return r;
  });

  const normalizedWeights = scenario.normalized_weights;

  // Score candidates sequentially to avoid Anthropic rate limits.
  // Each call waits for the previous to finish before starting.
  const scorings = await timed("scoring", async () => {
    update("scoring", { summary: `Scoring ${input.candidates.length} candidates with Claude…` });
    const res = await mapWithConcurrency(input.candidates, 2, async (c) => {
      let attempts = 0;
      while (true) {
        try {
          return await runCandidateScoringAgent(c, input.scenario, input.role.title);
        } catch (e) {
          attempts++;
          const msg = e?.message || String(e);
          const isRetryable = msg.includes("529") || msg.toLowerCase().includes("rate") || msg.toLowerCase().includes("overloaded") || msg.toLowerCase().includes("timed out");
          if (isRetryable && attempts < 2) {
            await new Promise(r => setTimeout(r, 1500 * attempts));
            continue;
          }
          throw e;
        }
      }
    });
    update("scoring", { summary: `Scored ${res.length} candidates across 7 criteria.` });
    return res;
  });

  const metrics = scorings.map(s => {
    const sc = Object.fromEntries(Object.entries(s.criteria_scores).map(([k,cs])=>[k,cs.score]));
    const co = Object.fromEntries(Object.entries(s.criteria_scores).map(([k,cs])=>[k,cs.confidence]));
    return { scoring: s, wfs: computeWeightedFitScore(sc, normalizedWeights), oc: computeOverallConfidence(co, normalizedWeights) };
  });

  const biasReviews = await timed("bias", async () => {
    const res = await Promise.all(metrics.map(m => runBiasConfidenceAgent(m.scoring, m.oc)));
    update("bias", { summary: `${res.filter(r=>r.bias_flags.length>0).length} with bias flags, ${res.filter(r=>r.recommend_human_review).length} for human review.` });
    return res;
  });

  const outcomes = await timed("outcome", async () => {
    const res = await Promise.all(metrics.map(m => runOutcomeModelingAgent(m.scoring, m.wfs, m.oc, input.scenario)));
    update("outcome", { summary: `Top expected outcome: ${Math.max(...res.map(r=>r.expected_outcome_score)).toFixed(1)}.` });
    return res;
  });

  const decision = await timed("decision", async () => {
    const decInp = metrics.map((m,i) => ({ ...m, outcome: outcomes[i] }));
    const r = await runDecisionAgent(decInp, input.decision_mode, input.scenario, input.role.title);
    update("decision", { summary: `Recommended: ${r.winner_name} (${r.final_label}). Confidence: ${(r.overall_confidence*100).toFixed(0)}%.` });
    return r;
  });

  let pairing;
  if (enablePairing) {
    try {
      pairing = await timed("pairing", async () => {
        const pInp = metrics.map((m,i) => ({ scoring: m.scoring, outcome: outcomes[i], weighted_fit_score: m.wfs }));
        const r = await runPairingAgent(pInp, input.scenario);
        update("pairing", { summary: `Best pair: ${r.best_pair.pair[0]} + ${r.best_pair.pair[1]} (${r.best_pair.pair_score.toFixed(1)}).` });
        return r;
      });
    } catch(e) { console.error("Pairing failed:", e); }
  }

  await timed("complete", async () => { update("complete", { summary: `Pipeline complete. ${decision.ranked_candidates.length} candidates evaluated.` }); });

  return {
    request_id: `req_${Date.now()}`,
    pipeline_steps: stages,
    role_analysis: { title: input.role.title, key_requirements: role.must_have_criteria || [], complexity: role.complexity_rating },
    scenario_analysis: { scenario: input.scenario, key_pressures: scenario.key_pressures || [], weight_rationale: scenario.weight_rationale || "" },
    candidate_evaluations: decision.ranked_candidates,
    bias_confidence_reviews: biasReviews,
    outcome_models: outcomes.map(o => ({ expected_execution_success: o.expected_execution_success, scenario_fit: o.scenario_fit, adaptability_score: o.adaptability_score/100, likely_outcome: o.likely_outcome, strategic_label: o.strategic_label })),
    decision_result: { recommended_candidate_id: decision.winner_id, recommended_candidate_name: decision.winner_name, decision_mode: input.decision_mode, scenario: input.scenario, final_label: decision.final_label, key_reason: decision.key_reason, overall_confidence: decision.overall_confidence, executive_interpretation: decision.executive_interpretation },
    pairing_result: pairing,
    trade_offs: decision.trade_offs || [],
    adaptability_profiles: decision.adaptability_profiles || [],
    agent_outputs: [
      { agent_name: "Role Agent", agent_role: "Defines criteria & base weights from role description", inputs: ["Role title", "Description", "Scenario"], outputs: ["7 criteria", "Base weights", "Must-haves", "Success definition"], summary: `Complexity: ${role.complexity_rating}. Success: ${role.role_success_definition}` },
      { agent_name: "Scenario Agent", agent_role: "Adjusts weights for business scenario", inputs: ["Base weights", `Scenario: ${input.scenario}`], outputs: ["Adjusted weights", "Normalized weights", "Key pressures"], summary: scenario.weight_rationale },
      { agent_name: "Candidate Scoring Agent", agent_role: "Scores candidates from text (LLM)", inputs: [`${input.candidates.length} profiles`, "7 criteria"], outputs: ["Criterion scores (1-10)", "Confidence", "Evidence"], summary: `Scored ${scorings.length} candidates. Evidence-based, grounded in descriptions.` },
      { agent_name: "Bias & Confidence Agent", agent_role: "Reviews scoring for bias and confidence gaps", inputs: ["All scores", "Evidence quality"], outputs: ["Bias flags", "Confidence warnings", "Review recommendations"], summary: `${biasReviews.filter(b=>b.recommend_human_review).length}/${biasReviews.length} candidates flagged for human review.` },
      { agent_name: "Outcome Modeling Agent", agent_role: "Computes risk profiles and expected outcomes (deterministic)", inputs: ["Weighted scores", "Confidence"], outputs: ["6 risk dimensions", "Adaptability", "Expected outcome"], summary: `Risk computed: execution, culture, time, confidence, adaptability, opportunity cost.` },
      { agent_name: "Decision Agent", agent_role: "Ranks candidates and generates explanations (LLM)", inputs: ["All evaluations", `Mode: ${input.decision_mode}`], outputs: ["Ranked list", "Explanations", "Trade-offs", "Executive summary"], summary: `${decision.winner_name} recommended. Ranking is deterministic; explanations are LLM-generated from computed metrics.` },
      ...(pairing ? [{ agent_name: "Pairing Agent", agent_role: "Simulates optimal leadership pair", inputs: ["Top candidates", "Scenario"], outputs: ["Best pair", "Pair metrics"], summary: `Best: ${pairing.best_pair.pair[0]} + ${pairing.best_pair.pair[1]}. Score: ${pairing.best_pair.pair_score.toFixed(1)}.` }] : []),
    ],
    executive_summary: decision.executive_summary || { recommendation: `${decision.winner_name} recommended.`, reason: "Highest score.", trade_off: "", opportunity_cost: "", adaptability: "", alternative: "" },
  };
}

// ===== ROUTES =====

app.get("/health", (_req, res) => res.json({ status: "ok", ai_enabled: HAS_API_KEY }));

function generateFallbackScenarios(title = "", description = "") {
  const text = `${title} ${description}`.toLowerCase();
  const scenarios = [];
  const push = (s) => { if (s && !scenarios.includes(s)) scenarios.push(s); };

  if (/merger|integration|culture/.test(text)) push("Post-merger integration with cultural clash risk");
  if (/scale|growth|market|expansion|geo/.test(text)) push("Rapid scaling in a new geographic market");
  if (/digital|transformation|legacy|automation|modern/.test(text)) push("Digital transformation in a legacy enterprise");
  if (/crisis|turnaround|runway|restructur|urgent/.test(text)) push("Crisis turnaround with limited runway");
  if (/launch|product|go-to-market|competitive/.test(text)) push("Greenfield product launch in competitive market");
  if (/people|culture|talent|dei|hr/.test(text)) push("Rebuilding trust and retention during organizational change");
  if (/supply chain|operations|manufacturing/.test(text)) push("Supplier disruption causing operational continuity risk");
  if (/finance|cost|efficiency/.test(text)) push("Cost pressure requiring efficiency without damaging morale");

  const generic = [
    "Rapid scaling in a new geographic market",
    "Digital transformation in a legacy enterprise",
    "Crisis turnaround with limited runway",
    "Cross-functional alignment during strategic change",
    "Greenfield product launch in competitive market",
  ];
  for (const s of generic) push(s);
  return scenarios.slice(0, 5);
}

app.post("/api/scenarios", async (req, res) => {
  const { title = "", description = "" } = req.body || {};
  if (!title.trim() || !description.trim()) {
    return res.status(400).json({
      error: "Role title and description are required."
    });
  }

  const fallback = generateFallbackScenarios(title, description);

  if (!HAS_API_KEY) {
    return res.json({
      scenarios: fallback,
      source: "fallback",
      note: "AI scenario generation unavailable; using local fallback scenarios."
    });
  }

  try {
    const systemMessage = `You generate concise, executive-style scenario labels. Return valid JSON only.`;

    const userMessage = `Generate 3 to 5 short business scenario titles for this role.

Role Title: ${title}
Role Description: ${description}

Requirements:
- each scenario must be short
- each scenario must be one line only
- no numbering
- no explanations
- no more than about 4 to 8 words if possible
- make them realistic and decision-relevant
- each scenario should read like a dashboard label, not a sentence

Return JSON only:
{ "scenarios": ["...", "...", "..."] }`;

    const data = await callClaudeJSON(systemMessage, userMessage, 350, 20000);

    const scenarios = Array.isArray(data.scenarios)
      ? data.scenarios
          .map(s => String(s).trim())
          .filter(Boolean)
          .slice(0, 5)
      : [];

    if (scenarios.length === 0) {
      return res.json({
        scenarios: fallback,
        source: "fallback",
        note: "AI returned no scenarios; using local fallback scenarios."
      });
    }

    return res.json({ scenarios, source: "ai" });

  } catch (error) {
    console.warn("Scenario generation fallback:", error?.message || error);
    return res.json({
      scenarios: fallback,
      source: "fallback",
      note: error?.message || "AI scenario generation failed; using local fallback scenarios."
    });
  }
});


// FIX #3: The non-streaming /api/decision endpoint had no timeout around runPipeline.
// If the pipeline stalled, it would hold the HTTP connection open indefinitely.
// Now we race the pipeline against PIPELINE_TIMEOUT_MS and return a clean error
// instead of leaving the client waiting forever.
app.post("/api/decision", async (req, res) => {
  console.log(`POST /api/decision — ${req.body?.candidates?.length ?? 0} candidates`);
  const input = req.body;
  if (!input.role?.title) return res.status(400).json({ error: "role.title required" });
  if (!input.scenario) return res.status(400).json({ error: "scenario required" });
  if (!input.decision_mode) return res.status(400).json({ error: "decision_mode required" });
  if (!Array.isArray(input.candidates) || input.candidates.length < 2) return res.status(400).json({ error: "2+ candidates required" });
  if (!HAS_API_KEY) return res.status(503).json({ error: "AI pipeline is unavailable because ANTHROPIC_API_KEY is not configured." });
  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Pipeline timed out after ${PIPELINE_TIMEOUT_MS / 1000}s. Try fewer candidates or a shorter description.`)), PIPELINE_TIMEOUT_MS)
    );
    const result = await Promise.race([runPipeline(input), timeoutPromise]);
    res.json(result);
  } catch(err) {
    console.error("Pipeline error:", err);
    res.status(500).json({ error: "Pipeline failed", message: err.message });
  }
});

// FIX #3 (streaming): Same pipeline timeout applied to the SSE endpoint.
// Previously runPipeline could run for 5-10 minutes silently while the frontend
// gave up at 3 minutes, leaving the user staring at a "loading" state with no error.
app.post("/api/decision/stream", async (req, res) => {
  console.log(`POST /api/decision/stream`);

  // Flush headers immediately — browser knows connection is open before any LLM calls start
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Disable Nagle so every write is sent as its own TCP packet immediately
  if (req.socket) req.socket.setNoDelay(true);

  // Heartbeat every 15s to keep the connection alive during long LLM calls
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(": keepalive\n\n");
  }, 15000);

  const send = (event, data) => {
    if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Validate before starting expensive pipeline
  const input = req.body;
  if (!input?.role?.title || !input?.scenario || !Array.isArray(input?.candidates) || input.candidates.length < 2) {
    send("error", { message: "Invalid request: role.title, scenario, and 2+ candidates required." });
    clearInterval(heartbeat);
    res.end();
    return;
  }

  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Pipeline timed out after ${PIPELINE_TIMEOUT_MS / 1000}s. Try fewer candidates or a shorter description.`)), PIPELINE_TIMEOUT_MS)
    );
    const result = await Promise.race([
      runPipeline(input, stages => send("stage_update", stages)),
      timeoutPromise,
    ]);
    send("complete", result);
  } catch(err) {
    console.error("Pipeline error:", err);
    send("error", { message: err.message });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 ScenarioRank AI v3 Backend`);
  console.log(`   Running on: http://localhost:${PORT}`);
  console.log(`   Health:     http://localhost:${PORT}/health`);
  console.log(`   API:        http://localhost:${PORT}/api/decision`);
  console.log(`   Stream:     http://localhost:${PORT}/api/decision/stream\n`);
  if (!ANTHROPIC_API_KEY) console.warn("⚠️  ANTHROPIC_API_KEY not set!");
});
