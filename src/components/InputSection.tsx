import { motion } from "framer-motion";
import { dataset, getScenarioWeights } from "@/data/dataset";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { User } from "lucide-react";

interface Props {
  scenarioIndex: number;
  onScenarioChange: (i: number) => void;
  onRank: () => void;
}

export default function InputSection({ scenarioIndex, onScenarioChange, onRank }: Props) {
  const weights = getScenarioWeights(scenarioIndex);

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="max-w-5xl mx-auto px-6 py-12 space-y-10"
    >
      {/* Role */}
      <div className="glass-card p-6">
        <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-2">Role</p>
        <h2 className="text-2xl font-display font-bold text-foreground">{dataset.role.title}</h2>
        <p className="text-muted-foreground mt-2">{dataset.role.description}</p>
      </div>

      {/* Scenario Selector */}
      <div className="glass-card p-6">
        <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-4">Select Scenario</p>
        <Select
          value={String(scenarioIndex)}
          onValueChange={(v) => onScenarioChange(Number(v))}
        >
          <SelectTrigger className="w-full max-w-sm bg-secondary border-border text-foreground">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {dataset.scenarioAdjustments.map((s, i) => (
              <SelectItem key={i} value={String(i)}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex flex-wrap gap-2 mt-4">
          {dataset.criteria.map((c) => (
            <span key={c.key} className="text-xs px-3 py-1 rounded-full bg-secondary text-secondary-foreground">
              {c.label}: {weights[c.key].toFixed(1)}%
            </span>
          ))}
        </div>
      </div>

      {/* Candidate Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {dataset.candidates.map((c, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass-card p-4 space-y-2"
          >
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <User className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h3 className="font-display font-semibold text-sm text-foreground">{c.name}</h3>
                <p className="text-xs text-primary">{c.archetype}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {dataset.criteria.map((cr) => (
                <span key={cr.key} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  {cr.label.split(" ")[0]}: {c.scores[cr.key as keyof typeof c.scores]}
                </span>
              ))}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="text-center">
        <Button
          onClick={onRank}
          size="lg"
          className="bg-primary text-primary-foreground hover:bg-primary/90 px-12 py-6 text-lg rounded-xl glow-primary font-display font-semibold"
        >
          Rank Candidates
        </Button>
      </div>
    </motion.section>
  );
}
