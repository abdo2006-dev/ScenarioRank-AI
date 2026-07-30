/**
 * Shared, user-perceived input limits for ScenarioRank decision requests.
 *
 * These ceilings keep browser validation and the public HTTP contract in
 * lockstep. `AI_MAX_CANDIDATES` is intentionally not defined here: it is a
 * server-resolved per-run budget cap that may be lower than this technical
 * candidate ceiling.
 *
 * The text limits leave enough room for a substantive role or candidate
 * profile while bounding prompt size for the batch-oriented pipeline.
 */
export const DECISION_INPUT_LIMITS = Object.freeze({
  roleTitle: { min: 1, max: 120 },
  roleDescription: { min: 1, max: 4000 },
  scenario: { min: 1, max: 2000 },
  scenarios: { min: 1, max: 5 },
  candidateName: { min: 1, max: 120 },
  candidateDescription: { min: 1, max: 4000 },
  candidates: { min: 2, max: 10 },
});

export const DEFAULT_RUNTIME_MAX_CANDIDATES = 5;
