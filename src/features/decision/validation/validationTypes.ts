import type { CandidateInput, EvaluationRequest } from "../contracts";

export type EvaluationDraft = {
  role: EvaluationRequest["role"];
  scenarios: string[];
  scenario: string;
  decisionMode: EvaluationRequest["decision_mode"];
  candidates: CandidateInput[];
  enablePairing: boolean;
  maxCandidates: number;
};

export type FieldError = {
  fieldId: string;
  message: string;
};

export type EvaluationValidationErrors = {
  roleTitle?: FieldError;
  roleDescription?: FieldError;
  scenarios: Record<number, FieldError>;
  activeScenario?: FieldError;
  candidateNames: Record<string, FieldError>;
  candidateDescriptions: Record<string, FieldError>;
  candidateCount?: FieldError;
  scenarioCount?: FieldError;
  decisionMode?: FieldError;
  pairing?: FieldError;
  form?: FieldError;
};

export type EvaluationValidationResult = {
  errors: EvaluationValidationErrors;
  summary: FieldError[];
  isValid: boolean;
};
