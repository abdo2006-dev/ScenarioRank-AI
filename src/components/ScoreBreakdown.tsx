import { motion } from "framer-motion";
import { dataset, RankedCandidate, getScenarioWeights } from "@/data/dataset";

interface Props {
  ranked: RankedCandidate[];
  scenarioIndex: number;
}

export default function ScoreBreakdown({ ranked, scenarioIndex }: Props) {
  const weights = getScenarioWeights(scenarioIndex);

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-5xl mx-auto px-6 py-12 space-y-8"
    >
      <div className="text-center mb-4">
        <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-2">Explainability</p>
        <h2 className="text-3xl font-display font-bold text-foreground">Score Breakdown</h2>
      </div>

      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left p-3 text-muted-foreground font-medium">Candidate</th>
              {dataset.criteria.map((c) => (
                <th key={c.key} className="p-3 text-center text-muted-foreground font-medium">
                  <div className="text-xs">{c.label.split(" ")[0]}</div>
                  <div className="text-[10px] text-primary mt-0.5">{weights[c.key].toFixed(1)}%</div>
                </th>
              ))}
              <th className="p-3 text-center text-primary font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((c, i) => (
              <tr key={c.name} className={`border-b border-border/50 ${i === 0 ? "bg-primary/5" : ""}`}>
                <td className="p-3 font-display font-semibold text-foreground whitespace-nowrap">
                  <span className="mr-2 text-muted-foreground">#{c.rank}</span>
                  {c.name}
                </td>
                {dataset.criteria.map((cr) => (
                  <td key={cr.key} className="p-3 text-center text-secondary-foreground text-xs">
                    <div>{c.scores[cr.key]}×{weights[cr.key].toFixed(0)}%</div>
                    <div className="text-[10px] text-muted-foreground">={c.weightedScores[cr.key].toFixed(2)}</div>
                  </td>
                ))}
                <td className={`p-3 text-center font-bold font-display ${i === 0 ? "text-primary" : "text-foreground"}`}>
                  {c.totalScore.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.section>
  );
}
