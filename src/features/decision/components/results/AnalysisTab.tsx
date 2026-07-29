import type { PipelineResponse } from "../../contracts";
import { Badge, Card, ScoreBar } from "../ui";

export function AnalysisTab({ response }: { response: PipelineResponse }) {
  const flaggedReviews = response.confidence_evidence_reviews.filter(
    (review) => review.confidence_evidence_flags.length > 0,
  );

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">
          Scenario Analysis
        </h3>
        <p className="text-sm text-white/70">
          {response.scenario_analysis.weight_rationale}
        </p>
        <div className="mt-3 flex flex-wrap gap-1">
          {response.scenario_analysis.key_pressures.map((pressure) => (
            <Badge key={pressure} color="blue">
              {pressure}
            </Badge>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">
          Adaptability Profiles
        </h3>
        {response.adaptability_profiles.map((profile) => {
          const adaptabilityPercent = Math.round(
            profile.adaptability_score * 100,
          );

          return (
            <div key={profile.candidate_name} className="mb-4">
              <div className="flex justify-between text-xs">
                <span>{profile.candidate_name}</span>
                <span>{adaptabilityPercent}%</span>
              </div>
              <ScoreBar
                value={profile.adaptability_score}
                max={1}
                color="#34d399"
              />
              <p className="mt-1 text-xs italic text-white/40">
                {profile.resilience_note}
              </p>
              {profile.cross_scenario_consistency === "not_measured" && (
                <p className="text-[11px] italic text-white/30">
                  Cross-scenario consistency: not measured (requires running
                  multiple scenarios).
                </p>
              )}
            </div>
          );
        })}
      </Card>

      {flaggedReviews.length > 0 && (
        <Card>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">
            Confidence &amp; Evidence Flags
          </h3>
          {flaggedReviews.map((review) => (
            <div key={review.candidate_id} className="mb-3">
              <b className="text-sm">{review.candidate_name}</b>
              {review.confidence_evidence_flags.map((flag, index) => (
                <div
                  key={`${flag.type}-${index}`}
                  className={
                    "mt-1 border-l-2 border-amber-400/40 pl-2 text-xs"
                  }
                >
                  <span className="text-amber-300">{flag.type}</span>
                  <span className="ml-2 text-white/40">
                    {flag.description}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
