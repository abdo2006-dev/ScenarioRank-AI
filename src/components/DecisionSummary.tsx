import { motion } from "framer-motion";
import { RankedCandidate } from "@/data/dataset";
import { Crown } from "lucide-react";

interface Props {
  winner: RankedCandidate;
  scenarioName: string;
}

export default function DecisionSummary({ winner, scenarioName }: Props) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-5xl mx-auto px-6 pt-10 pb-6"
    >
      <div className="glass-card p-8 glow-primary border border-primary/30 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative flex flex-col md:flex-row items-start md:items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
            <Crown className="w-8 h-8 text-primary" />
          </div>
          <div className="flex-1 space-y-1">
            <p className="text-xs uppercase tracking-widest text-primary font-semibold">Recommended Candidate</p>
            <h2 className="text-3xl font-display font-bold text-foreground">{winner.name}</h2>
            <p className="text-muted-foreground">{winner.archetype} • {scenarioName}</p>
          </div>
          <div className="text-right">
            <p className="text-4xl font-display font-bold text-gradient-primary">{winner.totalScore.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-1">Weighted Score</p>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
