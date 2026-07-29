import type { CandidateInput, EvaluationRequest } from "../../contracts";
import type { EvaluationValidationErrors } from "../../validation/validationTypes";

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
  maxCandidates: number;
  validationResetKey: number;
  scenarioGenerationStatus: string;
};

export type ValidationProps = {
  errors: EvaluationValidationErrors;
  showAllErrors: boolean;
  touched: Set<string>;
  onFieldBlur: (fieldId: string) => void;
};

export const editorInputClass =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 " +
  "text-sm text-white placeholder-white/30 focus:outline-none " +
  "focus-visible:border-amber-300 focus-visible:ring-2 " +
  "focus-visible:ring-amber-300 focus-visible:ring-offset-2 " +
  "focus-visible:ring-offset-[#0d0f14] disabled:cursor-not-allowed disabled:opacity-50";

export const editorButtonFocusClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d0f14]";
