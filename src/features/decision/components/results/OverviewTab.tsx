import type { PipelineResponse } from "../../contracts";
import { Card } from "../ui";

export function OverviewTab({ response }: { response: PipelineResponse }) {
  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">
          Recommendation
        </h3>
        <div className="text-xl font-bold">
          {response.decision_result.recommended_candidate_name}
        </div>
        <p className="mt-2 text-sm text-white/60">
          {response.decision_result.key_reason}
        </p>
      </Card>

      <Card>
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/40">
          Executive Summary
        </h3>
        <div className="grid grid-cols-2 gap-3 text-xs">
          {Object.entries(response.executive_summary).map(([key, value]) => (
            <div key={key}>
              <div className="capitalize text-white/40">
                {key.replace("_", " ")}
              </div>
              <div className="text-white/80">{value}</div>
            </div>
          ))}
        </div>
      </Card>

      {response.trade_offs.length > 0 && (
        <Card>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">
            Trade-offs
          </h3>
          {response.trade_offs.map((tradeOff, index) => (
            <div
              key={`${tradeOff.title}-${index}`}
              className="mb-3 border-l-2 border-amber-400/30 pl-3"
            >
              <div className="text-sm">{tradeOff.title}</div>
              <div className="text-xs text-white/50">
                {tradeOff.description}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
