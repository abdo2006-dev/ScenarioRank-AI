import type { CandidateInput } from "../../contracts";
import { Card } from "../ui";
import { editorInputClass } from "./types";

type CandidateEditorProps = {
  candidates: CandidateInput[];
  setCandidates: (candidates: CandidateInput[]) => void;
};

let fallbackCandidateSequence = 0;

function createCandidateId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `candidate_${crypto.randomUUID()}`;
  }
  fallbackCandidateSequence += 1;
  return `candidate_${Date.now()}_${fallbackCandidateSequence}`;
}

export function CandidateEditor({
  candidates,
  setCandidates,
}: CandidateEditorProps) {
  function updateCandidate(index: number, candidate: CandidateInput) {
    const next = [...candidates];
    next[index] = candidate;
    setCandidates(next);
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold uppercase tracking-widest text-white/50">
          Candidates ({candidates.length})
        </label>
        <button
          type="button"
          onClick={() => {
            setCandidates([
              ...candidates,
              { id: createCandidateId(), name: "", description: "" },
            ]);
          }}
          className="text-xs text-amber-400"
        >
          + Add
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {candidates.map((candidate, index) => (
          <div
            key={candidate.id}
            className="space-y-1.5 rounded-lg border border-white/5 p-3"
          >
            <div className="flex gap-2">
              <input
                className={editorInputClass}
                placeholder="Candidate name"
                value={candidate.name}
                onChange={(event) => {
                  updateCandidate(index, {
                    ...candidate,
                    name: event.target.value,
                  });
                }}
              />
              <button
                type="button"
                onClick={() => {
                  setCandidates(
                    candidates.filter(
                      (_, candidateIndex) => candidateIndex !== index,
                    ),
                  );
                }}
                className="text-xs text-white/30"
                aria-label={`Remove ${candidate.name || `candidate ${index + 1}`}`}
              >
                ✕
              </button>
            </div>
            <textarea
              className={`${editorInputClass} resize-none text-xs`}
              rows={2}
              placeholder="Background, experience, strengths, context..."
              value={candidate.description}
              onChange={(event) => {
                updateCandidate(index, {
                  ...candidate,
                  description: event.target.value,
                });
              }}
            />
          </div>
        ))}
      </div>
    </Card>
  );
}
