import type { CandidateInput, EvaluationRequest } from "../../contracts";

export type Role = EvaluationRequest["role"];
export type DecisionMode = EvaluationRequest["decision_mode"];

export type EvaluationFormProps = {
  role: Role;
  setRole: (value: Role) => void;
  scenarios: string[];
  setScenarios: (value: string[]) => void;
  scenario: string;
  setScenario: (value: string) => void;
  decisionMode: DecisionMode;
  setDecisionMode: (value: DecisionMode) => void;
  candidates: CandidateInput[];
  setCandidates: (value: CandidateInput[]) => void;
  enablePairing: boolean;
  setEnablePairing: (value: boolean) => void;
  onRun: () => void;
  isRunning: boolean;
  onGenerateScenarios: () => void;
  isGeneratingScenarios: boolean;
  onLoadDefaults: () => void;
  onResetInputs: () => void;
  aiEnabled: boolean;
};

export const editorInputClass =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 " +
  "text-sm text-white placeholder-white/30 focus:outline-none";
