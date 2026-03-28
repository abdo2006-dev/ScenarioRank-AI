import { motion } from "framer-motion";
import { TrendingUp, TrendingDown } from "lucide-react";

interface Props {
  gains: string[];
  sacrifices: string[];
}

export default function TradeOffs({ gains, sacrifices }: Props) {
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-5xl mx-auto px-6 py-12 space-y-6"
    >
      <div className="text-center mb-4">
        <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-2">Trade-off Analysis</p>
        <h2 className="text-3xl font-display font-bold text-foreground">What You Gain & Sacrifice</h2>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="glass-card p-6 border border-primary/20">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h3 className="font-display font-semibold text-foreground">What You Gain</h3>
          </div>
          <ul className="space-y-3">
            {gains.map((g, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="text-sm text-secondary-foreground flex gap-2"
              >
                <span className="text-primary mt-0.5">✓</span>
                {g}
              </motion.li>
            ))}
          </ul>
        </div>
        <div className="glass-card p-6 border border-destructive/20">
          <div className="flex items-center gap-2 mb-4">
            <TrendingDown className="w-5 h-5 text-destructive" />
            <h3 className="font-display font-semibold text-foreground">What You Sacrifice</h3>
          </div>
          <ul className="space-y-3">
            {sacrifices.map((s, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="text-sm text-secondary-foreground flex gap-2"
              >
                <span className="text-destructive mt-0.5">✗</span>
                {s}
              </motion.li>
            ))}
          </ul>
        </div>
      </div>
    </motion.section>
  );
}
