import { motion } from "framer-motion";
import { Trophy, Shield, TrendingUp, Star } from "lucide-react";
import type { DecisionResult } from "@/types/pipeline";

interface Props {
  result: DecisionResult;
}

const modeIcons: Record<string, typeof Trophy> = {
  best_fit: Star,
  lowest_risk: Shield,
  best_outcome: TrendingUp,
};

export default function DecisionHero({ result }: Props) {
  const Icon = modeIcons[result.decision_mode] || Trophy;

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-5xl mx-auto px-6 py-10"
    >
      <div className="glass-card p-8 border-primary/30 glow-primary relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
        <div className="relative space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-2">Recommendation</p>
              <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground">
                {result.recommended_candidate_name}
              </h2>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 shrink-0">
              <Icon className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-primary">{result.final_label}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <span className="text-xs px-3 py-1 rounded-full bg-secondary text-secondary-foreground">
              Scenario: {result.scenario}
            </span>
            <span className="text-xs px-3 py-1 rounded-full bg-secondary text-secondary-foreground">
              Mode: {result.final_label}
            </span>
            <span className="text-xs px-3 py-1 rounded-full bg-secondary text-secondary-foreground">
              Confidence: {Math.round(result.overall_confidence * 100)}%
            </span>
          </div>

          <div className="pt-2">
            <p className="text-sm font-semibold text-foreground mb-1">{result.key_reason}</p>
            <p className="text-sm text-muted-foreground leading-relaxed">{result.executive_interpretation}</p>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
