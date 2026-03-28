/**
 * ScenarioRank AI v3 — Self-Contained Frontend
 * 
 * This file is intentionally self-contained (no missing imports).
 * Place this at: src/Index.tsx  OR  src/pages/Index.tsx
 * 
 * Requires: server.mjs running on port 3001 for Live Mode
 */

import { useState, useRef, useCallback, useEffect } from "react";

// ─── TYPES ──────────────────────────────────────────────────────────────────

interface CandidateInput { id: string; name: string; description: string; }
interface PipelineStage { id: string; label: string; status: "pending" | "running" | "completed" | "failed"; summary?: string; duration_ms?: number; }
interface CriterionScore { score: number; confidence: number; evidence: string; reasoning: string; }
interface RiskProfile { execution_risk: number; culture_risk: number; time_risk: number; adaptability_risk: number; confidence_risk: number; opportunity_cost_risk: number; }
interface OutcomeModel { expected_execution_success: number; scenario_fit: number; adaptability_score: number; likely_outcome: string; strategic_label: string; expected_outcome_score?: number; }
interface CandidateEvaluation { candidate_id: string; candidate_name: string; rank: number; weighted_fit_score: number; risk_adjusted_score: number; expected_outcome_score: number; overall_confidence: number; strategic_labels: string[]; winner_reason?: string; trade_off_note?: string; criteria_scores: Record<string, CriterionScore>; strengths: string[]; weaknesses: string[]; risk_profile: RiskProfile; outcome_model: OutcomeModel; }
interface DecisionResult { recommended_candidate_id: string; recommended_candidate_name: string; decision_mode: string; scenario: string; final_label: string; key_reason: string; overall_confidence: number; executive_interpretation: string; }
interface TradeOffCard { title: string; description: string; type: string; severity?: string; }
interface AdaptabilityProfile { candidate_name: string; adaptability_score: number; best_scenario: string; worst_scenario: string; resilience_note: string; }
interface AgentOutput { agent_name: string; agent_role: string; inputs: string[]; outputs: string[]; summary: string; }
interface BiasReview { candidate_id: string; candidate_name: string; overall_confidence: number; bias_flags: Array<{ type: string; severity: string; description: string; }>; recommend_human_review: boolean; }
interface PairResult { pair: [string, string]; pair_score: number; explanation: string; scenario_coverage?: number; complementarity?: number; overlap_risk?: number; conflict_risk?: number; execution_cohesion?: number; pair_adaptability?: number; }
interface PipelineResponse { pipeline_steps: PipelineStage[]; role_analysis: { title: string; key_requirements: string[]; complexity: string; }; scenario_analysis: { scenario: string; key_pressures: string[]; weight_rationale: string; }; candidate_evaluations: CandidateEvaluation[]; bias_confidence_reviews: BiasReview[]; decision_result: DecisionResult; pairing_result?: { best_pair: PairResult; top_pairs: PairResult[]; }; trade_offs: TradeOffCard[]; adaptability_profiles: AdaptabilityProfile[]; agent_outputs: AgentOutput[]; executive_summary: { recommendation: string; reason: string; trade_off: string; opportunity_cost: string; adaptability: string; alternative: string; }; }

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const BACKEND_URL = "http://localhost:3001";

const SCENARIOS = [
  "Post-merger integration with cultural clash risk",
  "Rapid scaling in a new geographic market",
  "Digital transformation in a legacy enterprise",
  "Crisis turnaround with limited runway",
  "Greenfield product launch in competitive market",
];

const DECISION_MODES = [
  { value: "best_fit", label: "Best Fit" },
  { value: "lowest_risk", label: "Lowest Risk" },
  { value: "best_expected_outcome", label: "Best Expected Outcome" },
];

const DEFAULT_CANDIDATES: CandidateInput[] = [
  { id: "c1", name: "Alexandra Chen", description: "15 years in enterprise SaaS, led 3 post-merger integrations at Fortune 500 companies. Known for data-driven decision making and cross-functional alignment. MBA from Wharton." },
  { id: "c2", name: "Marcus Rodriguez", description: "Operator turned strategist. Scaled two companies from seed to Series C. Deep ops background, high execution velocity. Sometimes clashes with legacy culture." },
  { id: "c3", name: "Priya Nair", description: "Chief of Staff turned GM. Exceptional at navigating ambiguity and building coalition. Lower on pure execution speed but high on stakeholder trust and long-term thinking." },
];

const INITIAL_STAGES: PipelineStage[] = [
  { id: "role", label: "Role Analysis", status: "pending" },
  { id: "scenario", label: "Scenario Analysis", status: "pending" },
  { id: "scoring", label: "Candidate Scoring", status: "pending" },
  { id: "bias", label: "Bias & Confidence Review", status: "pending" },
  { id: "outcome", label: "Outcome Modeling", status: "pending" },
  { id: "decision", label: "Decision Engine", status: "pending" },
  { id: "pairing", label: "Pair Simulation", status: "pending" },
];

// ─── SERVICE ──────────────────────────────────────────────────────────────────

type ServiceMode = "mock" | "live";
let _mode: ServiceMode = "mock";
export const getServiceMode = () => _mode;
export const setServiceMode = (m: ServiceMode) => { _mode = m; };

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function buildMockResponse(candidates: CandidateInput[], enablePairing = false, decisionMode = "best_fit", scenario = SCENARIOS[0]): PipelineResponse {
  // Per-candidate base scores — these reflect each person's actual profile strengths
  const BASE_SCORES: Record<string, { wfs: number; risk: number; outcome: number; conf: number; exec_risk: number; cult_risk: number; time_risk: number; adapt: number; }> = {
    "c1": { wfs: 7.8, risk: 7.6, outcome: 7.5, conf: 0.82, exec_risk: 20, cult_risk: 15, time_risk: 18, adapt: 78 }, // Alexandra — high fit, low risk
    "c2": { wfs: 7.0, risk: 6.2, outcome: 7.8, conf: 0.76, exec_risk: 36, cult_risk: 45, time_risk: 28, adapt: 68 }, // Marcus — high outcome, high risk
    "c3": { wfs: 6.6, risk: 7.0, outcome: 6.6, conf: 0.70, exec_risk: 28, cult_risk: 25, time_risk: 23, adapt: 72 }, // Priya — balanced, steady
  };

  // Scenario modifiers — different scenarios favour different profiles
  type ScoreBoost = { wfs?: number; risk?: number; outcome?: number; conf?: number; exec_risk?: number; cult_risk?: number; time_risk?: number; adapt?: number; };
  const SCENARIO_BOOST: Record<string, Record<string, ScoreBoost>> = {
    "Post-merger integration with cultural clash risk":   { c1: { wfs: 0.4, outcome: 0.2 }, c2: { cult_risk: 10 }, c3: { wfs: 0.1 } },
    "Rapid scaling in a new geographic market":          { c2: { wfs: 0.6, outcome: 0.5 }, c1: { wfs: -0.2 }, c3: {} },
    "Digital transformation in a legacy enterprise":     { c1: { wfs: 0.2 }, c2: { wfs: 0.3, outcome: 0.3 }, c3: { wfs: 0.1 } },
    "Crisis turnaround with limited runway":             { c2: { wfs: 0.5, outcome: 0.6 }, c1: { wfs: -0.1 }, c3: { wfs: -0.2 } },
    "Greenfield product launch in competitive market":   { c2: { wfs: 0.7, outcome: 0.8 }, c1: { wfs: -0.3 }, c3: { wfs: 0.1 } },
  };

  const boosts = SCENARIO_BOOST[scenario] ?? {};

  const rawEvals = candidates.map((c, i) => {
    const base = BASE_SCORES[c.id] ?? { wfs: 7.0 - i*0.4, risk: 6.8 - i*0.4, outcome: 7.0 - i*0.4, conf: 0.78 - i*0.05, exec_risk: 24 + i*8, cult_risk: 20 + i*8, time_risk: 20 + i*5, adapt: 74 - i*4 };
    const b = boosts[c.id] ?? {};
    const wfs       = parseFloat(((base.wfs       + (b.wfs       ?? 0))).toFixed(2));
    const risk      = parseFloat(((base.risk      + (b.risk      ?? 0))).toFixed(2));
    const outcome   = parseFloat(((base.outcome   + (b.outcome   ?? 0))).toFixed(2));
    const conf      = parseFloat(((base.conf      + (b.conf      ?? 0))).toFixed(2));
    const exec_risk = base.exec_risk + (b.exec_risk ?? 0);
    const cult_risk = base.cult_risk + (b.cult_risk ?? 0);
    return { c, i, wfs, risk, outcome, conf, exec_risk, cult_risk, time_risk: base.time_risk, adapt: base.adapt };
  });

  // Sort by the chosen decision mode to determine rank
  // Use explicit sort functions instead of dynamic key indexing (avoids TS2536)
  const getSortValue = (e: typeof rawEvals[0]) =>
    decisionMode === "best_fit" ? e.wfs :
    decisionMode === "lowest_risk" ? e.risk :
    e.outcome;
  const sortLabel = decisionMode === "best_fit" ? "weighted fit" :
    decisionMode === "lowest_risk" ? "risk-adjusted" : "expected outcome";

  const sorted = [...rawEvals].sort((a, b) => getSortValue(b) - getSortValue(a));
  const rankMap = new Map(sorted.map((e, rank) => [e.c.id, rank]));
  const winner = sorted[0];

  const evals: CandidateEvaluation[] = rawEvals.map(({ c, wfs, risk, outcome, conf, exec_risk, cult_risk, time_risk, adapt }) => {
    const rank = rankMap.get(c.id)! + 1;
    const isWinner = rank === 1;
    return {
      candidate_id: c.id, candidate_name: c.name, rank,
      weighted_fit_score: wfs,
      risk_adjusted_score: risk,
      expected_outcome_score: outcome,
      overall_confidence: conf,
      strategic_labels: c.id === "c1" ? ["Proven Integrator", "Low Risk"] : c.id === "c2" ? ["High Velocity", "High Upside"] : ["Coalition Builder", "Steady Ramp"],
      winner_reason: isWinner ? `Strongest ${sortLabel} score for this scenario and decision mode.` : undefined,
      trade_off_note: rank === 2 ? (c.id === "c2" ? "High upside but elevated execution and cultural risk." : "Strong stability but lower ceiling under this scenario.") : undefined,
      criteria_scores: {
        domain_expertise:            { score: c.id === "c1" ? 8.5 : c.id === "c2" ? 7.0 : 6.5, confidence: 0.85, evidence: "From candidate profile", reasoning: "Assessed from background" },
        transformation_leadership:   { score: c.id === "c1" ? 7.5 : c.id === "c2" ? 7.8 : 7.2, confidence: 0.78, evidence: "From candidate profile", reasoning: "Assessed from background" },
        operational_execution:       { score: c.id === "c1" ? 7.8 : c.id === "c2" ? 9.0 : 6.5, confidence: 0.80, evidence: "From candidate profile", reasoning: "Assessed from background" },
        stakeholder_management:      { score: c.id === "c1" ? 8.0 : c.id === "c2" ? 6.0 : 8.5, confidence: 0.75, evidence: "From candidate profile", reasoning: "Assessed from background" },
        crisis_management:           { score: c.id === "c1" ? 7.0 : c.id === "c2" ? 8.5 : 7.0, confidence: 0.70, evidence: "From candidate profile", reasoning: "Assessed from background" },
        innovation_digital:          { score: c.id === "c1" ? 7.2 : c.id === "c2" ? 8.0 : 6.8, confidence: 0.72, evidence: "From candidate profile", reasoning: "Assessed from background" },
        strategic_scalability:       { score: c.id === "c1" ? 7.5 : c.id === "c2" ? 8.2 : 7.0, confidence: 0.76, evidence: "From candidate profile", reasoning: "Assessed from background" },
      },
      strengths: c.id === "c1" ? ["Data-driven", "Cross-functional alignment", "Post-merger experience"] : c.id === "c2" ? ["Execution velocity", "Founder mindset", "Scaling experience"] : ["Stakeholder trust", "Ambiguity navigation", "Long-term thinking"],
      weaknesses: c.id === "c1" ? ["May over-index on process"] : c.id === "c2" ? ["Cultural integration risk"] : ["Slower execution pace"],
      risk_profile: { execution_risk: exec_risk/100, culture_risk: cult_risk/100, time_risk: time_risk/100, adaptability_risk: (100-adapt)/100, confidence_risk: (1-conf), opportunity_cost_risk: (exec_risk+cult_risk+time_risk)/300 },
      outcome_model: {
        expected_execution_success: parseFloat((1 - exec_risk/100*0.7).toFixed(2)),
        scenario_fit: parseFloat((wfs/10).toFixed(2)),
        adaptability_score: adapt/100,
        likely_outcome: c.id === "c1" ? "Strong integration with KPI gains within 18 months" : c.id === "c2" ? "Fast early results, cultural friction risk in Q2–Q3" : "Steady execution, strong by month 12",
        strategic_label: c.id === "c1" ? "Safe Bet" : c.id === "c2" ? "High Upside, High Risk" : "Steady Builder",
        expected_outcome_score: outcome,
      },
    };
  }).sort((a, b) => a.rank - b.rank);

  return {
    pipeline_steps: INITIAL_STAGES.map(s => ({ ...s, status: "completed", summary: `${s.label} completed.`, duration_ms: 800 + Math.random() * 1200 })),
    role_analysis: { title: "Strategic Leadership Role", key_requirements: ["Executive presence", "Change management", "Data literacy", "Stakeholder alignment"], complexity: "High" },
    scenario_analysis: { scenario, key_pressures: ["Speed of integration", "Cultural alignment", "Retention risk"], weight_rationale: `${scenario} analysis complete.` },
    candidate_evaluations: evals,
    bias_confidence_reviews: candidates.map((c, i) => ({ candidate_id: c.id, candidate_name: c.name, overall_confidence: rawEvals.find(e => e.c.id === c.id)!.conf, bias_flags: c.id === "c2" ? [{ type: "Halo Effect", severity: "low", description: "Strong founder narrative may inflate scores" }] : [], recommend_human_review: i === 2 })),
    decision_result: { recommended_candidate_id: winner.c.id, recommended_candidate_name: winner.c.name, decision_mode: decisionMode, scenario, final_label: "Recommended Hire", key_reason: `Highest ${sortLabel} score for "${scenario}".`, overall_confidence: winner.conf, executive_interpretation: `${winner.c.name} presents the strongest profile under the "${decisionMode}" decision mode for this scenario.` },
    trade_offs: [
      { title: "Execution Speed vs Stability", description: `Choosing ${winner.c.name} optimizes for ${sortLabel} — other candidates may outperform in different modes.`, type: "sacrifice", severity: "low" },
      { title: "Cultural Integration", description: "Lower cultural clash risk improves 12-month retention probability.", type: "gain", severity: "medium" },
      { title: "Opportunity Cost", description: `${sorted[1]?.c.name ?? "Runner-up"} may outperform ${winner.c.name} in a different scenario or decision mode.`, type: "opportunity_cost", severity: "medium" },
    ],
    adaptability_profiles: candidates.map((c) => {
      const e = rawEvals.find(r => r.c.id === c.id)!;
      return { candidate_name: c.name, adaptability_score: e.adapt, best_scenario: c.id === "c1" ? "Post-merger integration" : c.id === "c2" ? "Rapid scaling / Greenfield launch" : "Digital transformation", worst_scenario: c.id === "c1" ? "Greenfield product launch" : c.id === "c2" ? "Legacy cultural integration" : "Crisis turnaround", resilience_note: c.id === "c1" ? "Highly resilient; adapts strategy to constraints" : c.id === "c2" ? "Strong in growth; struggles in structured legacy environments" : "Consistent across scenarios but limited ceiling" };
    }),
    pairing_result: enablePairing && sorted.length >= 2 ? {
      best_pair: {
        pair: [sorted[0].c.name, sorted[1].c.name] as [string, string],
        pair_score: 8.2,
        explanation: `Strong complementarity — ${sorted[0].c.name} and ${sorted[1].c.name} cover different strength dimensions. Together they offset each other's weaknesses for this scenario.`,
        scenario_coverage: 0.85,
        complementarity: 0.80,
        overlap_risk: 0.20,
        conflict_risk: 0.15,
        execution_cohesion: 0.78,
        pair_adaptability: 0.75,
      },
      top_pairs: sorted.length >= 3 ? [{
        pair: [sorted[0].c.name, sorted[2].c.name] as [string, string],
        pair_score: 7.4,
        explanation: `${sorted[0].c.name} and ${sorted[2].c.name} offer stability but lower upside. Complementary in stakeholder management, weaker on execution speed.`,
      }] : [],
    } : undefined,
    agent_outputs: [
      { agent_name: "Role Agent", agent_role: "Extracts criteria and weights from role description (LLM)", inputs: ["Role title", "Role description"], outputs: ["Criteria list", "Baseline weights"], summary: "Identified 7 core criteria with weights adjusted for scenario context." },
      { agent_name: "Decision Agent", agent_role: `Ranks candidates by ${decisionMode}`, inputs: ["All evaluations", "Decision mode"], outputs: ["Ranked list", "Explanations"], summary: `${winner.c.name} ranked #1 under "${decisionMode}" mode for "${scenario}". Ranking is deterministic from mock scores.` },
    ],
    executive_summary: { recommendation: `Hire ${winner.c.name}`, reason: `Highest ${sortLabel} score for the selected scenario and decision mode.`, trade_off: `${sorted[1]?.c.name ?? "Runner-up"} may outperform in a different scenario or decision mode.`, opportunity_cost: `${sorted[1]?.c.name ?? "Runner-up"} has higher upside in scenarios favoring a different decision mode.`, adaptability: `${winner.c.name} shows the strongest profile for the current configuration.`, alternative: `If you switch to "${decisionMode === "best_fit" ? "lowest_risk" : "best_fit"}" mode, re-evaluate ${sorted[1]?.c.name ?? "runner-up"}.` },
  };
}

async function runMock(candidates: CandidateInput[], enablePairing: boolean, decisionMode: string, scenario: string, onStage: (s: PipelineStage[]) => void): Promise<PipelineResponse> {
  const stages = INITIAL_STAGES.filter(s => enablePairing || s.id !== "pairing").map(s => ({ ...s }));
  for (let i = 0; i < stages.length; i++) {
    stages[i].status = "running"; onStage([...stages]);
    await delay(600 + Math.random() * 700);
    stages[i].status = "completed"; stages[i].summary = `${stages[i].label} completed.`; stages[i].duration_ms = Math.round(700 + Math.random() * 1200);
    onStage([...stages]);
    await delay(100);
  }
  return buildMockResponse(candidates, enablePairing, decisionMode, scenario);
}

async function runLive(
  request: { role: { title: string; description: string }; scenario: string; decision_mode: string; candidates: CandidateInput[]; options: { enable_pair_simulation: boolean }; },
  onStage: (s: PipelineStage[]) => void
): Promise<PipelineResponse> {
  const controller = new AbortController();
  // 10-minute hard timeout — pipeline should never take longer than this
  const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);

  try {
    const res = await fetch(`${BACKEND_URL}/api/decision/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`Server returned ${res.status}. Is node server.mjs running on port 3001?`);
    if (!res.body) throw new Error("No response body from server.");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let currentEvent = "";
    let result: PipelineResponse | null = null;

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        if (result) return result;
        throw new Error("Stream ended before pipeline completed.");
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop()!; // keep incomplete last line for next chunk

      for (const line of lines) {
        if (line.startsWith(": ")) continue; // SSE comment / heartbeat — ignore
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
          continue;
        }
        if (line.startsWith("data: ")) {
          const raw = line.slice(6);
          if (currentEvent === "error") {
            let msg = "Pipeline error.";
            try { msg = JSON.parse(raw).message || msg; } catch { msg = raw; }
            reader.cancel();
            throw new Error(msg);
          }
          try {
            const data = JSON.parse(raw);
            if (currentEvent === "stage_update" || Array.isArray(data)) {
              onStage(data);
            } else if (currentEvent === "complete" || data.candidate_evaluations) {
              result = data;
            }
          } catch { /* malformed data line — skip */ }
          currentEvent = ""; // reset after consuming the data line
          continue;
        }
        if (line === "") {
          currentEvent = ""; // blank line = end of SSE event block
        }
      }
    }
  } finally {
    clearTimeout(timeout);
  }
}

// ─── TINY UI HELPERS ──────────────────────────────────────────────────────────

function cn(...classes: (string | undefined | false)[]) { return classes.filter(Boolean).join(" "); }

function Badge({ children, color = "default" }: { children: React.ReactNode; color?: "default" | "green" | "amber" | "red" | "blue" }) {
  const colors = { default: "bg-white/10 text-white/70", green: "bg-emerald-400/15 text-emerald-300", amber: "bg-amber-400/15 text-amber-300", red: "bg-red-400/15 text-red-300", blue: "bg-blue-400/15 text-blue-300" };
  return <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", colors[color])}>{children}</span>;
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-xl border border-white/10 bg-white/5 backdrop-blur p-5", className)}>{children}</div>;
}

function ScoreBar({ value, max = 10, color = "#f59e0b" }: { value: number; max?: number; color?: string }) {
  return (
    <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(value / max) * 100}%`, background: color }} />
    </div>
  );
}

// ─── PHASE COMPONENTS ─────────────────────────────────────────────────────────

function Landing({ onStart }: { onStart: () => void }) {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center text-center px-6 gap-8">
      <div className="space-y-3">
        <div className="text-xs font-semibold tracking-widest text-amber-400 uppercase">Decision Intelligence Platform</div>
        <h1 className="text-5xl font-bold tracking-tight">
          <span className="text-amber-400">ScenarioRank</span> <span className="text-white">AI</span>
        </h1>
        <p className="text-white/50 max-w-lg mx-auto text-base leading-relaxed">
          A multi-agent pipeline that scores candidates against real leadership scenarios — deterministic math, LLM interpretation.
        </p>
      </div>
      <button
        onClick={onStart}
        className="px-8 py-3 rounded-xl bg-amber-400 text-black font-bold text-sm hover:bg-amber-300 transition-all"
      >
        Start Evaluation →
      </button>
    </div>
  );
}

function EvalForm({
  role, setRole, scenario, setScenario, decisionMode, setDecisionMode,
  candidates, setCandidates, enablePairing, setEnablePairing, onRun, isRunning,
}: {
  role: { title: string; description: string }; setRole: (r: { title: string; description: string }) => void;
  scenario: string; setScenario: (s: string) => void;
  decisionMode: string; setDecisionMode: (m: string) => void;
  candidates: CandidateInput[]; setCandidates: (c: CandidateInput[]) => void;
  enablePairing: boolean; setEnablePairing: (b: boolean) => void;
  onRun: () => void; isRunning: boolean;
}) {
  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      <h2 className="text-xl font-bold text-white">Configure Evaluation</h2>

      {/* Role */}
      <Card>
        <div className="space-y-3">
          <label className="text-xs font-semibold text-white/50 uppercase tracking-widest">Role</label>
          <input
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-amber-400/50"
            placeholder="Role title (e.g. VP of Product)"
            value={role.title}
            onChange={e => setRole({ ...role, title: e.target.value })}
          />
          <textarea
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-amber-400/50 resize-none"
            rows={3}
            placeholder="Role description — context, responsibilities, must-haves..."
            value={role.description}
            onChange={e => setRole({ ...role, description: e.target.value })}
          />
        </div>
      </Card>

      {/* Scenario + Mode */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <label className="text-xs font-semibold text-white/50 uppercase tracking-widest block mb-2">Scenario</label>
          <select
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400/50"
            value={scenario}
            onChange={e => setScenario(e.target.value)}
          >
            {SCENARIOS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Card>
        <Card>
          <label className="text-xs font-semibold text-white/50 uppercase tracking-widest block mb-2">Decision Mode</label>
          <select
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400/50"
            value={decisionMode}
            onChange={e => setDecisionMode(e.target.value)}
          >
            {DECISION_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </Card>
      </div>

      {/* Candidates */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <label className="text-xs font-semibold text-white/50 uppercase tracking-widest">Candidates ({candidates.length})</label>
          <button
            className="text-xs text-amber-400 hover:text-amber-300"
            onClick={() => setCandidates([...candidates, { id: `c${Date.now()}`, name: "", description: "" }])}
          >
            + Add
          </button>
        </div>
        <div className="space-y-3">
          {candidates.map((c, i) => (
            <div key={c.id} className="space-y-1.5 border border-white/5 rounded-lg p-3">
              <div className="flex gap-2">
                <input
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-white/30 focus:outline-none"
                  placeholder="Candidate name"
                  value={c.name}
                  onChange={e => { const updated = [...candidates]; updated[i] = { ...c, name: e.target.value }; setCandidates(updated); }}
                />
                {candidates.length > 2 && (
                  <button className="text-white/30 hover:text-red-400 text-xs" onClick={() => setCandidates(candidates.filter((_, j) => j !== i))}>✕</button>
                )}
              </div>
              <textarea
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/70 placeholder-white/30 focus:outline-none resize-none"
                rows={2}
                placeholder="Background, experience, strengths, context..."
                value={c.description}
                onChange={e => { const updated = [...candidates]; updated[i] = { ...c, description: e.target.value }; setCandidates(updated); }}
              />
            </div>
          ))}
        </div>
      </Card>

      {/* Options */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setEnablePairing(!enablePairing)}
          className={cn("w-9 h-5 rounded-full transition-all relative", enablePairing ? "bg-amber-400" : "bg-white/20")}
        >
          <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all", enablePairing ? "left-4" : "left-0.5")} />
        </button>
        <span className="text-sm text-white/60">Enable pair simulation</span>
      </div>

      {/* Run */}
      <button
        onClick={onRun}
        disabled={isRunning}
        className="w-full py-3 rounded-xl bg-amber-400 text-black font-bold text-sm hover:bg-amber-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isRunning ? "Running Pipeline..." : "▶ Run Decision Pipeline"}
      </button>
    </div>
  );
}

function PipelineProgress({ stages }: { stages: PipelineStage[] }) {
  if (!stages.length) return null;
  const statusIcon = (s: string) => s === "completed" ? "✓" : s === "running" ? "◌" : s === "failed" ? "✕" : "○";
  const statusColor = (s: string) => s === "completed" ? "text-emerald-400" : s === "running" ? "text-amber-400 animate-pulse" : s === "failed" ? "text-red-400" : "text-white/20";
  return (
    <div className="max-w-3xl mx-auto px-6 py-6">
      <Card>
        <h3 className="text-sm font-semibold text-white/60 mb-4 uppercase tracking-widest">Agent Pipeline</h3>
        <div className="space-y-2">
          {stages.map(s => (
            <div key={s.id} className="flex items-center gap-3">
              <span className={cn("text-sm font-mono w-4 text-center", statusColor(s.status))}>{statusIcon(s.status)}</span>
              <span className={cn("text-sm flex-1", s.status === "running" ? "text-white" : s.status === "completed" ? "text-white/60" : "text-white/25")}>{s.label}</span>
              {s.duration_ms && <span className="text-xs text-white/30">{(s.duration_ms / 1000).toFixed(1)}s</span>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Results({ response }: { response: PipelineResponse }) {
  const [tab, setTab] = useState<"overview" | "candidates" | "analysis" | "pairing" | "agents">("overview");
  const winner = response.candidate_evaluations[0];
  const hasPairing = !!response.pairing_result;

  return (
    <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
      {/* Winner Hero */}
      <Card className="border-amber-400/30 bg-amber-400/5">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge color="amber">Recommended</Badge>
            <Badge color="default">{response.decision_result.final_label}</Badge>
          </div>
          <h2 className="text-3xl font-bold text-white">{response.decision_result.recommended_candidate_name}</h2>
          <p className="text-white/60 text-sm leading-relaxed">{response.decision_result.key_reason}</p>
          <p className="text-white/40 text-xs leading-relaxed italic">{response.decision_result.executive_interpretation}</p>
        </div>
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 rounded-xl p-1">
        {(["overview", "candidates", "analysis", ...(hasPairing ? ["pairing"] : []), "agents"] as const).map(t => (
          <button key={t} onClick={() => setTab(t as typeof tab)}
            className={cn("flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-all", tab === t ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60")}
          >{t}</button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          {/* Executive Summary */}
          <Card>
            <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">Executive Summary</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              {Object.entries(response.executive_summary).map(([k, v]) => (
                <div key={k} className="space-y-1">
                  <div className="text-white/40 capitalize">{k.replace("_", " ")}</div>
                  <div className="text-white/80">{v}</div>
                </div>
              ))}
            </div>
          </Card>

          {/* Trade-offs */}
          {response.trade_offs.length > 0 && (
            <Card>
              <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">Trade-offs</h3>
              <div className="space-y-3">
                {response.trade_offs.map((t, i) => (
                  <div key={i} className="border-l-2 border-amber-400/30 pl-3 space-y-1">
                    <div className="text-sm font-medium text-white">{t.title}</div>
                    <div className="text-xs text-white/50">{t.description}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {tab === "candidates" && (
        <div className="space-y-3">
          {response.candidate_evaluations.map((c, i) => (
            <Card key={c.candidate_id} className={i === 0 ? "border-amber-400/20" : ""}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-white/30 text-sm font-mono">#{c.rank}</span>
                    <span className="font-bold text-white">{c.candidate_name}</span>
                    {i === 0 && <Badge color="amber">Winner</Badge>}
                  </div>
                  <div className="flex gap-1 flex-wrap">{c.strategic_labels.map(l => <Badge key={l}>{l}</Badge>)}</div>
                </div>
                <div className="text-right text-xs text-white/40">
                  <div className="text-lg font-bold text-white">{c.weighted_fit_score.toFixed(1)}</div>
                  <div>WFS</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-3 text-xs text-center">
                <div><div className="text-white font-semibold">{c.risk_adjusted_score.toFixed(1)}</div><div className="text-white/40">Risk Adj.</div></div>
                <div><div className="text-white font-semibold">{c.expected_outcome_score.toFixed(1)}</div><div className="text-white/40">Outcome</div></div>
                <div><div className="text-white font-semibold">{Math.round(c.overall_confidence * 100)}%</div><div className="text-white/40">Confidence</div></div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-white/40 mb-1">Strengths</div>
                  {c.strengths.map(s => <div key={s} className="text-emerald-300">+ {s}</div>)}
                </div>
                <div>
                  <div className="text-white/40 mb-1">Weaknesses</div>
                  {c.weaknesses.map(w => <div key={w} className="text-red-300">− {w}</div>)}
                </div>
              </div>
              {c.winner_reason && <p className="mt-3 text-xs text-amber-300 italic border-t border-white/10 pt-3">{c.winner_reason}</p>}
              {c.trade_off_note && <p className="mt-2 text-xs text-white/40 italic">{c.trade_off_note}</p>}
            </Card>
          ))}
        </div>
      )}

      {tab === "analysis" && (
        <div className="space-y-4">
          <Card>
            <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">Scenario Analysis</h3>
            <div className="text-sm text-white/70 mb-3">{response.scenario_analysis.weight_rationale}</div>
            <div className="flex flex-wrap gap-1">{response.scenario_analysis.key_pressures.map(p => <Badge key={p} color="blue">{p}</Badge>)}</div>
          </Card>

          <Card>
            <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">Adaptability Profiles</h3>
            <div className="space-y-4">
              {response.adaptability_profiles.map(p => (
                <div key={p.candidate_name} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-white">{p.candidate_name}</span>
                    <span className="text-white/40">{p.adaptability_score}/100</span>
                  </div>
                  <ScoreBar value={p.adaptability_score} max={100} color="#34d399" />
                  <div className="text-xs text-white/40 italic">{p.resilience_note}</div>
                </div>
              ))}
            </div>
          </Card>

          {response.bias_confidence_reviews.some(r => r.bias_flags.length > 0) && (
            <Card>
              <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">Bias Flags</h3>
              {response.bias_confidence_reviews.filter(r => r.bias_flags.length > 0).map(r => (
                <div key={r.candidate_id} className="mb-3">
                  <div className="text-sm font-medium text-white mb-1">{r.candidate_name}</div>
                  {r.bias_flags.map((f, i) => (
                    <div key={i} className="text-xs border-l-2 border-amber-400/40 pl-2 mb-1">
                      <span className="text-amber-300">{f.type}</span>
                      <span className="text-white/40 ml-2">{f.description}</span>
                    </div>
                  ))}
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {tab === "pairing" && response.pairing_result && (
        <div className="space-y-4">
          <Card className="border-amber-400/20">
            <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">Best Leadership Pair</h3>
            <div className="flex items-center gap-3 mb-4">
              <span className="font-bold text-white text-sm">{response.pairing_result.best_pair.pair[0]}</span>
              <span className="text-amber-400 font-bold">+</span>
              <span className="font-bold text-white text-sm">{response.pairing_result.best_pair.pair[1]}</span>
              <Badge color="amber">{response.pairing_result.best_pair.pair_score.toFixed(1)} / 10</Badge>
            </div>
            <p className="text-xs text-white/60 leading-relaxed mb-4">{response.pairing_result.best_pair.explanation}</p>
            {response.pairing_result.best_pair.scenario_coverage !== undefined && (
              <div className="grid grid-cols-3 gap-3 text-xs text-center">
                {[
                  { label: "Coverage", value: (response.pairing_result.best_pair.scenario_coverage ?? 0) * 100 },
                  { label: "Complementarity", value: (response.pairing_result.best_pair.complementarity ?? 0) * 100 },
                  { label: "Cohesion", value: (response.pairing_result.best_pair.execution_cohesion ?? 0) * 100 },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div className="text-white font-semibold">{Math.round(value)}%</div>
                    <div className="text-white/40">{label}</div>
                    <ScoreBar value={value} max={100} color="#f59e0b" />
                  </div>
                ))}
              </div>
            )}
          </Card>
          {response.pairing_result.top_pairs.length > 0 && (
            <Card>
              <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">Other Pairs Evaluated</h3>
              <div className="space-y-3">
                {response.pairing_result.top_pairs.map((p, i) => (
                  <div key={i} className="border-l-2 border-white/10 pl-3 space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-white/70">{p.pair[0]} + {p.pair[1]}</span>
                      <Badge>{p.pair_score.toFixed(1)}</Badge>
                    </div>
                    <div className="text-xs text-white/40">{p.explanation}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {tab === "agents" && (
        <div className="space-y-3">
          {response.agent_outputs.map(a => (
            <Card key={a.agent_name}>
              <div className="flex justify-between items-start mb-2">
                <div className="font-semibold text-sm text-white">{a.agent_name}</div>
                <Badge>{a.agent_role.includes("LLM") ? "LLM" : "Deterministic"}</Badge>
              </div>
              <p className="text-xs text-white/50 mb-3">{a.agent_role}</p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><div className="text-white/30 mb-1">Inputs</div>{a.inputs.map(i => <div key={i} className="text-white/60">→ {i}</div>)}</div>
                <div><div className="text-white/30 mb-1">Outputs</div>{a.outputs.map(o => <div key={o} className="text-white/60">← {o}</div>)}</div>
              </div>
              <p className="text-xs text-white/40 mt-3 italic border-t border-white/10 pt-3">{a.summary}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

type Phase = "landing" | "eval" | "running" | "results";

export default function Index() {
  const [phase, setPhase] = useState<Phase>("landing");
  const [role, setRole] = useState({ title: "VP of People & Culture", description: "Senior leader to oversee talent strategy, DEI initiatives, and organizational health through a post-merger integration. Must balance speed with cultural sensitivity." });
  const [scenario, setScenario] = useState(SCENARIOS[0]);
  const [decisionMode, setDecisionMode] = useState("best_fit");
  const [candidates, setCandidates] = useState<CandidateInput[]>(DEFAULT_CANDIDATES.map(c => ({ ...c })));
  const [enablePairing, setEnablePairing] = useState(false);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [response, setResponse] = useState<PipelineResponse | null>(null);
  const [mode, setMode] = useState<ServiceMode>("mock");
  const [error, setError] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const toggleMode = () => {
    const next: ServiceMode = mode === "mock" ? "live" : "mock";
    setServiceMode(next);
    setMode(next);
  };

  const handleRun = useCallback(async () => {
    setPhase("running");
    setResponse(null);
    setError(null);
    const initStages = INITIAL_STAGES
      .filter(s => enablePairing || s.id !== "pairing")
      .map(s => ({ ...s }));
    setStages(initStages);

    try {
      const result = mode === "live"
        ? await runLive({ role, scenario, decision_mode: decisionMode, candidates, options: { enable_pair_simulation: enablePairing } }, setStages)
        : await runMock(candidates, enablePairing, decisionMode, scenario, setStages);
      setResponse(result);
      setPhase("results");
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("eval");
    }
  }, [role, scenario, decisionMode, candidates, enablePairing, mode]);

  return (
    <div className="min-h-screen bg-[#0d0f14] text-white">
      {/* Header — always visible */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-[#0d0f14]/80 border-b border-white/5">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="font-bold text-base">
            <span className="text-amber-400">ScenarioRank</span> <span className="text-white">AI</span>
            <span className="text-white/20 text-xs ml-2">v3</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleMode}
              className={cn(
                "text-[10px] px-3 py-1.5 rounded-full font-semibold border transition-all cursor-pointer",
                mode === "live"
                  ? "bg-emerald-400/10 text-emerald-400 border-emerald-400/30 hover:bg-emerald-400/20"
                  : "bg-amber-400/10 text-amber-400 border-amber-400/30 hover:bg-amber-400/20"
              )}
              title={mode === "mock" ? "Switch to Live Mode (requires node server.mjs on port 3001)" : "Switch to Mock Mode"}
            >
              {mode === "live" ? "⚡ Live Mode" : "🎭 Mock Mode"}
            </button>
            {phase !== "landing" && (
              <button onClick={() => { setPhase("landing"); setResponse(null); setError(null); setStages([]); }}
                className="text-xs text-white/30 hover:text-white/60 transition-colors">
                Reset
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="max-w-3xl mx-auto px-6 pt-4">
          <div className="rounded-xl border border-red-400/20 bg-red-400/5 p-4">
            <p className="text-sm text-red-300 font-semibold">⚠️ Pipeline Error</p>
            <p className="text-xs text-white/50 mt-1">{error}</p>
            {mode === "live" && (error?.includes("port 3001") || error?.includes("fetch") || error?.includes("NetworkError") || error?.includes("Failed to fetch")) && (
              <p className="text-xs text-white/30 mt-2">
                Is <code className="text-amber-400 bg-amber-400/10 px-1 rounded">node server.mjs</code> running in a separate terminal on port 3001?
              </p>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      {phase === "landing" && <Landing onStart={() => setPhase("eval")} />}
      {(phase === "eval" || phase === "running") && (
        <EvalForm
          role={role} setRole={setRole}
          scenario={scenario} setScenario={setScenario}
          decisionMode={decisionMode} setDecisionMode={setDecisionMode}
          candidates={candidates} setCandidates={setCandidates}
          enablePairing={enablePairing} setEnablePairing={setEnablePairing}
          onRun={handleRun} isRunning={phase === "running"}
        />
      )}
      <PipelineProgress stages={stages} />
      {phase === "results" && response && (
        <div ref={resultsRef}>
          <Results response={response} />
        </div>
      )}
    </div>
  );
}
