import { motion } from "framer-motion";
import { Trophy, Medal } from "lucide-react";
import type { CandidateEvaluation } from "@/types/pipeline";

interface Props {
  evaluations: CandidateEvaluation[];
}

export default function CandidateRanking({ evaluations }: Props) {
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-5xl mx-auto px-6 py-10 space-y-6"
    >
      <div className="text-center mb-4">
        <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-2">Ranking</p>
        <h2 className="text-2xl font-display font-bold text-foreground">Candidate Rankings</h2>
      </div>

      <div className="grid gap-3">
        {evaluations.map((ev, i) => (
          <motion.div
            key={ev.candidate_id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className={`glass-card p-5 ${i === 0 ? "border-primary/40 glow-primary" : ""}`}
          >
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                i === 0 ? "bg-primary/20" : i === 1 ? "bg-accent/20" : "bg-secondary"
              }`}>
                {i === 0 ? <Trophy className="w-5 h-5 text-primary" /> :
                 i <= 2 ? <Medal className="w-5 h-5 text-accent" /> :
                 <span className="text-sm font-bold text-muted-foreground">#{ev.rank}</span>}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-display font-bold text-foreground">{ev.candidate_name}</h3>
                  {ev.strategic_labels.map(l => (
                    <span key={l} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">{l}</span>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {ev.winner_reason || ev.trade_off_note || ""}
                </p>
              </div>

              <div className="hidden sm:grid grid-cols-3 gap-4 text-center shrink-0">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Fit</p>
                  <p className="font-display font-bold text-foreground">{ev.weighted_fit_score.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Risk-Adj</p>
                  <p className="font-display font-bold text-foreground">{ev.risk_adjusted_score.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Outcome</p>
                  <p className="font-display font-bold text-foreground">{ev.expected_outcome_score.toFixed(2)}</p>
                </div>
              </div>

              <div className="text-right shrink-0">
                <p className="text-[10px] text-muted-foreground">Confidence</p>
                <p className="font-display font-bold text-primary">{Math.round(ev.overall_confidence * 100)}%</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}
