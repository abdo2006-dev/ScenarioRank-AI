/**
 * Deterministic scoring formulas — moved verbatim from server.mjs during
 * Phase 1A. Coefficients, clamping, rounding, and fallback behavior are
 * unchanged from the original implementation. See
 * docs/architecture/SCORING_AND_ASSUMPTIONS.md for the formula rationale.
 */

// ===== NORMALIZATION =====
export function normalizeWeights(adjusted) {
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

export function applyDeltas(base, deltas) {
  const adj = {};
  for (const k of Object.keys(base)) adj[k] = base[k] + (deltas[k] ?? 0);
  return normalizeWeights(adj);
}

// ===== SCORING =====
export function clamp(v, min = 0, max = 100) { return Math.max(min, Math.min(max, v)); }

export function computeWeightedFitScore(scores, weights) {
  let total = 0;
  for (const k of Object.keys(weights)) total += (scores[k] ?? 0) * (weights[k] ?? 0) / 10;
  return Math.round(total * 100) / 100;
}

export function computeOverallConfidence(confs, weights) {
  let ws = 0, tw = 0;
  for (const k of Object.keys(weights)) { ws += (confs[k] ?? 0) * (weights[k] ?? 0); tw += weights[k] ?? 0; }
  return tw === 0 ? 0 : Math.round(ws / tw * 100) / 100;
}

export function computeExecutionRisk(s) {
  return clamp(Math.round((100 - (0.45 * (s.operational_execution ?? 0) * 10 + 0.30 * (s.domain_expertise ?? 0) * 10 + 0.25 * (s.crisis_management ?? 0) * 10)) * 100) / 100);
}

export function computeCultureRisk(s, c) {
  return clamp(Math.round((100 - (0.60 * (s.stakeholder_management ?? 0) * 10 + 0.20 * (s.transformation_leadership ?? 0) * 10 + 0.20 * (c.stakeholder_management ?? 0) * 100)) * 100) / 100);
}

export function computeTimeRisk(s, wfs) {
  return clamp(Math.round((100 - (0.40 * (s.domain_expertise ?? 0) * 10 + 0.35 * (s.operational_execution ?? 0) * 10 + 0.25 * wfs)) * 100) / 100);
}

// Phase 1C correctness fix (docs/architecture/KNOWN_LIMITATIONS.md P0.2,
// docs/decisions/ADR-0003): this formula previously took a hardcoded
// `cross_scenario_consistency` input of 75 from its caller, contributing
// 0.35 of the score regardless of any real signal — meaning even a
// candidate scoring 0 on every real criterion still received a 26.25
// floor. That fabricated input has been removed, not replaced with
// another constant. The three genuinely model-derived criteria keep their
// relative weight to each other (0.25 : 0.20 : 0.20), renormalized to sum
// to 1.0 so the output stays on a comparable 0-100 scale using only real
// signals. This intentionally changes adaptability_score (and anything
// derived from it) — see the updated characterization tests in
// scoring.test.js and the regression coverage in
// server/pipeline/runPipeline.test.js.
export function computeAdaptabilityScore(s) {
  const raw =
    0.25 * (s.transformation_leadership ?? 0) * 10 +
    0.20 * (s.stakeholder_management ?? 0) * 10 +
    0.20 * (s.innovation_digital ?? 0) * 10;
  return clamp(Math.round((raw / 0.65) * 100) / 100);
}

export function computeExpectedOutcomeScore(p) {
  return Math.round((0.35 * p.wfs + 0.20 * p.adapt + 0.20 * (100 - p.exec) + 0.10 * (100 - p.cult) + 0.10 * (100 - p.time) + 0.05 * p.conf * 100) * 100) / 100;
}

export function computeRiskAdjustedScore(p) {
  // All terms normalized to a roughly 0-100 scale.
  return Math.round((p.wfs - 0.25 * p.exec - 0.20 * p.cult - 0.15 * p.time - 0.15 * (1 - p.conf) * 100 - 0.10 * (100 - p.adapt) - 0.15 * p.opp) * 100) / 100;
}

export function computePairScore(m) {
  return clamp(Math.round((0.30 * m.sc * 100 + 0.25 * m.comp * 100 + 0.20 * m.coh * 100 + 0.15 * m.pa * 100 - 0.10 * m.conf * 100 - 0.05 * m.over * 100) * 100) / 100);
}
