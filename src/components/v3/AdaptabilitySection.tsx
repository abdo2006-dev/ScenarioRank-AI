import { motion } from "framer-motion";
import { RefreshCw, Shield, AlertTriangle } from "lucide-react";
import type { AdaptabilityProfile } from "@/types/pipeline";

interface Props {
  profiles: AdaptabilityProfile[];
}

export default function AdaptabilitySection({ profiles }: Props) {
  if (profiles.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-5xl mx-auto px-6 py-10 space-y-6"
    >
      <div className="text-center mb-4">
        <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-2">Scenario Resilience</p>
        <h2 className="text-2xl font-display font-bold text-foreground">If Conditions Change</h2>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {profiles.map((p, i) => (
          <motion.div
            key={p.candidate_name}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className={`glass-card p-5 ${i === 0 ? "border-primary/30" : ""}`}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-semibold text-sm text-foreground">{p.candidate_name}</h3>
              <div className="flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 text-primary" />
                <span className="font-display font-bold text-primary">{Math.round(p.adaptability_score * 100)}%</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-emerald-400/5 border border-emerald-400/10 rounded-lg p-2 text-center">
                <p className="text-[10px] text-emerald-400 uppercase">Best In</p>
                <p className="text-xs font-medium text-foreground">{p.best_scenario}</p>
              </div>
              <div className="bg-amber-400/5 border border-amber-400/10 rounded-lg p-2 text-center">
                <p className="text-[10px] text-amber-400 uppercase">Weakest In</p>
                <p className="text-xs font-medium text-foreground">{p.worst_scenario}</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed flex items-start gap-1.5">
              {p.adaptability_score >= 0.7
                ? <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                : <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />}
              {p.resilience_note}
            </p>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}
