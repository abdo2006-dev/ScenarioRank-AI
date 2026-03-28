import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Zap, GitCompare, AlertTriangle, Brain } from "lucide-react";

interface Props {
  onStart: () => void;
}

const bullets = [
  { icon: GitCompare, text: "Compare candidates across scenarios" },
  { icon: AlertTriangle, text: "Reveal trade-offs and risk" },
  { icon: Brain, text: "Support decisions with transparent reasoning" },
];

export default function LandingSection({ onStart }: Props) {
  return (
    <section className="min-h-screen flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="text-center max-w-3xl"
      >
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary text-sm font-medium mb-8">
          <Zap className="w-4 h-4" />
          Decision Intelligence Platform — v3
        </div>
        <h1 className="text-5xl md:text-7xl font-bold font-display tracking-tight mb-6">
          <span className="text-gradient-primary">ScenarioRank</span>{" "}
          <span className="text-foreground">AI</span>
        </h1>
        <p className="text-xl md:text-2xl text-muted-foreground font-light mb-4">
          Leadership decision intelligence for scenario-based ranking
        </p>
        <p className="text-muted-foreground max-w-xl mx-auto mb-10 leading-relaxed">
          Rank leadership candidates based on scenario, risk, and expected
          organizational outcome. Powered by a multi-agent reasoning pipeline with
          full transparency.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
          {bullets.map((b, i) => {
            const Icon = b.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + i * 0.12 }}
                className="flex items-center gap-2 text-sm text-secondary-foreground"
              >
                <Icon className="w-4 h-4 text-primary" />
                {b.text}
              </motion.div>
            );
          })}
        </div>

        <Button
          onClick={onStart}
          size="lg"
          className="bg-primary text-primary-foreground hover:bg-primary/90 text-lg px-10 py-6 rounded-xl glow-primary font-display font-semibold"
        >
          Start Evaluation
        </Button>
      </motion.div>
    </section>
  );
}
