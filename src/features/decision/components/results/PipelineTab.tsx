import type { PipelineResponse } from "../../contracts";
import { Badge, Card } from "../ui";

export function PipelineTab({ response }: { response: PipelineResponse }) {
  return (
    <div className="space-y-3">
      {response.pipeline_stage_outputs.map((stage) => (
        <Card key={stage.stage_name}>
          <div className="flex justify-between gap-3">
            <b className="text-sm">{stage.stage_name}</b>
            <Badge>
              {stage.stage_role.includes("LLM") ? "LLM" : "Deterministic"}
            </Badge>
          </div>
          <p className="mt-2 text-xs text-white/50">{stage.stage_role}</p>
          <p
            className={
              "mt-3 border-t border-white/10 pt-3 text-xs " +
              "italic text-white/40"
            }
          >
            {stage.summary}
          </p>
        </Card>
      ))}
    </div>
  );
}
