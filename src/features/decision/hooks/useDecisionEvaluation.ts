import { useCallback, useEffect, useRef, useState } from "react";
import { getAiEnabled, generateScenarios, runEvaluation } from "../api/decisionApi";
import { DEFAULT_CANDIDATES, DEFAULT_ROLE, DEFAULT_SCENARIOS, INITIAL_STAGES, PIPELINE_TIMEOUT_MS, SCENARIO_TIMEOUT_MS } from "../constants";
import type { CandidateInput, EvaluationRequest, PipelineResponse, PipelineStage } from "../contracts";

export type DecisionPhase = "landing" | "eval" | "running" | "results";

export function useDecisionEvaluation() {
  const [phase, setPhase] = useState<DecisionPhase>("landing");
  const [role, setRole] = useState({ ...DEFAULT_ROLE });
  const [scenarios, setScenarios] = useState<string[]>([...DEFAULT_SCENARIOS]);
  const [scenario, setScenario] = useState(DEFAULT_SCENARIOS[0]);
  const [decisionMode, setDecisionMode] = useState<EvaluationRequest["decision_mode"]>("best_fit");
  const [candidates, setCandidates] = useState<CandidateInput[]>(DEFAULT_CANDIDATES.map((candidate) => ({ ...candidate })));
  const [enablePairing, setEnablePairing] = useState(false);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [response, setResponse] = useState<PipelineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [isGeneratingScenarios, setIsGeneratingScenarios] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => { void getAiEnabled().then(setAiEnabled); }, []);
  useEffect(() => { if (!scenario || !scenarios.includes(scenario)) setScenario(scenarios[0] || ""); }, [scenario, scenarios]);

  const resetInputs = useCallback(() => {
    setRole({ title: "", description: "" }); setScenarios([]); setScenario(""); setCandidates([]);
    setEnablePairing(false); setResponse(null); setStages([]); setError(null); setPhase("eval");
  }, []);
  const loadDefaults = useCallback(() => {
    setRole({ ...DEFAULT_ROLE }); setScenarios([...DEFAULT_SCENARIOS]); setScenario(DEFAULT_SCENARIOS[0]);
    setCandidates(DEFAULT_CANDIDATES.map((candidate) => ({ ...candidate }))); setEnablePairing(false);
    setResponse(null); setStages([]); setError(null); setPhase("eval");
  }, []);
  const handleGenerateScenarios = useCallback(async () => {
    if (!role.title.trim() || !role.description.trim()) { setError("Enter a role title and description first."); return; }
    setIsGeneratingScenarios(true); setError(null);
    try {
      const result = await generateScenarios({ title: role.title, description: role.description }, SCENARIO_TIMEOUT_MS);
      setScenarios(result.scenarios); setScenario(result.scenarios[0]);
    } catch (error) { setError(error instanceof Error ? error.message : "Scenario generation failed."); }
    finally { setIsGeneratingScenarios(false); }
  }, [role]);
  const handleRun = useCallback(async () => {
    setPhase("running"); setResponse(null); setError(null);
    setStages(INITIAL_STAGES.filter((stage) => enablePairing || stage.id !== "pairing").map((stage) => ({ ...stage })));
    try {
      const result = await runEvaluation({ role, scenario, decision_mode: decisionMode, candidates, options: { enable_pair_simulation: enablePairing } }, setStages, PIPELINE_TIMEOUT_MS);
      setResponse(result); setPhase("results"); window.setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 200);
    } catch (error) { setError(error instanceof Error ? error.message : "Pipeline failed. Please try again."); setPhase("eval"); }
  }, [role, scenario, decisionMode, candidates, enablePairing]);

  return {
    phase, setPhase, role, setRole, scenarios, setScenarios, scenario, setScenario, decisionMode, setDecisionMode,
    candidates, setCandidates, enablePairing, setEnablePairing, stages, response, error, aiEnabled,
    isGeneratingScenarios, resultsRef, resetInputs, loadDefaults, handleGenerateScenarios, handleRun,
  };
}
