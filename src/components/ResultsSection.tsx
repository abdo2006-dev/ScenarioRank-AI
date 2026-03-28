import { motion } from "framer-motion";
import { RankedCandidate } from "@/data/dataset";
import { Trophy, Medal, Award } from "lucide-react";

interface Props {
  ranked: RankedCandidate[];
  scenarioName: string;
}

const rankConfig = [
  { icon: Trophy, color: "text-primary", bg: "bg-primary/10", border: "border-primary/30", glow: "glow-primary" },
  { icon: Medal, color: "text-accent", bg: "bg-accent/10", border: "border-accent/30", glow: "" },
  { icon: Award, color: "text-muted-foreground", bg: "bg-muted", border: "border-border", glow: "" },
];

export default function ResultsSection({ ranked, scenarioName }: Props) {
  const top3 = ranked.slice(0, 3);

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-5xl mx-auto px-6 py-12 space-y-8"
    >
      <div className="text-center mb-6">
        <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-2">Top Ranking</p>
        <h2 className="text-3xl font-display font-bold text-foreground">
          Under <span className="text-gradient-primary">{scenarioName}</span>
        </h2>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {top3.map((c, i) => {
          const cfg = rankConfig[i];
          const Icon = cfg.icon;
          return (
            <motion.div
              key={c.name}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.15 }}
              className={`glass-card p-6 border ${cfg.border} ${cfg.glow} ${i === 0 ? "md:scale-105 md:-translate-y-2" : ""} transition-transform`}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-12 h-12 rounded-xl ${cfg.bg} flex items-center justify-center`}>
                  <Icon className={`w-6 h-6 ${cfg.color}`} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">#{c.rank}</p>
                  <h3 className="font-display font-bold text-lg text-foreground">{c.name}</h3>
                  <p className={`text-xs ${cfg.color}`}>{c.archetype}</p>
                </div>
              </div>
              <div className={`text-3xl font-display font-bold ${cfg.color} mb-2`}>
                {c.totalScore.toFixed(2)}
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
}
