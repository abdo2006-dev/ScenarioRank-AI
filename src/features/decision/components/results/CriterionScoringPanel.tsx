import { useState } from "react";
import type { CriterionScores } from "./types";

const criterionLabels: Record<string, string> = {
  domain_expertise: "Domain Expertise",
  transformation_leadership: "Transformation Leadership",
  operational_execution: "Operational Execution",
  stakeholder_management: "Stakeholder Management",
  crisis_management: "Crisis Management",
  innovation_digital: "Innovation & Digital",
  strategic_scalability: "Strategic Scalability",
};

export function CriterionScoringPanel({
  scores,
}: {
  scores: CriterionScores;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-xs text-white/40"
        aria-expanded={open}
      >
        Criterion Scoring {open ? "▲" : "▼"}
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {Object.entries(scores).map(([key, score]) => (
            <div
              key={key}
              className={
                "rounded-lg border border-white/10 bg-black/20 px-4 py-3"
              }
            >
              <div className="flex justify-between gap-3 text-xs">
                <span className="font-semibold">
                  {criterionLabels[key] ?? key}
                </span>
                <span>
                  Model conf: {Math.round(score.confidence * 100)}% ·{" "}
                  <b className="text-amber-400">{score.score}/10</b>
                </span>
              </div>
              <p className="mt-1 text-[11px] text-white/40">
                {score.evidence}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
