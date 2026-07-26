/**
 * The seven fixed evaluation criteria used across role, scenario, and
 * candidate-scoring schemas. Shared so the three schemas that key an
 * object by criterion cannot drift out of sync with each other.
 */
export const CRITERIA_KEYS = Object.freeze([
  "domain_expertise",
  "transformation_leadership",
  "operational_execution",
  "stakeholder_management",
  "crisis_management",
  "innovation_digital",
  "strategic_scalability",
]);
