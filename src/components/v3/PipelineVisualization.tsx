import { motion } from "framer-motion";
import { Check, Loader2, Circle, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import type { PipelineStage } from "@/types/pipeline";

interface Props {
  stages: PipelineStage[];
  visible: boolean;
}

const statusConfig = {
  pending: { icon: Circle, color: "text-muted-foreground", bg: "bg-muted" },
  running: { icon: Loader2, color: "text-primary", bg: "bg-primary/20" },
  completed: { icon: Check, color: "text-emerald-400", bg: "bg-emerald-400/20" },
  failed: { icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/20" },
};

export default function PipelineVisualization({ stages, visible }: Props) {
  const [expandedStage, setExpandedStage] = useState<string | null>(null);

  if (!visible) return null;

  const completedCount = stages.filter(s => s.status === "completed").length;
  const progress = stages.length > 0 ? (completedCount / stages.length) * 100 : 0;

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-5xl mx-auto px-6 py-10"
    >
      <div className="text-center mb-6">
        <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-2">Pipeline Execution</p>
        <h2 className="text-2xl font-display font-bold text-foreground">Decision Pipeline</h2>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-secondary rounded-full mb-8 overflow-hidden">
        <motion.div
          className="h-full bg-primary rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>

      <div className="relative space-y-0">
        {stages.map((stage, i) => {
          const cfg = statusConfig[stage.status];
          const Icon = cfg.icon;
          const isExpanded = expandedStage === stage.id;
          const isLast = i === stages.length - 1;

          return (
            <motion.div
              key={stage.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex gap-4"
            >
              {/* Timeline line + dot */}
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full ${cfg.bg} flex items-center justify-center shrink-0`}>
                  <Icon className={`w-4 h-4 ${cfg.color} ${stage.status === "running" ? "animate-spin" : ""}`} />
                </div>
                {!isLast && (
                  <div className={`w-px flex-1 min-h-[24px] ${stage.status === "completed" ? "bg-emerald-400/30" : "bg-border"}`} />
                )}
              </div>

              {/* Content */}
              <div className={`flex-1 pb-4 ${isLast ? "" : ""}`}>
                <div
                  className="flex items-center gap-2 cursor-pointer group"
                  onClick={() => setExpandedStage(isExpanded ? null : stage.id)}
                >
                  <p className={`font-display font-semibold text-sm ${stage.status === "completed" ? "text-foreground" : stage.status === "running" ? "text-primary" : "text-muted-foreground"}`}>
                    {stage.label}
                  </p>
                  {stage.duration_ms && (
                    <span className="text-[10px] text-muted-foreground">{(stage.duration_ms / 1000).toFixed(1)}s</span>
                  )}
                  {stage.summary && (
                    isExpanded
                      ? <ChevronUp className="w-3 h-3 text-muted-foreground" />
                      : <ChevronDown className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>
                {isExpanded && stage.summary && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="mt-2 glass-card p-3"
                  >
                    <p className="text-xs text-secondary-foreground">{stage.summary}</p>
                    {stage.warnings && stage.warnings.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {stage.warnings.map((w, wi) => (
                          <p key={wi} className="text-xs text-amber-400 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> {w}
                          </p>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
}
