import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, AlertTriangle, Zap, RefreshCw } from "lucide-react";
import type { TradeOffCard } from "@/types/pipeline";

interface Props {
  tradeOffs: TradeOffCard[];
}

const typeConfig = {
  gain: { icon: TrendingUp, color: "text-emerald-400", border: "border-emerald-400/20", bg: "bg-emerald-400/5" },
  sacrifice: { icon: TrendingDown, color: "text-amber-400", border: "border-amber-400/20", bg: "bg-amber-400/5" },
  opportunity_cost: { icon: Zap, color: "text-accent", border: "border-accent/20", bg: "bg-accent/5" },
  risk: { icon: AlertTriangle, color: "text-destructive", border: "border-destructive/20", bg: "bg-destructive/5" },
  adaptability: { icon: RefreshCw, color: "text-primary", border: "border-primary/20", bg: "bg-primary/5" },
};

export default function TradeOffsSection({ tradeOffs }: Props) {
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-5xl mx-auto px-6 py-10 space-y-6"
    >
      <div className="text-center mb-4">
        <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-2">Trade-Off Analysis</p>
        <h2 className="text-2xl font-display font-bold text-foreground">Trade-offs & Opportunity Cost</h2>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {tradeOffs.map((t, i) => {
          const cfg = typeConfig[t.type] || typeConfig.risk;
          const Icon = cfg.icon;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className={`glass-card p-5 border ${cfg.border} ${cfg.bg}`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cfg.bg}`}>
                  <Icon className={`w-4 h-4 ${cfg.color}`} />
                </div>
                <div>
                  <h4 className={`font-display font-semibold text-sm ${cfg.color}`}>{t.title}</h4>
                  <p className="text-xs text-secondary-foreground mt-1 leading-relaxed">{t.description}</p>
                  {t.severity && (
                    <span className={`inline-block mt-2 text-[10px] px-2 py-0.5 rounded-full ${
                      t.severity === "high" ? "bg-destructive/10 text-destructive" :
                      t.severity === "medium" ? "bg-amber-400/10 text-amber-400" :
                      "bg-emerald-400/10 text-emerald-400"
                    }`}>
                      {t.severity} severity
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
}
