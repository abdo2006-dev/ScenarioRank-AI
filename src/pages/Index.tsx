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

const DEFAULT_ROLE = {
  title: "VP of People & Culture",
  description: "Senior leader to oversee talent strategy, DEI initiatives, and organizational health through a post-merger integration. Must balance speed with cultural sensitivity.",
};

const DEFAULT_SCENARIOS = [
  "Post-merger integration with cultural clash risk",
  "Rapid scaling in a new geographic market",
  "Digital transformation in a legacy enterprise",
  "Crisis turnaround with limited runway",
  "Greenfield product launch in competitive market",
];

const DECISION_MODES = [
  { value: "best_fit", label: "Best Fit" },
  { value: "lowest_risk", label: "Risk-Adjusted Choice" },
  { value: "best_outcome", label: "Best Outcome" },
];

const DEFAULT_CANDIDATES: CandidateInput[] = [
  { id: "c1", name: "Alexandra Chen", description: "15 years in enterprise SaaS, led 3 post-merger integrations at Fortune 500 companies. Known for data-driven decision making and cross-functional alignment. MBA from Wharton." },
  { id: "c2", name: "Marcus Rodriguez", description: "Operator turned strategist. Scaled two companies from seed to Series C. Deep ops background, high execution velocity. Sometimes clashes with legacy culture." },
  { id: "c3", name: "Priya Nair", description: "Chief of Staff turned GM. Exceptional at navigating ambiguity and building coalition. Lower on pure execution speed but high on stakeholder trust and long-term thinking." },
  { id: "c4", name: "Jordan Malik", description: "20 years in global HR transformation across EMEA and APAC. Built scalable talent systems for hyper-growth companies. Strong on analytical rigor and workforce planning. Sometimes overly process-heavy in fast-moving environments." },
  { id: "c5", name: "Samuel Okafor", description: "Ex-McKinsey People & Org specialist. Led DEI turnarounds in three multinational firms. High strategic clarity, strong executive presence. Can be perceived as too top-down by grassroots teams." },
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

const REQUEST_TIMEOUT_MS = 3 * 60 * 1000;

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 45000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function runLive(
  request: { role: { title: string; description: string }; scenario: string; decision_mode: string; candidates: CandidateInput[]; options: { enable_pair_simulation: boolean }; },
  onStage: (s: PipelineStage[]) => void
): Promise<PipelineResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

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
    // FIX #3: Track the last error event the server sent so that if the stream
    // closes after an error (done=true), we surface the real server message
    // instead of the generic "Stream ended before pipeline completed" fallback.
    let lastServerError: string | null = null;

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        // FIX #3: If the server already sent an error event, re-throw it with
        // the real message. Without this, the server's error was shown correctly
        // but then immediately overwritten by the generic "stream ended" error.
        if (lastServerError) throw new Error(lastServerError);
        throw new Error("Stream ended before pipeline completed.");
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line) {
          currentEvent = "";
          continue;
        }
        if (line.startsWith(": ")) continue;
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
          continue;
        }
        if (line.startsWith("data: ")) {
          const raw = line.slice(6);
          let data: unknown;
          try {
            data = JSON.parse(raw);
          } catch {
            continue;
          }

          if (currentEvent === "error" && typeof data === "object" && data && "message" in data) {
            const message = typeof (data as { message?: unknown }).message === "string"
              ? (data as { message: string }).message
              : "Pipeline error.";
            // FIX #3: Save the server error message. The server will call res.end()
            // after sending the error event, which means the next reader.read()
            // returns done=true. We stash the message here so the done branch
            // above can throw it correctly instead of the generic fallback.
            lastServerError = message;
            currentEvent = "";
            continue;
          }

          if (currentEvent === "stage_update" && Array.isArray(data)) {
            onStage(data as PipelineStage[]);
            currentEvent = "";
            continue;
          }

          if (currentEvent === "complete" && data && typeof data === "object") {
            await reader.cancel();
            return data as PipelineResponse;
          }

          currentEvent = "";
        }
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`Pipeline request timed out after ${Math.round(REQUEST_TIMEOUT_MS / 60000)} minutes. Please try again.`);
    }
    throw err;
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


function MiniMetricCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
      <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">{title}</div>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
      <div className="mt-1 text-xs leading-relaxed text-white/50">{subtitle}</div>
    </div>
  );
}

function LogicStep({
  index,
  title,
  description,
}: {
  index: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-black">
          {index}
        </div>
        <div className="text-sm font-semibold text-white">{title}</div>
      </div>
      <p className="text-sm leading-relaxed text-white/55">{description}</p>
    </div>
  );
}

function PhilosophyCard({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="text-sm font-semibold text-white">{question}</div>
      <p className="mt-2 text-sm leading-relaxed text-white/55">{answer}</p>
    </div>
  );
}

function AlgorithmRow({
  label,
  left,
  right,
  colorClass,
}: {
  label: string;
  left: string;
  right: string;
  colorClass: string;
}) {
  return (
    <div className="space-y-2 rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-white">{label}</span>
        <span className="text-right text-[11px] text-white/40">{left} → {right}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div className={cn("h-full rounded-full", colorClass)} />
      </div>
    </div>
  );
}

// ─── PHASE COMPONENTS ─────────────────────────────────────────────────────────

function Landing({ onStart }: { onStart: () => void }) {
  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white">
      <div className="mx-auto max-w-7xl px-6 py-10 md:px-10 lg:px-12">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-400">
              Executive Decision Intelligence
            </div>
            <div className="mt-1 text-sm text-white/45">
              ScenarioRank AI · Leadership evaluation under changing business conditions
            </div>
          </div>

          <button
            onClick={onStart}
            className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-bold text-black transition hover:bg-amber-300"
          >
            Start Evaluation
          </button>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div className="space-y-6">
            <div className="inline-flex rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300">
              Hiring is not a resume problem. It is a decision problem.
            </div>

            <div className="space-y-4">
              <h1 className="max-w-4xl text-4xl font-bold leading-tight md:text-6xl">
                Make leadership decisions people can <span className="text-amber-400">trust</span>.
              </h1>

              <p className="max-w-2xl text-base leading-relaxed text-white/60 md:text-lg">
                ScenarioRank AI helps executives evaluate candidates using scenario simulation,
                weighted criteria, risk-adjusted scoring, projected outcomes, and leadership-pair
                analysis — so the final recommendation is not just persuasive, but explainable.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={onStart}
                className="rounded-xl bg-amber-400 px-6 py-3 text-sm font-bold text-black transition hover:bg-amber-300"
              >
                Evaluate Candidates Now
              </button>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/55">
                Best Fit · Risk-Adjusted Choice · Best Outcome
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <MiniMetricCard
                title="Decision Logic"
                value="Scenario-aware"
                subtitle="The same candidate can rank differently when the business context changes."
              />
              <MiniMetricCard
                title="Trust Layer"
                value="Explainable"
                subtitle="Every recommendation is backed by criteria scores, risks, trade-offs, and reasoning."
              />
              <MiniMetricCard
                title="Leadership Lens"
                value="Not isolated"
                subtitle="Because strong leaders can fail inside weak pairings and weak combinations create organizational drag."
              />
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/8 to-white/3 p-6 shadow-2xl shadow-black/30">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-white/40">Recommendation Preview</div>
                <div className="mt-1 text-lg font-semibold text-white">Decision Stack</div>
              </div>
              <div className="rounded-full bg-emerald-400/15 px-3 py-1 text-[11px] font-semibold text-emerald-300">
                Live reasoning
              </div>
            </div>

            <div className="space-y-4">
              <AlgorithmRow
                label="Weighted Fit Score"
                left="Candidate evidence"
                right="Scenario priorities"
                colorClass="w-[78%] bg-amber-400"
              />
              <AlgorithmRow
                label="Risk-Adjusted Score"
                left="Fit"
                right="Execution / culture / confidence penalties"
                colorClass="w-[62%] bg-blue-400"
              />
              <AlgorithmRow
                label="Expected Outcome"
                left="Adaptability + fit"
                right="Projected scenario success"
                colorClass="w-[70%] bg-emerald-400"
              />
              <AlgorithmRow
                label="Pair Simulation"
                left="Leader A + Leader B"
                right="Complementarity / conflict / cohesion"
                colorClass="w-[58%] bg-violet-400"
              />
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-white/40">Final Question</div>
              <div className="mt-2 text-sm leading-relaxed text-white/70">
                <span className="font-semibold text-white">Who should we choose</span> is only part
                of the decision. The harder question is:
                <span className="text-amber-300"> who is strongest for this context, with what risk,
                and at what opportunity cost?</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-20 grid gap-10 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-400">
              The hard truth about hiring
            </div>
            <h2 className="text-3xl font-bold leading-tight md:text-4xl">
              The strongest-looking candidate is not always the strongest decision.
            </h2>
            <p className="max-w-xl text-sm leading-relaxed text-white/60 md:text-base">
              Most hiring decisions fail because they optimize for a static profile in a dynamic
              environment. A great operator may underperform in transformation. A visionary leader
              may create execution risk in a crisis. A strong individual may still form a weak
              leadership combination.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <PhilosophyCard
              question="Is the best resume always the best hire?"
              answer="No. We evaluate candidates against business conditions, not just credentials. The model changes recommendations when scenario priorities shift."
            />
            <PhilosophyCard
              question="Should we optimize for fit, risk, or future outcome?"
              answer="Different situations demand different decision modes. That is why the system supports Best Fit, Risk-Adjusted Choice, and Best Outcome."
            />
            <PhilosophyCard
              question="What if the environment changes after the hire?"
              answer="Scenario simulation reveals who is robust versus who is highly context-dependent, helping decision-makers plan for uncertainty."
            />
            <PhilosophyCard
              question="Do leaders succeed in isolation?"
              answer="No. Leadership pairing matters. Pair simulation tests complementarity, cohesion, and conflict risk to identify stronger combinations."
            />
          </div>
        </div>

        <div className="mt-20">
          <div className="max-w-2xl space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-400">
              How the logic works
            </div>
            <h2 className="text-3xl font-bold md:text-4xl">We do not ask one prompt for one answer.</h2>
            <p className="text-sm leading-relaxed text-white/60 md:text-base">
              We decompose the decision into structured steps so executives can inspect the logic,
              not just the conclusion.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <LogicStep
              index="01"
              title="Role Analysis"
              description="We extract what success really requires from the role and define weighted criteria instead of treating every attribute equally."
            />
            <LogicStep
              index="02"
              title="Scenario Adjustment"
              description="We shift priorities based on the chosen business context, because crisis, transformation, and scaling do not reward the same leadership profile."
            />
            <LogicStep
              index="03"
              title="Candidate Evaluation"
              description="Each candidate is scored across the criteria, then translated into weighted fit, confidence, risks, and projected outcome."
            />
            <LogicStep
              index="04"
              title="Decision Synthesis"
              description="We generate an explainable recommendation, trade-offs, and optional leadership-pair insight so the final decision is transparent."
            />
          </div>
        </div>

        <div className="mt-20 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <Card className="border-amber-400/20 bg-amber-400/5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-400">
              Trust through structure
            </div>
            <h3 className="mt-3 text-2xl font-bold text-white">We make judgment visible.</h3>
            <p className="mt-3 text-sm leading-relaxed text-white/65">
              Trust does not come from saying “AI recommended this.” Trust comes from showing how
              the recommendation was constructed: what mattered most, how risks were penalized, what
              outcome was projected, and where trade-offs remain.
            </p>

            <div className="mt-6 space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-white/40">Core scoring logic</div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 font-mono text-xs leading-relaxed text-white/75">
                Weighted Fit = Σ(score × scenario weight)
                <br />
                Risk-Adjusted Choice = Fit − execution risk − culture risk − confidence penalty
                <br />
                Best Outcome = fit + adaptability + projected execution success
              </div>
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <div className="text-xs uppercase tracking-[0.18em] text-white/40">Decision Mode</div>
              <div className="mt-2 text-lg font-semibold text-white">Best Fit</div>
              <p className="mt-2 text-sm leading-relaxed text-white/55">
                Selects the candidate whose profile best matches the scenario-weighted criteria.
              </p>
            </Card>

            <Card>
              <div className="text-xs uppercase tracking-[0.18em] text-white/40">Decision Mode</div>
              <div className="mt-2 text-lg font-semibold text-white">Risk-Adjusted Choice</div>
              <p className="mt-2 text-sm leading-relaxed text-white/55">
                Penalizes execution, culture, timing, and confidence risk so decision-makers can
                prefer stability when the cost of being wrong is high.
              </p>
            </Card>

            <Card>
              <div className="text-xs uppercase tracking-[0.18em] text-white/40">Decision Mode</div>
              <div className="mt-2 text-lg font-semibold text-white">Best Outcome</div>
              <p className="mt-2 text-sm leading-relaxed text-white/55">
                Optimizes for projected scenario success by combining fit, adaptability, and
                downside risk.
              </p>
            </Card>

            <Card>
              <div className="text-xs uppercase tracking-[0.18em] text-white/40">Leadership Pairing</div>
              <div className="mt-2 text-lg font-semibold text-white">Best Pair</div>
              <p className="mt-2 text-sm leading-relaxed text-white/55">
                Tests whether the strongest individual decision is also part of the strongest
                leadership combination.
              </p>
            </Card>
          </div>
        </div>

        <div className="mt-20 rounded-3xl border border-white/10 bg-gradient-to-r from-amber-400/10 via-white/5 to-white/5 p-8 md:p-10">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-400">
                Built for hard decisions
              </div>
              <h2 className="mt-3 text-3xl font-bold md:text-4xl">
                When the cost of a wrong hire is high, intuition is not enough.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/60 md:text-base">
                Use structured evaluation, scenario-aware ranking, and explainable trade-offs to
                make leadership decisions with more confidence.
              </p>
            </div>

            <button
              onClick={onStart}
              className="rounded-2xl bg-amber-400 px-7 py-4 text-sm font-bold text-black transition hover:bg-amber-300"
            >
              Start Evaluation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EvalForm({
  role, setRole, scenarios, setScenarios, scenario, setScenario, decisionMode, setDecisionMode,
  candidates, setCandidates, enablePairing, setEnablePairing, onRun, isRunning,
  onGenerateScenarios, isGeneratingScenarios, onLoadDefaults, onResetInputs, aiEnabled,
}: {
  role: { title: string; description: string }; setRole: (r: { title: string; description: string }) => void;
  scenarios: string[]; setScenarios: (s: string[]) => void;
  scenario: string; setScenario: (s: string) => void;
  decisionMode: string; setDecisionMode: (m: string) => void;
  candidates: CandidateInput[]; setCandidates: (c: CandidateInput[]) => void;
  enablePairing: boolean; setEnablePairing: (b: boolean) => void;
  onRun: () => void; isRunning: boolean;
  onGenerateScenarios: () => void; isGeneratingScenarios: boolean;
  onLoadDefaults: () => void; onResetInputs: () => void;
  aiEnabled: boolean;
}) {
  const canRun = !!role.title.trim() && !!role.description.trim() && !!scenario && candidates.filter(c => c.name.trim() && c.description.trim()).length >= 2;

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      <h2 className="text-xl font-bold text-white">Configure Evaluation</h2>

      {!aiEnabled && (
        <Card className="border-amber-400/20 bg-amber-400/5">
          <p className="text-sm text-amber-200 font-semibold">AI generation is unavailable in this environment.</p>
          <p className="text-xs text-white/60 mt-1">You can still use Default Entries or add scenarios and candidates manually. Live pipeline requests require a configured server-side API key.</p>
        </Card>
      )}

      <Card>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <label className="text-xs font-semibold text-white/50 uppercase tracking-widest">Role</label>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={onGenerateScenarios}
                disabled={isGeneratingScenarios || !role.title.trim() || !role.description.trim() || !aiEnabled}
                className="px-3 py-1.5 rounded-lg bg-blue-400/15 text-blue-300 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isGeneratingScenarios ? "Generating..." : "Generate Scenarios"}
              </button>
              <button type="button" onClick={onLoadDefaults} className="px-3 py-1.5 rounded-lg bg-amber-400 text-black text-xs font-semibold">Default Entries</button>
              <button type="button" onClick={onResetInputs} className="px-3 py-1.5 rounded-lg bg-white/10 text-white/70 text-xs font-semibold">Reset</button>
            </div>
          </div>
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

      <Card>
        <div className="flex items-center justify-between mb-3">
          <label className="text-xs font-semibold text-white/50 uppercase tracking-widest">Scenarios ({scenarios.length})</label>
          <button
            type="button"
            className="text-xs text-amber-400 hover:text-amber-300"
            onClick={() => {
              const next = [...scenarios, ""];
              setScenarios(next);
              if (!scenario) setScenario("");
            }}
          >
            + Add Scenario
          </button>
        </div>
        <div className="space-y-2">
          {scenarios.length === 0 && <p className="text-xs text-white/40">Enter a role and description, then generate scenarios or add your own.</p>}
          {scenarios.map((item, i) => (
            <div key={`${i}-${item}`} className="flex gap-2">
              <input
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none"
                placeholder={`Scenario ${i + 1}`}
                value={item}
                onChange={e => {
                  const next = [...scenarios];
                  next[i] = e.target.value;
                  setScenarios(next);
                  if (scenario === item) setScenario(e.target.value);
                }}
              />
              <button
                type="button"
                className="text-white/30 hover:text-red-400 text-xs px-2"
                onClick={() => {
                  const next = scenarios.filter((_, idx) => idx !== i);
                  setScenarios(next);
                  if (scenario === item) setScenario(next[0] || "");
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <label className="text-xs font-semibold text-white/50 uppercase tracking-widest block mb-2">Active Scenario</label>
          <select
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400/50"
            value={scenario}
            onChange={e => setScenario(e.target.value)}
          >
            {scenarios.length === 0 ? <option value="">No scenarios yet</option> : scenarios.map((s, idx) => <option key={`${idx}-${s}`} value={s}>{s || `Scenario ${idx + 1}`}</option>)}
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
                {candidates.length > 0 && (
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

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-start gap-4">
          <button
            onClick={() => setEnablePairing(!enablePairing)}
            className={cn(
              "mt-0.5 h-6 w-11 rounded-full transition-all relative shrink-0",
              enablePairing ? "bg-amber-400" : "bg-white/20"
            )}
          >
            <span
              className={cn(
                "absolute top-1 h-4 w-4 rounded-full bg-white transition-all",
                enablePairing ? "left-6" : "left-1"
              )}
            />
          </button>

          <div className="space-y-1">
            <div className="text-sm font-semibold text-white">Simulate leadership pairing</div>
            <p className="text-xs leading-relaxed text-white/50">
              Leaders don’t work in isolation — find the best pair for this scenario by testing
              complementarity, cohesion, and conflict risk.
            </p>
          </div>
        </div>
      </div>

      <button
        onClick={onRun}
        disabled={isRunning || !canRun || !aiEnabled}
        className="w-full py-3 rounded-xl bg-amber-400 text-black font-bold text-sm hover:bg-amber-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isRunning ? "Running Pipeline..." : "▶ Run Decision Pipeline"}
      </button>
      {!canRun && <p className="text-xs text-white/40">Add a role, at least one scenario, and at least two complete candidate profiles.</p>}
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
  const [role, setRole] = useState({ ...DEFAULT_ROLE });
  const [scenarios, setScenarios] = useState<string[]>([...DEFAULT_SCENARIOS]);
  const [scenario, setScenario] = useState(DEFAULT_SCENARIOS[0]);
  const [decisionMode, setDecisionMode] = useState("best_fit");
  const [candidates, setCandidates] = useState<CandidateInput[]>(DEFAULT_CANDIDATES.map(c => ({ ...c })));
  const [enablePairing, setEnablePairing] = useState(false);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [response, setResponse] = useState<PipelineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [isGeneratingScenarios, setIsGeneratingScenarios] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${BACKEND_URL}/health`)
      .then(r => r.json())
      .then(data => setAiEnabled(Boolean(data?.ai_enabled)))
      .catch(() => setAiEnabled(false));
  }, []);

  useEffect(() => {
    if (scenario && scenarios.includes(scenario)) return;
    setScenario(scenarios[0] || "");
  }, [scenario, scenarios]);

  const resetInputs = useCallback(() => {
    setRole({ title: "", description: "" });
    setScenarios([]);
    setScenario("");
    setCandidates([]);
    setEnablePairing(false);
    setResponse(null);
    setStages([]);
    setError(null);
    setPhase("eval");
  }, []);

  const loadDefaults = useCallback(() => {
    setRole({ ...DEFAULT_ROLE });
    setScenarios([...DEFAULT_SCENARIOS]);
    setScenario(DEFAULT_SCENARIOS[0]);
    setCandidates(DEFAULT_CANDIDATES.map(c => ({ ...c })));
    setEnablePairing(false);
    setResponse(null);
    setStages([]);
    setError(null);
    setPhase("eval");
  }, []);

  const handleGenerateScenarios = useCallback(async () => {
    if (!role.title.trim() || !role.description.trim()) {
      setError("Enter a role title and description first.");
      return;
    }
    setIsGeneratingScenarios(true);
    setError(null);
    try {
      // FIX #1: Was 25000ms — the server's own Claude timeout for this call is 20000ms.
      // With only 5s of headroom, network latency and server overhead routinely pushed
      // us past the deadline, so the frontend aborted before the server's fallback JSON
      // even arrived. Raised to 35000ms to give a reliable 15s buffer.
      const res = await fetchWithTimeout(`${BACKEND_URL}/api/scenarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: role.title, description: role.description }),
      }, 35000);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || data?.message || "Scenario generation failed.");
      const next = Array.isArray(data?.scenarios) ? data.scenarios.filter((s: unknown) => typeof s === "string" && s.trim()).slice(0, 5) : [];
      if (next.length === 0) throw new Error("No scenarios were generated. Try refining the role description.");
      setScenarios(next);
      setScenario(next[0]);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // FIX #1: Updated message to match the new 35s timeout.
        setError("Scenario generation timed out after 35 seconds. The server may be under load — please try again.");
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setIsGeneratingScenarios(false);
    }
  }, [role]);

  const handleRun = useCallback(async () => {
    setPhase("running");
    setResponse(null);
    setError(null);
    const initStages = INITIAL_STAGES
      .filter(s => enablePairing || s.id !== "pairing")
      .map(s => ({ ...s }));
    setStages(initStages);

    try {
      const result = await runLive({ role, scenario, decision_mode: decisionMode, candidates, options: { enable_pair_simulation: enablePairing } }, setStages);
      setResponse(result);
      setPhase("results");
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 200);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // FIX #2: Was showing "Scenario generation timed out..." — copy-paste error.
        // This branch is for the pipeline runner, not scenario generation.
        setError(`Pipeline request timed out after ${Math.round(REQUEST_TIMEOUT_MS / 60000)} minutes. Please try again.`);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
      setPhase("eval");
    }
  }, [role, scenario, decisionMode, candidates, enablePairing]);

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
            {phase !== "landing" && (
              <button onClick={() => { resetInputs(); setPhase("landing"); }}
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
            {(error?.includes("port 3001") || error?.includes("fetch") || error?.includes("NetworkError") || error?.includes("Failed to fetch")) && (
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
          scenarios={scenarios} setScenarios={setScenarios}
          scenario={scenario} setScenario={setScenario}
          decisionMode={decisionMode} setDecisionMode={setDecisionMode}
          candidates={candidates} setCandidates={setCandidates}
          enablePairing={enablePairing} setEnablePairing={setEnablePairing}
          onRun={handleRun} isRunning={phase === "running"}
          onGenerateScenarios={handleGenerateScenarios} isGeneratingScenarios={isGeneratingScenarios}
          onLoadDefaults={loadDefaults} onResetInputs={resetInputs}
          aiEnabled={aiEnabled}
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
