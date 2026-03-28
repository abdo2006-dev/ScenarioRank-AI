import { motion } from "framer-motion";
import { ShieldAlert, Eye, AlertTriangle, UserCheck } from "lucide-react";
import type { BiasConfidenceReview } from "@/types/pipeline";

interface Props {
  reviews: BiasConfidenceReview[];
}

export default function BiasConfidenceSection({ reviews }: Props) {
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-5xl mx-auto px-6 py-10 space-y-6"
    >
      <div className="text-center mb-4">
        <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-2">Transparency</p>
        <h2 className="text-2xl font-display font-bold text-foreground">Bias & Confidence Review</h2>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {reviews.map(r => (
          <div key={r.candidate_id} className="glass-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold text-sm text-foreground">{r.candidate_name}</h3>
              <span className="text-xs px-2 py-1 rounded-full bg-secondary text-secondary-foreground">
                Confidence: {Math.round(r.overall_confidence * 100)}%
              </span>
            </div>

            {/* Low confidence criteria */}
            {r.low_confidence_criteria.length > 0 && (
              <div className="bg-amber-400/5 border border-amber-400/20 rounded-lg p-3">
                <p className="text-[10px] uppercase text-amber-400 font-semibold mb-1 flex items-center gap-1">
                  <Eye className="w-3 h-3" /> Low-Confidence Criteria
                </p>
                <p className="text-xs text-secondary-foreground">
                  {r.low_confidence_criteria.join(", ")}
                </p>
              </div>
            )}

            {/* Bias flags */}
            {r.bias_flags.length > 0 && r.bias_flags.map((f, i) => (
              <div key={i} className={`rounded-lg p-3 border ${
                f.severity === "high" ? "bg-destructive/5 border-destructive/20" :
                f.severity === "medium" ? "bg-amber-400/5 border-amber-400/20" :
                "bg-secondary/50 border-border"
              }`}>
                <p className={`text-[10px] uppercase font-semibold mb-1 flex items-center gap-1 ${
                  f.severity === "high" ? "text-destructive" :
                  f.severity === "medium" ? "text-amber-400" : "text-muted-foreground"
                }`}>
                  <AlertTriangle className="w-3 h-3" /> {f.type}
                </p>
                <p className="text-xs text-secondary-foreground">{f.description}</p>
              </div>
            ))}

            {/* Weak evidence */}
            {r.weak_evidence_flags.length > 0 && (
              <div className="bg-secondary/50 rounded-lg p-3">
                <p className="text-[10px] uppercase text-muted-foreground font-semibold mb-1 flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3" /> Weak Evidence
                </p>
                {r.weak_evidence_flags.map((f, i) => (
                  <p key={i} className="text-xs text-secondary-foreground">• {f}</p>
                ))}
              </div>
            )}

            {/* Recommendations */}
            <div className="flex gap-2">
              {r.recommend_human_review && (
                <span className="text-[10px] px-2 py-1 rounded-full bg-amber-400/10 text-amber-400 flex items-center gap-1">
                  <UserCheck className="w-3 h-3" /> Human Review Recommended
                </span>
              )}
              {r.recommend_rescore && (
                <span className="text-[10px] px-2 py-1 rounded-full bg-destructive/10 text-destructive">
                  Rescore Recommended
                </span>
              )}
              {!r.recommend_human_review && !r.recommend_rescore && r.bias_flags.length === 0 && (
                <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-400/10 text-emerald-400">
                  No significant flags
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </motion.section>
  );
}
