import type { CandidateInput, PipelineStage } from "./contracts";

export const DEFAULT_ROLE = {
  title: "VP of People & Culture",
  description:
    "Senior leader to oversee talent strategy, DEI initiatives, and " +
    "organizational health through a post-merger integration. Must balance " +
    "speed with cultural sensitivity.",
};

export const DEFAULT_SCENARIOS = [
  "Post-merger integration with cultural clash risk",
  "Rapid scaling in a new geographic market",
  "Digital transformation in a legacy enterprise",
  "Crisis turnaround with limited runway",
  "Greenfield product launch in competitive market",
];

export const DECISION_MODES = [
  { value: "best_fit", label: "Best Fit" },
  { value: "lowest_risk", label: "Risk-Adjusted Choice" },
  { value: "best_outcome", label: "Best Outcome" },
] as const;

export const DEFAULT_CANDIDATES: CandidateInput[] = [
  {
    id: "c1",
    name: "Alexandra Chen",
    description:
      "15 years in enterprise SaaS, led 3 post-merger integrations at " +
      "Fortune 500 companies. Known for data-driven decision making and " +
      "cross-functional alignment. MBA from Wharton.",
  },
  {
    id: "c2",
    name: "Marcus Rodriguez",
    description:
      "Operator turned strategist. Scaled two companies from seed to " +
      "Series C. Deep ops background, high execution velocity. Sometimes " +
      "clashes with legacy culture.",
  },
  {
    id: "c3",
    name: "Priya Nair",
    description:
      "Chief of Staff turned GM. Exceptional at navigating ambiguity and " +
      "building coalition. Lower on pure execution speed but high on " +
      "stakeholder trust and long-term thinking.",
  },
  {
    id: "c4",
    name: "Jordan Malik",
    description:
      "20 years in global HR transformation across EMEA and APAC. Built " +
      "scalable talent systems for hyper-growth companies. Strong on " +
      "analytical rigor and workforce planning.",
  },
  {
    id: "c5",
    name: "Samuel Okafor",
    description:
      "Ex-McKinsey People & Org specialist. Led DEI turnarounds in three " +
      "multinational firms. High strategic clarity and executive presence.",
  },
];

export const INITIAL_STAGES: PipelineStage[] = [
  { id: "input", label: "Input Received", status: "pending" },
  { id: "context", label: "Context Analysis", status: "pending" },
  { id: "scoring", label: "Candidate Scoring", status: "pending" },
  {
    id: "confidence_review",
    label: "Confidence & Evidence Review",
    status: "pending",
  },
  { id: "outcome", label: "Outcome Modeling", status: "pending" },
  { id: "pairing", label: "Pair Simulation", status: "pending" },
  { id: "decision", label: "Decision Engine", status: "pending" },
  { id: "complete", label: "Completed", status: "pending" },
];

export const SCENARIO_TIMEOUT_MS = 35_000;
export const PIPELINE_TIMEOUT_MS = 3 * 60 * 1000;
