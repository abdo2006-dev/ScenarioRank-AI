import type { PipelineResponse, CandidateInput, PipelineStage } from "@/types/pipeline";

export const DEFAULT_ROLE = {
  title: "Head of Supply Chain Transformation",
  description: "Responsible for leading supply chain strategy, ensuring operational continuity, driving digital transformation, and aligning cross-functional stakeholders across global operations.",
};

export const SCENARIOS = [
  "Stable Growth",
  "Supply Chain Crisis",
  "Digital Transformation Push",
  "Cost Optimization Pressure",
  "New Market Expansion",
];

export const DECISION_MODES = [
  { value: "best_fit" as const, label: "Best Fit" },
  { value: "lowest_risk" as const, label: "Lowest Risk" },
  { value: "best_outcome" as const, label: "Best Expected Outcome" },
];

export const SAMPLE_CANDIDATES: CandidateInput[] = [
  { id: "a", name: "Candidate A", description: "12+ years in automotive supply chain and supplier operations. Deep experience in continuity, recovery programs, and crisis-response execution. Strong in stable execution under pressure, but less differentiated in digital transformation.", source: "Executive Search" },
  { id: "b", name: "Candidate B", description: "Former operations and transformation leader with extensive experience in automation, systems modernization, and digital operating models. Strong in large-scale transformation and innovation, but weaker in traditional domain continuity.", source: "Internal Referral" },
  { id: "c", name: "Candidate C", description: "Long-standing internal leader with strong credibility across the organization. Excellent at stakeholder alignment, reliable execution, and navigating internal systems. More balanced than extreme.", source: "Internal Promotion" },
  { id: "h", name: "Candidate H", description: "Leadership profile centered on trust, change adoption, team alignment, and collaboration. Strong in stakeholder-heavy environments and in making change executable through people.", source: "Executive Search" },
];

export const ALL_SAMPLE_CANDIDATES: CandidateInput[] = [
  ...SAMPLE_CANDIDATES.slice(0, 3),
  { id: "d", name: "Candidate D", description: "Known for stepping into difficult business situations and restoring performance quickly. Strong in execution and crisis handling, but less oriented toward long-horizon transformation.", source: "Board Referral" },
  { id: "e", name: "Candidate E", description: "Specialist in lean operations, efficiency improvement, and disciplined cost management. Excellent at reducing waste and improving output quality, but not the strongest innovation leader.", source: "Industry Network" },
  { id: "f", name: "Candidate F", description: "Led multi-region expansion programs and scaled operational systems across markets. Strong strategic scalability and coordination across diverse environments.", source: "Executive Search" },
  { id: "g", name: "Candidate G", description: "Highly analytical operations leader with strong performance management and systems thinking. Excellent at using data to improve processes, monitor execution, and support modernization.", source: "Internal Referral" },
  SAMPLE_CANDIDATES[3],
];

export const INITIAL_PIPELINE_STAGES: PipelineStage[] = [
  { id: "input", label: "Input Received", status: "pending" },
  { id: "role", label: "Role Analysis", status: "pending" },
  { id: "scenario", label: "Scenario Analysis", status: "pending" },
  { id: "scoring", label: "Candidate Scoring", status: "pending" },
  { id: "bias", label: "Bias & Confidence Review", status: "pending" },
  { id: "outcome", label: "Outcome Modeling", status: "pending" },
  { id: "decision", label: "Decision Generation", status: "pending" },
  { id: "pairing", label: "Pairing Simulation", status: "pending" },
  { id: "complete", label: "Completed", status: "pending" },
];

export function generateMockResponse(
  scenario: string,
  decisionMode: string,
  candidates: CandidateInput[],
  enablePairing: boolean
): PipelineResponse {
  const candidateEvals = candidates.map((c, i) => {
    const baseScore = 7.5 - i * 0.4 + Math.random() * 0.5;
    return {
      candidate_id: c.id,
      candidate_name: c.name,
      rank: i + 1,
      weighted_fit_score: Math.round((baseScore + (i === 0 ? 0.8 : 0)) * 100) / 100,
      risk_adjusted_score: Math.round((baseScore - 0.3 + (i === 0 ? 0.5 : 0)) * 100) / 100,
      expected_outcome_score: Math.round((baseScore + 0.2 + (i === 0 ? 0.6 : 0)) * 100) / 100,
      overall_confidence: Math.round((0.82 - i * 0.04) * 100) / 100,
      strategic_labels: i === 0 ? ["Best Fit", "High-Upside Specialist"] : i === 1 ? ["Balanced Safe Choice"] : ["Niche Specialist"],
      winner_reason: i === 0 ? `Strongest alignment with ${scenario} priorities due to superior execution profile and adaptability.` : undefined,
      trade_off_note: i > 0 ? `Stronger in niche areas but lower overall scenario fit compared to ${candidates[0].name}.` : undefined,
      criteria_scores: {
        domain_expertise: { score: 8 - i, confidence: 0.9, evidence: "Verified through reference checks and track record analysis.", reasoning: `${c.name} demonstrates ${8 - i > 7 ? 'strong' : 'adequate'} domain expertise.` },
        transformation_leadership: { score: 7 + (i === 1 ? 2 : 0), confidence: 0.85, evidence: "Based on transformation program outcomes.", reasoning: "Track record in leading org-wide change initiatives." },
        operational_execution: { score: 8, confidence: 0.88, evidence: "Measured via operational KPI improvements.", reasoning: "Consistent delivery on operational milestones." },
        stakeholder_management: { score: 7 + (i === 2 ? 2 : 0), confidence: 0.82, evidence: "360° feedback and cross-functional reviews.", reasoning: "Effective at navigating complex stakeholder landscapes." },
        crisis_management: { score: 7 + (i === 0 ? 2 : -1), confidence: 0.78, evidence: "Crisis response case studies.", reasoning: `${i === 0 ? 'Proven crisis leadership' : 'Limited crisis exposure'}.` },
        innovation_digital: { score: 6 + (i === 1 ? 3 : 0), confidence: 0.8, evidence: "Digital initiative portfolio.", reasoning: "Innovation adoption and digital fluency." },
        strategic_scalability: { score: 7, confidence: 0.83, evidence: "Scale-up track record.", reasoning: "Ability to operate at different organizational scales." },
      },
      strengths: [
        `Strong alignment with ${scenario} scenario requirements`,
        i === 0 ? "Proven track record in high-pressure environments" : "Balanced cross-functional capabilities",
        "Effective communicator with senior stakeholders",
      ],
      weaknesses: [
        i === 0 ? "Limited international expansion experience" : "Less differentiated in crisis scenarios",
        "Could benefit from stronger digital credentials",
      ],
      risk_profile: {
        execution_risk: Math.round((0.2 + i * 0.05) * 100) / 100,
        culture_risk: Math.round((0.15 + i * 0.03) * 100) / 100,
        time_risk: Math.round((0.25 + i * 0.04) * 100) / 100,
        adaptability_risk: Math.round((0.18 + i * 0.06) * 100) / 100,
        confidence_risk: Math.round((0.12 + i * 0.05) * 100) / 100,
        opportunity_cost_risk: Math.round((0.2 + i * 0.04) * 100) / 100,
      },
      outcome_model: {
        expected_execution_success: Math.round((0.82 - i * 0.06) * 100) / 100,
        scenario_fit: Math.round((0.88 - i * 0.08) * 100) / 100,
        adaptability_score: Math.round((0.75 - i * 0.05) * 100) / 100,
        likely_outcome: i === 0 ? "Strong execution with high scenario alignment" : "Adequate performance with moderate risk",
        strategic_label: i === 0 ? "High-Upside Specialist" : i === 1 ? "Balanced Safe Choice" : "Niche Contributor",
      },
    };
  });

  const biasReviews = candidates.map((c, i) => ({
    candidate_id: c.id,
    candidate_name: c.name,
    overall_confidence: 0.82 - i * 0.04,
    low_confidence_criteria: i > 1 ? ["crisis_management", "innovation_digital"] : [],
    bias_flags: i === 0 ? [{ type: "Recency Bias", severity: "low" as const, description: "Recent success may overweight short-term performance.", candidate_id: c.id }] :
      i === 2 ? [{ type: "Familiarity Bias", severity: "medium" as const, description: "Internal candidate may benefit from organizational familiarity.", candidate_id: c.id }] : [],
    weak_evidence_flags: i > 2 ? ["Limited external validation for crisis management claims"] : [],
    recommend_human_review: i > 1,
    recommend_rescore: false,
  }));

  const tradeOffs = [
    { title: `Choosing ${candidates[0]?.name || "the winner"}`, description: `Strong ${scenario} alignment with proven execution capabilities. Expected to deliver measurable results within 6-12 months.`, type: "gain" as const },
    { title: `Not choosing ${candidates[1]?.name || "the runner-up"}`, description: `Sacrificing stronger transformation credentials and innovation potential in exchange for execution reliability.`, type: "sacrifice" as const },
    { title: "Opportunity Cost", description: "If business context shifts toward digital transformation, the recommended candidate may need additional support or a complementary hire.", type: "opportunity_cost" as const, severity: "medium" as const },
    { title: "Primary Decision Risk", description: "Moderate risk that scenario assumptions change within 12 months, which could reduce the candidate's relative advantage.", type: "risk" as const, severity: "low" as const },
    { title: "Adaptability Warning", description: "If conditions shift post-hire, consider pairing the selected leader with a complementary profile to cover emerging gaps.", type: "adaptability" as const, severity: "medium" as const },
  ];

  const adaptabilityProfiles = candidates.slice(0, 4).map((c, i) => ({
    candidate_name: c.name,
    adaptability_score: Math.round((0.78 - i * 0.06) * 100) / 100,
    best_scenario: i === 0 ? scenario : SCENARIOS[(i + 1) % SCENARIOS.length],
    worst_scenario: SCENARIOS[(i + 3) % SCENARIOS.length],
    resilience_note: i === 0 ? "Strong adaptability across most scenarios with consistent performance." : `More specialized — excels in ${SCENARIOS[(i + 1) % SCENARIOS.length]} but drops in volatile conditions.`,
  }));

  const pairingResult = enablePairing && candidates.length >= 2 ? {
    best_pair: {
      pair: [candidates[0].name, candidates[1].name] as [string, string],
      pair_score: 8.7,
      scenario_coverage: 0.92,
      complementarity: 0.88,
      overlap_risk: 0.15,
      conflict_risk: 0.12,
      execution_cohesion: 0.85,
      pair_adaptability: 0.82,
      explanation: `${candidates[0].name} and ${candidates[1].name} form a highly complementary pair. ${candidates[0].name} provides execution strength while ${candidates[1].name} brings transformation vision, covering the full spectrum of ${scenario} requirements.`,
    },
    top_pairs: candidates.length >= 3 ? [
      {
        pair: [candidates[0].name, candidates[1].name] as [string, string],
        pair_score: 8.7,
        scenario_coverage: 0.92,
        complementarity: 0.88,
        overlap_risk: 0.15,
        conflict_risk: 0.12,
        execution_cohesion: 0.85,
        pair_adaptability: 0.82,
        explanation: "Best complementary coverage.",
      },
      {
        pair: [candidates[0].name, candidates[2].name] as [string, string],
        pair_score: 8.1,
        scenario_coverage: 0.85,
        complementarity: 0.72,
        overlap_risk: 0.25,
        conflict_risk: 0.08,
        execution_cohesion: 0.88,
        pair_adaptability: 0.75,
        explanation: "Strong cohesion but higher overlap.",
      },
    ] : [],
  } : undefined;

  const agentOutputs = [
    { agent_name: "Role Agent", agent_role: "Analyzes role requirements and defines evaluation criteria", inputs: ["Role title", "Role description"], outputs: ["7 evaluation criteria", "Base weight distribution", "Complexity assessment"], summary: `Identified 7 key criteria for ${DEFAULT_ROLE.title}. Role complexity rated as high due to cross-functional scope and transformation mandate.` },
    { agent_name: "Scenario Agent", agent_role: "Adjusts weights based on business scenario", inputs: ["Base weights", `Scenario: ${scenario}`], outputs: ["Adjusted weights", "Key pressures", "Weight rationale"], summary: `Applied ${scenario} adjustments. Key pressures identified: ${scenario === "Supply Chain Crisis" ? "operational continuity, crisis response, supplier management" : "transformation pace, innovation, stakeholder alignment"}.` },
    { agent_name: "Candidate Scoring Agent", agent_role: "Evaluates each candidate against criteria with evidence", inputs: [`${candidates.length} candidate profiles`, "7 criteria"], outputs: ["Score matrices", "Confidence levels", "Evidence mapping"], summary: `Scored ${candidates.length} candidates across 7 criteria. Average confidence: 0.83. Highest-scoring candidate: ${candidates[0]?.name || "N/A"}.` },
    { agent_name: "Bias & Confidence Agent", agent_role: "Reviews scoring for bias and confidence gaps", inputs: ["All candidate scores", "Evidence quality"], outputs: ["Bias flags", "Confidence warnings", "Review recommendations"], summary: `Found ${biasReviews.filter(b => b.bias_flags.length > 0).length} candidates with bias flags. ${biasReviews.filter(b => b.recommend_human_review).length} candidates flagged for human review.` },
    { agent_name: "Outcome Modeling Agent", agent_role: "Projects expected outcomes and adaptability", inputs: ["Weighted scores", "Risk profiles"], outputs: ["Outcome projections", "Adaptability scores", "Strategic labels"], summary: `Modeled expected outcomes for all candidates. Top candidate shows ${candidateEvals[0]?.outcome_model.expected_execution_success ? Math.round(candidateEvals[0].outcome_model.expected_execution_success * 100) : 82}% expected execution success.` },
    { agent_name: "Decision Agent", agent_role: "Generates final recommendation with reasoning", inputs: ["All evaluations", "Decision mode", "Trade-offs"], outputs: ["Final recommendation", "Ranking", "Executive interpretation"], summary: `Recommended ${candidates[0]?.name || "top candidate"} under ${decisionMode} mode for ${scenario}. Confidence: ${candidateEvals[0]?.overall_confidence || 0.82}.` },
  ];

  if (enablePairing) {
    agentOutputs.push({
      agent_name: "Pairing Agent",
      agent_role: "Simulates optimal leadership pair combinations",
      inputs: ["Top candidates", "Complementarity matrix"],
      outputs: ["Best pair", "Coverage analysis", "Conflict assessment"],
      summary: `Best pair: ${candidates[0]?.name} + ${candidates[1]?.name} with score 8.7. Complementarity: 88%, Overlap risk: 15%.`,
    });
  }

  return {
    pipeline_steps: INITIAL_PIPELINE_STAGES.map(s => ({
      ...s,
      status: "completed" as const,
      summary: `${s.label} completed successfully.`,
      duration_ms: Math.round(800 + Math.random() * 2000),
    })).filter(s => enablePairing || s.id !== "pairing"),
    role_analysis: {
      title: DEFAULT_ROLE.title,
      key_requirements: ["Supply chain domain expertise", "Digital transformation capability", "Crisis management readiness", "Cross-functional stakeholder alignment", "Strategic scalability"],
      complexity: "High",
    },
    scenario_analysis: {
      scenario,
      key_pressures: scenario === "Supply Chain Crisis" ? ["Operational continuity", "Rapid crisis response", "Supplier risk management"] : ["Transformation velocity", "Innovation adoption", "Change management"],
      weight_rationale: `Under ${scenario}, weights are adjusted to emphasize ${scenario === "Supply Chain Crisis" ? "crisis management and operational execution" : "transformation leadership and innovation"}.`,
    },
    candidate_evaluations: candidateEvals,
    bias_confidence_reviews: biasReviews,
    outcome_models: candidateEvals.map(e => e.outcome_model),
    decision_result: {
      recommended_candidate_id: candidates[0]?.id || "a",
      recommended_candidate_name: candidates[0]?.name || "Candidate A",
      decision_mode: decisionMode,
      scenario,
      final_label: decisionMode === "best_fit" ? "Best Fit" : decisionMode === "lowest_risk" ? "Lowest Risk" : "Best Expected Outcome",
      key_reason: `Strongest overall alignment with ${scenario} requirements, combining execution reliability with strategic depth.`,
      overall_confidence: 0.82,
      executive_interpretation: `${candidates[0]?.name || "The recommended candidate"} is projected to deliver strong results under ${scenario} conditions. This recommendation accounts for weighted criteria scores, risk factors, and expected organizational outcomes. The decision carries moderate confidence with manageable trade-offs.`,
    },
    pairing_result: pairingResult,
    trade_offs: tradeOffs,
    adaptability_profiles: adaptabilityProfiles,
    agent_outputs: agentOutputs,
    executive_summary: {
      recommendation: `${candidates[0]?.name || "Candidate A"} is recommended as ${DEFAULT_ROLE.title} under the ${scenario} scenario.`,
      reason: `Top-ranked across weighted fit (${candidateEvals[0]?.weighted_fit_score}), risk-adjusted performance (${candidateEvals[0]?.risk_adjusted_score}), and expected outcomes (${candidateEvals[0]?.expected_outcome_score}).`,
      trade_off: `Choosing ${candidates[0]?.name} over ${candidates[1]?.name || "the runner-up"} prioritizes execution reliability over transformation breadth.`,
      opportunity_cost: "If business priorities shift toward rapid digital transformation, consider supplementing with a transformation-oriented deputy.",
      adaptability: `${candidates[0]?.name} shows strong adaptability (${adaptabilityProfiles[0]?.adaptability_score}) but may underperform if conditions shift to ${adaptabilityProfiles[0]?.worst_scenario}.`,
      alternative: candidates.length > 1 ? `If scenario shifts, ${candidates[1]?.name} is the strongest alternative with complementary strengths.` : "No alternative available with current candidate pool.",
    },
  };
}
