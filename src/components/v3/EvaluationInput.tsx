import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Copy, RotateCcw, ChevronDown, ChevronUp, Play, User } from "lucide-react";
import type { CandidateInput } from "@/types/pipeline";
import { DEFAULT_ROLE, SCENARIOS, DECISION_MODES, SAMPLE_CANDIDATES } from "@/data/mockData";

interface Props {
  roleTitle: string;
  roleDescription: string;
  scenario: string;
  decisionMode: string;
  candidates: CandidateInput[];
  enablePairing: boolean;
  isRunning: boolean;
  onRoleTitleChange: (v: string) => void;
  onRoleDescriptionChange: (v: string) => void;
  onScenarioChange: (v: string) => void;
  onDecisionModeChange: (v: string) => void;
  onCandidatesChange: (c: CandidateInput[]) => void;
  onPairingChange: (v: boolean) => void;
  onRun: () => void;
}

export default function EvaluationInput({
  roleTitle, roleDescription, scenario, decisionMode, candidates,
  enablePairing, isRunning,
  onRoleTitleChange, onRoleDescriptionChange, onScenarioChange,
  onDecisionModeChange, onCandidatesChange, onPairingChange, onRun,
}: Props) {
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set(candidates.map(c => c.id)));

  const toggleExpand = (id: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const addCandidate = () => {
    const id = crypto.randomUUID().slice(0, 8);
    const newC: CandidateInput = { id, name: `Candidate ${candidates.length + 1}`, description: "" };
    onCandidatesChange([...candidates, newC]);
    setExpandedCards(prev => new Set(prev).add(id));
  };

  const removeCandidate = (id: string) => {
    if (candidates.length <= 2) return;
    onCandidatesChange(candidates.filter(c => c.id !== id));
  };

  const duplicateCandidate = (c: CandidateInput) => {
    const id = crypto.randomUUID().slice(0, 8);
    onCandidatesChange([...candidates, { ...c, id, name: `${c.name} (Copy)` }]);
  };

  const updateCandidate = (id: string, field: keyof CandidateInput, value: string) => {
    onCandidatesChange(candidates.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const resetToSample = () => {
    onCandidatesChange(SAMPLE_CANDIDATES.map(c => ({ ...c })));
    setExpandedCards(new Set(SAMPLE_CANDIDATES.map(c => c.id)));
  };

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-5xl mx-auto px-6 py-10 space-y-8"
    >
      {/* Role */}
      <div className="glass-card p-6 space-y-4">
        <p className="text-xs uppercase tracking-widest text-primary font-semibold">Role Definition</p>
        <Input
          value={roleTitle}
          onChange={e => onRoleTitleChange(e.target.value)}
          placeholder="Role title"
          className="bg-secondary border-border text-foreground font-display font-semibold text-lg"
        />
        <Textarea
          value={roleDescription}
          onChange={e => onRoleDescriptionChange(e.target.value)}
          placeholder="Role description…"
          rows={3}
          className="bg-secondary border-border text-secondary-foreground resize-none"
        />
      </div>

      {/* Scenario + Mode */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="glass-card p-6 space-y-3">
          <p className="text-xs uppercase tracking-widest text-primary font-semibold">Scenario</p>
          <Select value={scenario} onValueChange={onScenarioChange}>
            <SelectTrigger className="bg-secondary border-border text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCENARIOS.map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="glass-card p-6 space-y-3">
          <p className="text-xs uppercase tracking-widest text-primary font-semibold">Decision Mode</p>
          <div className="flex gap-1 bg-secondary rounded-lg p-1">
            {DECISION_MODES.map(m => (
              <button
                key={m.value}
                onClick={() => onDecisionModeChange(m.value)}
                className={`flex-1 text-xs py-2 px-2 rounded-md font-medium transition-all ${
                  decisionMode === m.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Candidates */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-widest text-primary font-semibold">
            Candidates ({candidates.length})
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={resetToSample} className="text-xs text-muted-foreground">
              <RotateCcw className="w-3 h-3 mr-1" /> Reset to Sample
            </Button>
            <Button variant="outline" size="sm" onClick={addCandidate} className="text-xs">
              <Plus className="w-3 h-3 mr-1" /> Add Candidate
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {candidates.map(c => {
              const isExpanded = expandedCards.has(c.id);
              return (
                <motion.div
                  key={c.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="glass-card overflow-hidden"
                >
                  <div
                    className="flex items-center gap-3 p-4 cursor-pointer hover:bg-secondary/30 transition-colors"
                    onClick={() => toggleExpand(c.id)}
                  >
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-display font-semibold text-sm text-foreground truncate">{c.name}</p>
                      {c.source && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">{c.source}</span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground">{c.description.length} chars</span>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: "auto" }}
                        exit={{ height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 space-y-3">
                          <Input
                            value={c.name}
                            onChange={e => updateCandidate(c.id, "name", e.target.value)}
                            placeholder="Candidate name"
                            className="bg-secondary border-border text-foreground text-sm"
                          />
                          <Textarea
                            value={c.description}
                            onChange={e => updateCandidate(c.id, "description", e.target.value)}
                            placeholder="Candidate description…"
                            rows={3}
                            className="bg-secondary border-border text-secondary-foreground text-sm resize-none"
                          />
                          <div className="flex items-center gap-2">
                            <Input
                              value={c.source || ""}
                              onChange={e => updateCandidate(c.id, "source", e.target.value)}
                              placeholder="Source (optional)"
                              className="bg-secondary border-border text-foreground text-xs flex-1"
                            />
                            <Button variant="ghost" size="icon" onClick={() => duplicateCandidate(c)} className="shrink-0">
                              <Copy className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeCandidate(c.id)}
                              disabled={candidates.length <= 2}
                              className="shrink-0 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* Pair toggle */}
      <div className="glass-card p-5 flex items-center justify-between">
        <div>
          <p className="text-sm font-display font-semibold text-foreground">Leadership Pair Simulation</p>
          <p className="text-xs text-muted-foreground mt-0.5">Also simulate the strongest leadership pair for this scenario</p>
        </div>
        <Switch checked={enablePairing} onCheckedChange={onPairingChange} />
      </div>

      {/* Run button */}
      <div className="text-center pt-2">
        <Button
          onClick={onRun}
          disabled={isRunning || candidates.length < 2}
          size="lg"
          className="bg-primary text-primary-foreground hover:bg-primary/90 px-12 py-6 text-lg rounded-xl glow-primary font-display font-semibold"
        >
          {isRunning ? (
            <span className="flex items-center gap-2">
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full" />
              Running Pipeline…
            </span>
          ) : (
            <span className="flex items-center gap-2"><Play className="w-5 h-5" /> Run Decision Pipeline</span>
          )}
        </Button>
      </div>
    </motion.section>
  );
}
