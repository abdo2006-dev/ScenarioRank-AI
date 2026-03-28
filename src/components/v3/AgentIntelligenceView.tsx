import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, Target, Layers, Users, Eye, TrendingUp, GitCompare, ChevronDown, ChevronUp } from "lucide-react";
import type { AgentOutput } from "@/types/pipeline";

interface Props {
  agents: AgentOutput[];
}

const agentIcons: Record<string, typeof Brain> = {
  "Role Agent": Target,
  "Scenario Agent": Layers,
  "Candidate Scoring Agent": Users,
  "Bias & Confidence Agent": Eye,
  "Outcome Modeling Agent": TrendingUp,
  "Decision Agent": Brain,
  "Pairing Agent": GitCompare,
};

export default function AgentIntelligenceView({ agents }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-5xl mx-auto px-6 py-10 space-y-6"
    >
      <div className="text-center mb-4">
        <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-2">System Architecture</p>
        <h2 className="text-2xl font-display font-bold text-foreground">How the Decision Was Built</h2>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((a, i) => {
          const Icon = agentIcons[a.agent_name] || Brain;
          const isOpen = expanded === a.agent_name;
          return (
            <motion.div
              key={a.agent_name}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="glass-card overflow-hidden"
            >
              <div
                className="p-4 cursor-pointer hover:bg-secondary/20 transition-colors"
                onClick={() => setExpanded(isOpen ? null : a.agent_name)}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-display font-semibold text-xs text-foreground">{a.agent_name}</h4>
                    <p className="text-[10px] text-muted-foreground">{a.agent_role}</p>
                  </div>
                  {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                </div>
                <p className="text-[11px] text-secondary-foreground line-clamp-2">{a.summary}</p>
              </div>

              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: "auto" }}
                    exit={{ height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">
                      <div>
                        <p className="text-[10px] uppercase text-primary font-semibold mb-1">Inputs</p>
                        {a.inputs.map((inp, j) => (
                          <p key={j} className="text-[11px] text-secondary-foreground">• {inp}</p>
                        ))}
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-accent font-semibold mb-1">Outputs</p>
                        {a.outputs.map((out, j) => (
                          <p key={j} className="text-[11px] text-secondary-foreground">• {out}</p>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
}
