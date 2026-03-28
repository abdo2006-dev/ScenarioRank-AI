import { motion } from "framer-motion";
import { AdvancedMetrics, ScenarioResult } from "@/data/dataset";
import { Shield, Zap, ArrowUpDown } from "lucide-react";

interface Props {
  allResults: ScenarioResult[];
  metrics: AdvancedMetrics;
}

export default function ScenarioComparison({ allResults, metrics }: Props) {
  const mostRobust = metrics.robustness[0];
  const mostVolatile = metrics.volatility[0];
  const mover = metrics.biggestMover;

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-5xl mx-auto px-6 py-12 space-y-8"
    >
      <div className="text-center mb-4">
        <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-2">Cross-Scenario Intelligence</p>
        <h2 className="text-3xl font-display font-bold text-foreground">Scenario Comparison</h2>
      </div>

      {/* Scenario winners table */}
      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left p-4 text-muted-foreground font-medium">Scenario</th>
              <th className="p-4 text-center text-muted-foreground font-medium">Winner</th>
              <th className="p-4 text-center text-muted-foreground font-medium">Score</th>
              <th className="p-4 text-center text-muted-foreground font-medium">Archetype</th>
            </tr>
          </thead>
          <tbody>
            {allResults.map((sr, i) => {
              const winner = sr.ranked[0];
              return (
                <tr key={i} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="p-4 font-display font-semibold text-foreground">{sr.scenarioName}</td>
                  <td className="p-4 text-center text-primary font-semibold">{winner.name}</td>
                  <td className="p-4 text-center text-secondary-foreground">{winner.totalScore.toFixed(2)}</td>
                  <td className="p-4 text-center text-muted-foreground">{winner.archetype}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Insight cards */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className="glass-card p-6 border border-primary/20">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-5 h-5 text-primary" />
            <p className="text-xs uppercase tracking-widest text-primary font-semibold">Most Robust</p>
          </div>
          <h3 className="font-display font-bold text-xl text-foreground">{mostRobust.name}</h3>
          <p className="text-sm text-muted-foreground">{mostRobust.archetype}</p>
          <p className="text-2xl font-display font-bold text-primary mt-2">{mostRobust.avgScore.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">avg across all scenarios</p>
        </div>
        <div className="glass-card p-6 border border-accent/20">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-5 h-5 text-accent" />
            <p className="text-xs uppercase tracking-widest text-accent font-semibold">Most Volatile</p>
          </div>
          <h3 className="font-display font-bold text-xl text-foreground">{mostVolatile.name}</h3>
          <p className="text-sm text-muted-foreground">{mostVolatile.archetype}</p>
          <p className="text-2xl font-display font-bold text-accent mt-2">±{mostVolatile.volatility.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">score range across scenarios</p>
        </div>
        <div className="glass-card p-6 border border-border">
          <div className="flex items-center gap-2 mb-3">
            <ArrowUpDown className="w-5 h-5 text-muted-foreground" />
            <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Biggest Mover</p>
          </div>
          <h3 className="font-display font-bold text-xl text-foreground">{mover.name}</h3>
          <p className="text-sm text-muted-foreground">{mover.archetype}</p>
          <p className="text-2xl font-display font-bold text-foreground mt-2">{mover.maxRankChange} ranks</p>
          <p className="text-xs text-muted-foreground">from {mover.bestScenario} to {mover.worstScenario}</p>
        </div>
      </div>
    </motion.section>
  );
}
