import { motion } from "framer-motion";
import { Users, Percent, Shield, AlertTriangle, Zap } from "lucide-react";
import type { PairingResult } from "@/types/pipeline";

interface Props {
  result?: PairingResult;
}

export default function PairSimulationSection({ result }: Props) {
  if (!result) return null;

  const bp = result.best_pair;
  const metrics = [
    { label: "Pair Score", value: bp.pair_score.toFixed(1), icon: Zap },
    { label: "Coverage", value: `${Math.round(bp.scenario_coverage * 100)}%`, icon: Percent },
    { label: "Complementarity", value: `${Math.round(bp.complementarity * 100)}%`, icon: Users },
    { label: "Overlap Risk", value: `${Math.round(bp.overlap_risk * 100)}%`, icon: AlertTriangle },
    { label: "Conflict Risk", value: `${Math.round(bp.conflict_risk * 100)}%`, icon: AlertTriangle },
    { label: "Cohesion", value: `${Math.round(bp.execution_cohesion * 100)}%`, icon: Shield },
  ];

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-5xl mx-auto px-6 py-10 space-y-6"
    >
      <div className="text-center mb-4">
        <p className="text-xs uppercase tracking-widest text-accent font-semibold mb-2">Pair Analysis</p>
        <h2 className="text-2xl font-display font-bold text-foreground">Leadership Pair Simulation</h2>
      </div>

      {/* Best pair hero */}
      <div className="glass-card p-6 border-accent/30 glow-accent">
        <div className="flex items-center gap-3 mb-4">
          <Users className="w-5 h-5 text-accent" />
          <h3 className="font-display font-bold text-lg text-foreground">
            {bp.pair[0]} + {bp.pair[1]}
          </h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent">Best Pair</span>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-4">
          {metrics.map(m => {
            const Icon = m.icon;
            return (
              <div key={m.label} className="bg-secondary/50 rounded-lg p-3 text-center">
                <Icon className="w-3 h-3 text-muted-foreground mx-auto mb-1" />
                <p className="text-[10px] text-muted-foreground">{m.label}</p>
                <p className="font-display font-bold text-sm text-foreground">{m.value}</p>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-secondary-foreground leading-relaxed">{bp.explanation}</p>
      </div>

      {/* Top pairs table */}
      {result.top_pairs.length > 1 && (
        <div className="glass-card p-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-3">Top Pairs</p>
          <div className="space-y-2">
            {result.top_pairs.map((p, i) => (
              <div key={i} className="flex items-center justify-between bg-secondary/30 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-primary">#{i + 1}</span>
                  <span className="text-sm text-foreground">{p.pair[0]} + {p.pair[1]}</span>
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>Score: <strong className="text-foreground">{p.pair_score.toFixed(1)}</strong></span>
                  <span>Comp: <strong className="text-foreground">{Math.round(p.complementarity * 100)}%</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.section>
  );
}
