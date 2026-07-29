import type { PipelineResponse } from "../../contracts";
import { Badge, Card } from "../ui";
import { CriterionScoringPanel } from "./CriterionScoringPanel";

export function CandidatesTab({ response }: { response: PipelineResponse }) {
  return (
    <div className="space-y-3">
      {response.candidate_evaluations.map((candidate, index) => (
        <Card
          key={candidate.candidate_id}
          className={index === 0 ? "border-amber-400/20" : ""}
        >
          <div className="mb-3 flex items-start justify-between">
            <div>
              <div className="flex gap-2">
                <span className="text-white/30">#{candidate.rank}</span>
                <b>{candidate.candidate_name}</b>
                {index === 0 && <Badge color="amber">Winner</Badge>}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {candidate.strategic_labels.map((label) => (
                  <Badge key={label}>{label}</Badge>
                ))}
              </div>
            </div>
            <div className="text-right">
              <b>{candidate.weighted_fit_score.toFixed(1)}</b>
              <div className="text-xs text-white/40">WFS</div>
            </div>
          </div>

          <div className="grid grid-cols-3 text-center text-xs">
            <div>
              <b>{candidate.risk_adjusted_score.toFixed(1)}</b>
              <div className="text-white/40">Risk Adj.</div>
            </div>
            <div>
              <b>{candidate.expected_outcome_score.toFixed(1)}</b>
              <div className="text-white/40">Outcome</div>
            </div>
            <div>
              <b>{Math.round(candidate.overall_confidence * 100)}%</b>
              <div className="text-white/40">Model Conf.</div>
            </div>
          </div>

          {candidate.winner_reason && (
            <p
              className={
                "mt-3 border-t border-white/10 pt-3 text-xs " +
                "italic text-amber-300"
              }
            >
              {candidate.winner_reason}
            </p>
          )}

          <CriterionScoringPanel scores={candidate.criteria_scores} />
        </Card>
      ))}
    </div>
  );
}
