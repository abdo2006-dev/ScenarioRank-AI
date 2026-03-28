import { motion } from "framer-motion";
import { FileText, Target, AlertTriangle, RefreshCw, Users, Lightbulb } from "lucide-react";

interface Props {
  summary: {
    recommendation: string;
    reason: string;
    trade_off: string;
    opportunity_cost: string;
    adaptability: string;
    alternative: string;
  };
}

const items = [
  { key: "recommendation", icon: Target, label: "Recommendation" },
  { key: "reason", icon: Lightbulb, label: "Key Reason" },
  { key: "trade_off", icon: AlertTriangle, label: "Trade-off" },
  { key: "opportunity_cost", icon: FileText, label: "Opportunity Cost" },
  { key: "adaptability", icon: RefreshCw, label: "Adaptability" },
  { key: "alternative", icon: Users, label: "Alternative" },
] as const;

export default function ExecutiveBrief({ summary }: Props) {
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-5xl mx-auto px-6 py-10 space-y-6"
    >
      <div className="text-center mb-4">
        <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-2">Executive Brief</p>
        <h2 className="text-2xl font-display font-bold text-foreground">Executive Summary</h2>
      </div>

      <div className="glass-card p-6 space-y-5">
        {items.map((item, i) => {
          const Icon = item.icon;
          const text = summary[item.key];
          return (
            <motion.div
              key={item.key}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08 }}
              className="flex gap-3"
            >
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Icon className="w-3.5 h-3.5 text-primary" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-primary font-semibold">{item.label}</p>
                <p className="text-sm text-secondary-foreground leading-relaxed">{text}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
}
