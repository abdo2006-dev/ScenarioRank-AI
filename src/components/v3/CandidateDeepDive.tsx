import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import type { CandidateEvaluation } from "@/types/pipeline";

interface Props {
  evaluations: CandidateEvaluation[];
}

const criteriaLabels: Record<string, string> = {
  domain_expertise: "Domain Expertise",
  transformation_leadership: "Transformation Leadership",
  operational_execution: "Operational Execution",
  stakeholder_management: "Stakeholder Management",
  crisis_management: "Crisis Management",
  innovation_digital: "Innovation & Digital",
  strategic_scalability: "Strategic Scalability",
};

const riskLabels: Record<string, string> = {
  execution_risk: "Execution",
  culture_risk: "Culture",
  time_risk: "Time-to-Impact",
  adaptability_risk: "Adaptability",
  confidence_risk: "Confidence",
  opportunity_cost_risk: "Opportunity Cost",
};

export default function CandidateDeepDive({ evaluations }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-5xl mx-auto px-6 py-10 space-y-6"
    >
      <div className="text-center mb-4">
        <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-2">Deep Dive</p>
        <h2 className="text-2xl font-display font-bold text-foreground">Candidate Analysis</h2>
      </div>

      <div className="space-y-3">
        {evaluations.map(ev => {
          const isOpen = expanded === ev.candidate_id;
          return (
            <div key={ev.candidate_id} className="glass-card overflow-hidden">
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-secondary/20 transition-colors"
                onClick={() => setExpanded(isOpen ? null : ev.candidate_id)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-primary">#{ev.rank}</span>
                  <h3 className="font-display font-semibold text-sm text-foreground">{ev.candidate_name}</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                    {ev.outcome_model.strategic_label}
                  </span>
                </div>
                {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>

              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: "auto" }}
                    exit={{ height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-5 space-y-6">
                      {/* Criteria scores */}
                      <div>
                        <p className="text-xs uppercase tracking-widest text-accent font-semibold mb-3">Criterion Scoring</p>
                        <div className="grid gap-2">
                          {Object.entries(ev.criteria_scores).map(([key, cs]) => (
                            <div key={key} className="bg-secondary/50 rounded-lg p-3">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-medium text-foreground">{criteriaLabels[key] || key}</span>
                                <div className="flex items-center gap-3">
                                  <span className="text-xs text-muted-foreground">Conf: {Math.round(cs.confidence * 100)}%</span>
                                  <span className="font-display font-bold text-sm text-primary">{cs.score}/10</span>
                                </div>
                              </div>
                              <p className="text-[11px] text-muted-foreground">{cs.reasoning}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Strengths / Weaknesses */}
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs uppercase tracking-widest text-emerald-400 font-semibold mb-2 flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" /> Strengths
                          </p>
                          {ev.strengths.map((s, i) => (
                            <p key={i} className="text-xs text-secondary-foreground mb-1">• {s}</p>
                          ))}
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-widest text-amber-400 font-semibold mb-2 flex items-center gap-1">
                            <TrendingDown className="w-3 h-3" /> Weaknesses
                          </p>
                          {ev.weaknesses.map((w, i) => (
                            <p key={i} className="text-xs text-secondary-foreground mb-1">• {w}</p>
                          ))}
                        </div>
                      </div>

                      {/* Risk profile */}
                      <div>
                        <p className="text-xs uppercase tracking-widest text-amber-400 font-semibold mb-3 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Risk Profile
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {Object.entries(ev.risk_profile).map(([key, val]) => (
                            <div key={key} className="bg-secondary/50 rounded-lg p-3 text-center">
                              <p className="text-[10px] text-muted-foreground uppercase">{riskLabels[key] || key}</p>
                              <p className={`font-display font-bold text-sm ${val > 0.3 ? "text-amber-400" : "text-emerald-400"}`}>
                                {Math.round(val * 100)}%
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Outcome model */}
                      <div className="bg-secondary/30 rounded-lg p-4">
                        <p className="text-xs uppercase tracking-widest text-accent font-semibold mb-2">Outcome Model</p>
                        <div className="grid grid-cols-3 gap-4 mb-3">
                          <div className="text-center">
                            <p className="text-[10px] text-muted-foreground">Execution Success</p>
                            <p className="font-display font-bold text-foreground">{Math.round(ev.outcome_model.expected_execution_success * 100)}%</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] text-muted-foreground">Scenario Fit</p>
                            <p className="font-display font-bold text-foreground">{Math.round(ev.outcome_model.scenario_fit * 100)}%</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] text-muted-foreground">Adaptability</p>
                            <p className="font-display font-bold text-foreground">{Math.round(ev.outcome_model.adaptability_score * 100)}%</p>
                          </div>
                        </div>
                        <p className="text-xs text-secondary-foreground">{ev.outcome_model.likely_outcome}</p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}
