import {
  evaluationRequestSchema,
  scenarioInputSchema,
  DECISION_INPUT_LIMITS,
} from "../contracts";
import type {
  EvaluationDraft,
  EvaluationValidationErrors,
  EvaluationValidationResult,
  FieldError,
} from "./validationTypes";

const emptyErrors = (): EvaluationValidationErrors => ({
  scenarios: {},
  candidateNames: {},
  candidateDescriptions: {},
});

function addSummary(summary: FieldError[], error: FieldError | undefined) {
  if (error && !summary.some((entry) => entry.fieldId === error.fieldId)) {
    summary.push(error);
  }
}

/** Maps shared-contract validation issues to stable, user-facing form fields. */
export function validateEvaluationDraft(
  draft: EvaluationDraft,
): EvaluationValidationResult {
  const errors = emptyErrors();
  const summary: FieldError[] = [];
  const request = {
    role: draft.role,
    scenario: draft.scenario,
    decision_mode: draft.decisionMode,
    candidates: draft.candidates,
    options: { enable_pair_simulation: draft.enablePairing },
  };
  const parsed = evaluationRequestSchema.safeParse(request);

  if (!parsed.success) {
    parsed.error.issues.forEach((issue) => {
      const [root, property, nestedProperty] = issue.path;
      let error: FieldError | undefined;

      if (root === "role" && property === "title") {
        error = { fieldId: "role-title", message: issue.message };
        errors.roleTitle = error;
      } else if (root === "role" && property === "description") {
        error = { fieldId: "role-description", message: issue.message };
        errors.roleDescription = error;
      } else if (root === "scenario") {
        error = { fieldId: "active-scenario", message: issue.message };
        errors.activeScenario = error;
      } else if (root === "candidates" && typeof property === "number") {
        const candidate = draft.candidates[property];
        if (nestedProperty === "name" && candidate) {
          error = { fieldId: `candidate-${candidate.id}-name`, message: issue.message };
          errors.candidateNames[candidate.id] = error;
        } else if (nestedProperty === "description" && candidate) {
          error = { fieldId: `candidate-${candidate.id}-description`, message: issue.message };
          errors.candidateDescriptions[candidate.id] = error;
        } else if (nestedProperty === "id") {
          error = { fieldId: "candidate-count", message: "Each candidate needs a unique stable ID." };
          errors.candidateCount = error;
        }
      } else if (root === "candidates") {
        error = { fieldId: "candidate-count", message: issue.message };
        errors.candidateCount = error;
      } else if (root === "decision_mode") {
        error = { fieldId: "decision-mode", message: "Choose a decision mode." };
        errors.decisionMode = error;
      } else {
        error = { fieldId: "evaluation-error-summary", message: "Review the evaluation details and try again." };
        errors.form = error;
      }
      addSummary(summary, error);
    });
  }

  if (draft.candidates.length > draft.maxCandidates) {
    const error = {
      fieldId: "candidate-count",
      message: `You can evaluate at most ${draft.maxCandidates} candidates in this environment.`,
    };
    errors.candidateCount = error;
    addSummary(summary, error);
  }

  if (draft.scenarios.length < DECISION_INPUT_LIMITS.scenarios.min || draft.scenarios.length > DECISION_INPUT_LIMITS.scenarios.max) {
    const error = {
      fieldId: "scenario-count",
      message: `Add between ${DECISION_INPUT_LIMITS.scenarios.min} and ${DECISION_INPUT_LIMITS.scenarios.max} scenarios.`,
    };
    errors.scenarioCount = error;
    addSummary(summary, error);
  }

  draft.scenarios.forEach((scenario, index) => {
    const scenarioResult = scenarioInputSchema.safeParse(scenario);
    if (!scenarioResult.success) {
      const error = { fieldId: `scenario-${index}`, message: scenarioResult.error.issues[0].message };
      errors.scenarios[index] = error;
      addSummary(summary, error);
    }
  });

  return { errors, summary, isValid: summary.length === 0 };
}
