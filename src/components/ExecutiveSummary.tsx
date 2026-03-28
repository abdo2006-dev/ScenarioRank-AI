import { motion } from "framer-motion";
import { FileText, Lightbulb, Scale, UserCheck } from "lucide-react";

interface Props {
  recommendation: string;
  keyReason: string;
  tradeOff: string;
  alternative: string;
}

const items = [
  { icon: UserCheck, label: "Recommendation", key: "recommendation" as const, color: "text-primary" },
  { icon: Lightbulb, label: "Key Reason", key: "keyReason" as const, color: "text-primary" },
  { icon: Scale, label: "Trade-off", key: "tradeOff" as const, color: "text-accent" },
  { icon: FileText, label: "Alternative", key: "alternative" as const, color: "text-muted-foreground" },
];

export default function ExecutiveSummary(props: Props) {
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-5xl mx-auto px-6 py-12 space-y-6"
    >
      <div className="text-center mb-4">
        <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-2">Executive Brief</p>
        <h2 className="text-3xl font-display font-bold text-foreground">Executive Summary</h2>
      </div>
      <div className="glass-card p-8 space-y-6">
        {items.map((item, i) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={item.key}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="flex gap-4"
            >
              <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                <Icon className={`w-5 h-5 ${item.color}`} />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">{item.label}</p>
                <p className="text-secondary-foreground leading-relaxed">{props[item.key]}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
}
