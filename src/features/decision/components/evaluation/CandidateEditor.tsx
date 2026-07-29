import { DECISION_INPUT_LIMITS, type CandidateInput } from "../../contracts";
import { Card } from "../ui";
import {
  editorButtonFocusClass,
  editorInputClass,
  type ValidationProps,
} from "./types";

type CandidateEditorProps = {
  candidates: CandidateInput[];
  setCandidates: (candidates: CandidateInput[]) => void;
  maxCandidates: number;
} & ValidationProps;

let fallbackCandidateSequence = 0;

function createCandidateId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `candidate_${crypto.randomUUID()}`;
  }
  fallbackCandidateSequence += 1;
  return `candidate_${Date.now()}_${fallbackCandidateSequence}`;
}

export function CandidateEditor(props: CandidateEditorProps) {
  const { candidates, setCandidates, maxCandidates, errors, showAllErrors, touched, onFieldBlur } = props;
  const shouldShow = (fieldId: string) => showAllErrors || touched.has(fieldId);
  const countError = shouldShow("candidate-count") ? errors.candidateCount : undefined;
  const canAdd = candidates.length < maxCandidates;
  const updateCandidate = (index: number, candidate: CandidateInput) => {
    const next = [...candidates];
    next[index] = candidate;
    setCandidates(next);
  };

  return (
    <Card>
      <fieldset>
        <div className="flex items-center justify-between">
          <legend id="candidate-count" className="text-xs font-semibold uppercase tracking-widest text-white/50">
            Candidates ({candidates.length} / {maxCandidates})
          </legend>
          <button
            type="button"
            disabled={!canAdd}
            title={!canAdd ? `You can evaluate at most ${maxCandidates} candidates in this environment.` : undefined}
            onClick={() => setCandidates([...candidates, { id: createCandidateId(), name: "", description: "" }])}
            className={`text-xs text-amber-400 disabled:cursor-not-allowed disabled:opacity-50 ${editorButtonFocusClass}`}
          >
            + Add
          </button>
        </div>
        <p className="mt-1 text-xs text-white/50">At least {DECISION_INPUT_LIMITS.candidates.min} candidates are required.</p>
        {countError && <p className="mt-1 text-xs text-red-300">{countError.message}</p>}
        <div className="mt-3 space-y-3">
          {candidates.map((candidate, index) => {
            const nameId = `candidate-${candidate.id}-name`;
            const descriptionId = `candidate-${candidate.id}-description`;
            const nameError = shouldShow(nameId)
              ? errors.candidateNames[candidate.id] : undefined;
            const descriptionError = shouldShow(descriptionId)
              ? errors.candidateDescriptions[candidate.id] : undefined;
            return (
              <fieldset key={candidate.id} className="space-y-2 rounded-lg border border-white/5 p-3">
                <legend className="px-1 text-sm font-medium">Candidate {index + 1}</legend>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label htmlFor={nameId} className="mb-1 block text-sm font-medium">Candidate name</label>
                    <input id={nameId} name={nameId} className={editorInputClass} value={candidate.name}
                      aria-invalid={Boolean(nameError)} aria-describedby={`${nameId}-help${nameError ? ` ${nameId}-error` : ""}`}
                      onBlur={() => onFieldBlur(nameId)} onChange={(event) => updateCandidate(index, { ...candidate, name: event.target.value })} />
                    <p id={`${nameId}-help`} className="mt-1 text-xs text-white/50">
                      {candidate.name.trim().length.toLocaleString()} / {DECISION_INPUT_LIMITS.candidateName.max.toLocaleString()} characters
                    </p>
                    {nameError && <p id={`${nameId}-error`} className="mt-1 text-xs text-red-300">{nameError.message}</p>}
                  </div>
                  <button type="button" disabled={candidates.length <= DECISION_INPUT_LIMITS.candidates.min}
                    onClick={() => setCandidates(candidates.filter((_, itemIndex) => itemIndex !== index))}
                    className={`mt-7 text-xs text-white/50 disabled:cursor-not-allowed disabled:opacity-30 ${editorButtonFocusClass}`}
                    aria-label={`Remove ${candidate.name || `candidate ${index + 1}`}`}>✕</button>
                </div>
                <div>
                  <label htmlFor={descriptionId} className="mb-1 block text-sm font-medium">Candidate description</label>
                  <textarea id={descriptionId} name={descriptionId} className={`${editorInputClass} resize-none text-xs`} rows={2}
                    value={candidate.description} aria-invalid={Boolean(descriptionError)}
                    aria-describedby={`${descriptionId}-help${descriptionError ? ` ${descriptionId}-error` : ""}`}
                    onBlur={() => onFieldBlur(descriptionId)} onChange={(event) => updateCandidate(index, { ...candidate, description: event.target.value })} />
                  <p id={`${descriptionId}-help`}
                    aria-live={candidate.description.trim().length >= DECISION_INPUT_LIMITS.candidateDescription.max - 100 ? "polite" : undefined}
                    className="mt-1 text-xs text-white/50">
                    {candidate.description.trim().length.toLocaleString()} / {DECISION_INPUT_LIMITS.candidateDescription.max.toLocaleString()} characters
                  </p>
                  {descriptionError && <p id={`${descriptionId}-error`} className="mt-1 text-xs text-red-300">{descriptionError.message}</p>}
                </div>
              </fieldset>
            );
          })}
        </div>
      </fieldset>
    </Card>
  );
}
