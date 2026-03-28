export const dataset = {
  role: {
    title: "Head of Supply Chain Transformation",
    description:
      "Responsible for leading supply chain strategy, ensuring operational continuity, driving digital transformation, and aligning cross-functional stakeholders across global operations.",
  },
  criteria: [
    { key: "domain_expertise", label: "Domain Expertise" },
    { key: "transformation_leadership", label: "Transformation Leadership" },
    { key: "operational_execution", label: "Operational Execution" },
    { key: "stakeholder_management", label: "Stakeholder Management" },
    { key: "crisis_management", label: "Crisis Management" },
    { key: "innovation_digital", label: "Innovation & Digital" },
    { key: "strategic_scalability", label: "Strategic Scalability" },
  ] as const,
  baseWeights: {
    domain_expertise: 18,
    transformation_leadership: 20,
    operational_execution: 16,
    stakeholder_management: 14,
    crisis_management: 12,
    innovation_digital: 10,
    strategic_scalability: 10,
  } as Record<string, number>,
  candidates: [
    {
      name: "Candidate A",
      archetype: "Industry Expert",
      scores: { domain_expertise: 9, transformation_leadership: 6, operational_execution: 8, stakeholder_management: 7, crisis_management: 9, innovation_digital: 5, strategic_scalability: 6 },
    },
    {
      name: "Candidate B",
      archetype: "Transformer",
      scores: { domain_expertise: 4, transformation_leadership: 10, operational_execution: 9, stakeholder_management: 7, crisis_management: 5, innovation_digital: 10, strategic_scalability: 9 },
    },
    {
      name: "Candidate C",
      archetype: "Insider",
      scores: { domain_expertise: 8, transformation_leadership: 7, operational_execution: 8, stakeholder_management: 9, crisis_management: 7, innovation_digital: 6, strategic_scalability: 7 },
    },
    {
      name: "Candidate D",
      archetype: "Turnaround Specialist",
      scores: { domain_expertise: 7, transformation_leadership: 6, operational_execution: 9, stakeholder_management: 6, crisis_management: 10, innovation_digital: 5, strategic_scalability: 7 },
    },
    {
      name: "Candidate E",
      archetype: "Cost Optimizer",
      scores: { domain_expertise: 7, transformation_leadership: 5, operational_execution: 9, stakeholder_management: 7, crisis_management: 6, innovation_digital: 6, strategic_scalability: 8 },
    },
    {
      name: "Candidate F",
      archetype: "Expansion Leader",
      scores: { domain_expertise: 6, transformation_leadership: 8, operational_execution: 7, stakeholder_management: 8, crisis_management: 6, innovation_digital: 8, strategic_scalability: 10 },
    },
    {
      name: "Candidate G",
      archetype: "Data Operator",
      scores: { domain_expertise: 6, transformation_leadership: 8, operational_execution: 8, stakeholder_management: 6, crisis_management: 6, innovation_digital: 9, strategic_scalability: 8 },
    },
    {
      name: "Candidate H",
      archetype: "People Integrator",
      scores: { domain_expertise: 7, transformation_leadership: 7, operational_execution: 7, stakeholder_management: 10, crisis_management: 7, innovation_digital: 7, strategic_scalability: 8 },
    },
  ],
  scenarioAdjustments: [
    {
      name: "Stable Growth",
      adjustments: { domain_expertise: 0, transformation_leadership: 5, operational_execution: 0, stakeholder_management: 3, crisis_management: -5, innovation_digital: 0, strategic_scalability: -3 },
    },
    {
      name: "Supply Chain Crisis",
      adjustments: { domain_expertise: 7, transformation_leadership: -10, operational_execution: 8, stakeholder_management: 0, crisis_management: 12, innovation_digital: -8, strategic_scalability: -9 },
    },
    {
      name: "Digital Transformation Push",
      adjustments: { domain_expertise: -5, transformation_leadership: 12, operational_execution: 0, stakeholder_management: -2, crisis_management: -5, innovation_digital: 10, strategic_scalability: -10 },
    },
    {
      name: "Cost Optimization",
      adjustments: { domain_expertise: 0, transformation_leadership: -5, operational_execution: 10, stakeholder_management: 0, crisis_management: 0, innovation_digital: -3, strategic_scalability: -2 },
    },
    {
      name: "Market Expansion",
      adjustments: { domain_expertise: -3, transformation_leadership: 3, operational_execution: -2, stakeholder_management: 3, crisis_management: -5, innovation_digital: 2, strategic_scalability: 12 },
    },
  ],
};

export type CriteriaKey = (typeof dataset.criteria)[number]["key"];

export interface RankedCandidate {
  name: string;
  archetype: string;
  scores: Record<string, number>;
  weightedScores: Record<string, number>;
  totalScore: number;
  rank: number;
}

export interface ScenarioResult {
  scenarioName: string;
  scenarioIndex: number;
  ranked: RankedCandidate[];
  weights: Record<string, number>;
}

export interface AdvancedMetrics {
  robustness: { name: string; archetype: string; avgScore: number }[];
  volatility: { name: string; archetype: string; volatility: number }[];
  biggestMover: { name: string; archetype: string; maxRankChange: number; bestScenario: string; worstScenario: string };
}

export function getScenarioWeights(scenarioIndex: number): Record<string, number> {
  const adj = dataset.scenarioAdjustments[scenarioIndex].adjustments;
  const raw: Record<string, number> = {};
  let total = 0;
  for (const c of dataset.criteria) {
    const v = Math.max(0, (dataset.baseWeights[c.key] || 0) + (adj[c.key as keyof typeof adj] || 0));
    raw[c.key] = v;
    total += v;
  }
  const normalized: Record<string, number> = {};
  for (const c of dataset.criteria) {
    normalized[c.key] = Math.round((raw[c.key] / total) * 100 * 100) / 100;
  }
  // Adjust rounding to hit exactly 100
  const sum = Object.values(normalized).reduce((a, b) => a + b, 0);
  const diff = 100 - sum;
  const firstKey = dataset.criteria[0].key;
  normalized[firstKey] = Math.round((normalized[firstKey] + diff) * 100) / 100;
  return normalized;
}

export function rankCandidates(scenarioIndex: number): RankedCandidate[] {
  const weights = getScenarioWeights(scenarioIndex);
  const results = dataset.candidates.map((c) => {
    const weightedScores: Record<string, number> = {};
    let totalScore = 0;
    for (const crit of dataset.criteria) {
      const w = weights[crit.key];
      const s = c.scores[crit.key as keyof typeof c.scores];
      const ws = (s * w) / 100;
      weightedScores[crit.key] = ws;
      totalScore += ws;
    }
    return { name: c.name, archetype: c.archetype, scores: c.scores as Record<string, number>, weightedScores, totalScore, rank: 0 };
  });
  results.sort((a, b) => b.totalScore - a.totalScore);
  results.forEach((r, i) => (r.rank = i + 1));
  return results;
}

export function getAllScenarioResults(): ScenarioResult[] {
  return dataset.scenarioAdjustments.map((s, i) => ({
    scenarioName: s.name,
    scenarioIndex: i,
    ranked: rankCandidates(i),
    weights: getScenarioWeights(i),
  }));
}

export function computeAdvancedMetrics(): AdvancedMetrics {
  const allResults = getAllScenarioResults();
  const candidateScores: Record<string, { scores: number[]; ranks: { rank: number; scenario: string }[] }> = {};

  for (const c of dataset.candidates) {
    candidateScores[c.name] = { scores: [], ranks: [] };
  }

  for (const sr of allResults) {
    for (const rc of sr.ranked) {
      candidateScores[rc.name].scores.push(rc.totalScore);
      candidateScores[rc.name].ranks.push({ rank: rc.rank, scenario: sr.scenarioName });
    }
  }

  const robustness = dataset.candidates.map((c) => {
    const avg = candidateScores[c.name].scores.reduce((a, b) => a + b, 0) / candidateScores[c.name].scores.length;
    return { name: c.name, archetype: c.archetype, avgScore: Math.round(avg * 100) / 100 };
  }).sort((a, b) => b.avgScore - a.avgScore);

  const volatility = dataset.candidates.map((c) => {
    const s = candidateScores[c.name].scores;
    const vol = Math.max(...s) - Math.min(...s);
    return { name: c.name, archetype: c.archetype, volatility: Math.round(vol * 100) / 100 };
  }).sort((a, b) => b.volatility - a.volatility);

  let biggestMover = { name: "", archetype: "", maxRankChange: 0, bestScenario: "", worstScenario: "" };
  for (const c of dataset.candidates) {
    const ranks = candidateScores[c.name].ranks;
    const best = ranks.reduce((a, b) => (a.rank < b.rank ? a : b));
    const worst = ranks.reduce((a, b) => (a.rank > b.rank ? a : b));
    const change = worst.rank - best.rank;
    if (change > biggestMover.maxRankChange) {
      biggestMover = { name: c.name, archetype: c.archetype, maxRankChange: change, bestScenario: best.scenario, worstScenario: worst.scenario };
    }
  }

  return { robustness, volatility, biggestMover };
}

export function generateTradeOffs(ranked: RankedCandidate[], scenarioIndex: number): { gains: string[]; sacrifices: string[] } {
  const weights = getScenarioWeights(scenarioIndex);
  const winner = ranked[0];
  const sortedCriteria = [...dataset.criteria].sort((a, b) => weights[b.key] - weights[a.key]);

  const gains: string[] = [];
  const sacrifices: string[] = [];

  // Top 3 criteria strengths
  for (let i = 0; i < 3 && i < sortedCriteria.length; i++) {
    const cr = sortedCriteria[i];
    if (winner.scores[cr.key] >= 8) {
      gains.push(`Strong ${cr.label} (${winner.scores[cr.key]}/10) aligned with high scenario weight (${weights[cr.key].toFixed(1)}%)`);
    }
  }
  if (gains.length === 0) gains.push(`Balanced performance across top-weighted criteria`);

  // Weaknesses vs runner-up
  const runnerUp = ranked[1];
  for (const cr of dataset.criteria) {
    if (runnerUp && runnerUp.scores[cr.key] > winner.scores[cr.key] + 1) {
      sacrifices.push(`${cr.label}: ${winner.name} scores ${winner.scores[cr.key]} vs ${runnerUp.name}'s ${runnerUp.scores[cr.key]}`);
    }
  }
  if (sacrifices.length === 0) sacrifices.push(`Minimal trade-offs — ${winner.name} is well-rounded in this scenario`);

  return { gains, sacrifices };
}

export function generateExplanation(ranked: RankedCandidate[], scenarioIndex: number): string[] {
  const weights = getScenarioWeights(scenarioIndex);
  const scenarioName = dataset.scenarioAdjustments[scenarioIndex].name;
  const winner = ranked[0];
  const sortedCriteria = [...dataset.criteria].sort((a, b) => weights[b.key] - weights[a.key]);
  const topCrit = sortedCriteria[0];
  const secondCrit = sortedCriteria[1];

  const lines: string[] = [];
  lines.push(`Under "${scenarioName}", ${winner.name} (${winner.archetype}) ranks #1 with ${winner.totalScore.toFixed(2)} points.`);
  lines.push(`This scenario heavily weights ${topCrit.label} (${weights[topCrit.key].toFixed(1)}%) and ${secondCrit.label} (${weights[secondCrit.key].toFixed(1)}%).`);

  for (let i = 1; i < Math.min(ranked.length, 4); i++) {
    const c = ranked[i];
    const diff = (winner.totalScore - c.totalScore).toFixed(2);
    const weakCrit = sortedCriteria.find((cr) => c.scores[cr.key] < winner.scores[cr.key]);
    lines.push(`${c.name} (${c.archetype}) scored ${c.totalScore.toFixed(2)}, trailing by ${diff}.${weakCrit ? ` Gap in ${weakCrit.label} (${c.scores[weakCrit.key]} vs ${winner.scores[weakCrit.key]}).` : ""}`);
  }

  lines.push(`Switching scenarios shifts weights and may reorder the ranking — context drives the best hiring decision.`);
  return lines;
}

export function generateExecutiveSummary(ranked: RankedCandidate[], scenarioIndex: number, metrics: AdvancedMetrics): {
  recommendation: string;
  keyReason: string;
  tradeOff: string;
  alternative: string;
} {
  const scenarioName = dataset.scenarioAdjustments[scenarioIndex].name;
  const winner = ranked[0];
  const runnerUp = ranked[1];
  const weights = getScenarioWeights(scenarioIndex);
  const sortedCriteria = [...dataset.criteria].sort((a, b) => weights[b.key] - weights[a.key]);
  const topCrit = sortedCriteria[0];

  return {
    recommendation: `${winner.name} (${winner.archetype}) is the recommended hire under the "${scenarioName}" scenario with a score of ${winner.totalScore.toFixed(2)}.`,
    keyReason: `Excels in ${topCrit.label}, the most weighted criterion at ${weights[topCrit.key].toFixed(1)}%, scoring ${winner.scores[topCrit.key]}/10.`,
    tradeOff: runnerUp
      ? `Choosing ${winner.name} over ${runnerUp.name} (${runnerUp.archetype}) means prioritizing ${topCrit.label} over ${sortedCriteria.find(cr => runnerUp.scores[cr.key] > winner.scores[cr.key])?.label || "balanced profile"}.`
      : "No significant trade-offs identified.",
    alternative: `If robustness across scenarios matters, consider ${metrics.robustness[0].name} (${metrics.robustness[0].archetype}) with avg score ${metrics.robustness[0].avgScore.toFixed(2)}.`,
  };
}
