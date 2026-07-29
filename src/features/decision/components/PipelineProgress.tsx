import type { PipelineStage } from "../contracts";
import { Card } from "./ui";

export function PipelineProgress({ stages }: { stages: PipelineStage[] }) {
  if (!stages.length) return null;
  const icon = (status: PipelineStage["status"]) => status === "completed" ? "✓" : status === "running" ? "◌" : status === "failed" ? "✕" : "○";
  const color = (status: PipelineStage["status"]) => status === "completed" ? "text-emerald-400" : status === "running" ? "animate-pulse text-amber-400" : status === "failed" ? "text-red-400" : "text-white/20";
  return <div className="mx-auto max-w-3xl px-6 py-6"><Card><h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-white/60">Decision Pipeline</h3><div className="space-y-2">{stages.map((stage) => <div key={stage.id} className="flex items-center gap-3"><span className={`w-4 text-center font-mono text-sm ${color(stage.status)}`}>{icon(stage.status)}</span><span className={`flex-1 text-sm ${stage.status === "running" ? "text-white" : stage.status === "completed" ? "text-white/60" : "text-white/25"}`}>{stage.label}</span>{stage.duration_ms && <span className="text-xs text-white/30">{(stage.duration_ms / 1000).toFixed(1)}s</span>}</div>)}</div></Card></div>;
}
