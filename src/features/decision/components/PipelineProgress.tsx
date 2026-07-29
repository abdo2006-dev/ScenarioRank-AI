import type { PipelineStage } from "../contracts";
import { Card } from "./ui";

function statusIcon(status: PipelineStage["status"]) {
  if (status === "completed") return "✓";
  if (status === "running") return "◌";
  if (status === "failed") return "✕";
  return "○";
}

function statusColor(status: PipelineStage["status"]) {
  if (status === "completed") return "text-emerald-400";
  if (status === "running") return "animate-pulse motion-reduce:animate-none text-amber-400";
  if (status === "failed") return "text-red-400";
  return "text-white/20";
}

function labelColor(status: PipelineStage["status"]) {
  if (status === "running") return "text-white";
  if (status === "completed") return "text-white/60";
  return "text-white/25";
}

export function PipelineProgress({ stages }: { stages: PipelineStage[] }) {
  if (!stages.length) return null;

  return (
    <div className="mx-auto max-w-3xl px-6 py-6" aria-labelledby="pipeline-progress-heading">
      <Card>
        <h3 id="pipeline-progress-heading" className="mb-4 text-sm font-semibold uppercase tracking-widest text-white/60">
          Decision Pipeline
        </h3>

        <div className="space-y-2" role="status" aria-live="polite" aria-atomic="false">
          {stages.map((stage) => (
            <div key={stage.id} className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className={
                  `w-4 text-center font-mono text-sm ${statusColor(stage.status)}`
                }
              >
                {statusIcon(stage.status)}
              </span>
              <span className={`flex-1 text-sm ${labelColor(stage.status)}`}>
                {stage.label}
              </span>
              {stage.duration_ms !== undefined && (
                <span className="text-xs text-white/30">
                  {(stage.duration_ms / 1000).toFixed(1)}s
                </span>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
