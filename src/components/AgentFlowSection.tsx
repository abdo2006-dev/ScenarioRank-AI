import { motion } from "framer-motion";
import { Target, Layers, Users, GitCompare, Brain, ArrowRight } from "lucide-react";

const agents = [
  { name: "Role Agent", desc: "Defines criteria & base weights", icon: Target, color: "text-primary", input: "Role definition", output: "7 criteria + weights" },
  { name: "Scenario Agent", desc: "Applies scenario adjustments", icon: Layers, color: "text-accent", input: "Base weights + scenario", output: "Normalized weights" },
  { name: "Candidate Agent", desc: "Loads candidate profiles", icon: Users, color: "text-primary", input: "8 candidate profiles", output: "Score matrices" },
  { name: "Comparative Agent", desc: "Cross-scenario analysis", icon: GitCompare, color: "text-accent", input: "All scenario results", output: "Robustness & volatility" },
  { name: "Decision Agent", desc: "Final ranking & summary", icon: Brain, color: "text-primary", input: "Weighted scores + metrics", output: "Executive recommendation" },
];

export default function AgentFlowSection() {
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-5xl mx-auto px-6 py-12 space-y-8"
    >
      <div className="text-center mb-4">
        <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-2">Multi-Agent Pipeline</p>
        <h2 className="text-3xl font-display font-bold text-foreground">Agent Flow</h2>
      </div>

      <div className="flex flex-col lg:flex-row items-center justify-center gap-3">
        {agents.map((a, i) => {
          const Icon = a.icon;
          return (
            <div key={i} className="flex items-center gap-3">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.12 }}
                className="glass-card p-4 text-center w-40"
              >
                <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center mx-auto mb-2">
                  <Icon className={`w-4 h-4 ${a.color}`} />
                </div>
                <h4 className="font-display font-semibold text-xs text-foreground">{a.name}</h4>
                <p className="text-[10px] text-muted-foreground mt-1">{a.desc}</p>
                <div className="mt-2 space-y-1">
                  <p className="text-[9px] text-primary">IN: {a.input}</p>
                  <p className="text-[9px] text-accent">OUT: {a.output}</p>
                </div>
              </motion.div>
              {i < agents.length - 1 && (
                <ArrowRight className="w-4 h-4 text-muted-foreground hidden lg:block" />
              )}
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}
