import { motion } from "framer-motion";
import { MessageSquare } from "lucide-react";

interface Props {
  lines: string[];
}

export default function ExplanationSection({ lines }: Props) {
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-5xl mx-auto px-6 py-16 space-y-6"
    >
      <div className="text-center mb-4">
        <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-2">Analysis</p>
        <h2 className="text-3xl font-display font-bold text-foreground">Why This Ranking?</h2>
      </div>

      <div className="glass-card p-8 space-y-4">
        {lines.map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.12 }}
            className="flex gap-3"
          >
            <MessageSquare className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <p className="text-secondary-foreground leading-relaxed">{line}</p>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}
