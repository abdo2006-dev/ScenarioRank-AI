import { describe, expect, it } from "vitest";
import { DEFAULT_CANDIDATES, DEFAULT_ROLE, DEFAULT_SCENARIOS } from "../constants";
import { validateEvaluationDraft } from "./validateEvaluationDraft";

const validDraft = () => ({
  role: { ...DEFAULT_ROLE }, scenarios: [...DEFAULT_SCENARIOS],
  scenario: DEFAULT_SCENARIOS[0], decisionMode: "best_fit" as const,
  candidates: DEFAULT_CANDIDATES.map((candidate) => ({ ...candidate })),
  enablePairing: false, maxCandidates: 5,
});

describe("validateEvaluationDraft", () => {
  it("accepts valid defaults and permits duplicate display names", () => {
    const draft = validDraft();
    draft.candidates[1].name = draft.candidates[0].name;
    expect(validateEvaluationDraft(draft).isValid).toBe(true);
  });

  it("maps candidate errors by stable candidate ID", () => {
    const draft = validDraft();
    draft.candidates[1].description = "  ";
    const result = validateEvaluationDraft(draft);
    expect(result.errors.candidateDescriptions[draft.candidates[1].id]?.message).toBe("Candidate description is required.");
  });

  it("returns a safe runtime candidate-count error", () => {
    const draft = validDraft();
    draft.maxCandidates = 2;
    expect(validateEvaluationDraft(draft).errors.candidateCount?.message).toBe("You can evaluate at most 2 candidates in this environment.");
  });
});
