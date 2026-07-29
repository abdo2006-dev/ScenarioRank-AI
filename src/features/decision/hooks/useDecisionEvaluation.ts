import { useCallback, useEffect, useRef, useState } from "react";
import {
  generateScenarios,
  getHealth,
  runEvaluation,
  SafeDecisionClientError,
} from "../api/decisionApi";
import {
  DEFAULT_CANDIDATES,
  DEFAULT_ROLE,
  DEFAULT_SCENARIOS,
  INITIAL_STAGES,
  PIPELINE_TIMEOUT_MS,
  SCENARIO_TIMEOUT_MS,
} from "../constants";
import type {
  CandidateInput,
  EvaluationRequest,
  PipelineResponse,
  PipelineStage,
} from "../contracts";
import { DEFAULT_RUNTIME_MAX_CANDIDATES } from "../../../../shared/contracts/decisionInputLimits.js";

export type DecisionPhase = "landing" | "eval" | "running" | "results";

export function useDecisionEvaluation() {
  const [phase, setPhase] = useState<DecisionPhase>("landing");
  const [role, setRole] = useState({ ...DEFAULT_ROLE });
  const [scenarios, setScenarios] = useState([...DEFAULT_SCENARIOS]);
  const [scenario, setScenario] = useState(DEFAULT_SCENARIOS[0]);
  const [decisionMode, setDecisionMode] =
    useState<EvaluationRequest["decision_mode"]>("best_fit");
  const [candidates, setCandidates] = useState<CandidateInput[]>(
    DEFAULT_CANDIDATES.map((candidate) => ({ ...candidate })),
  );
  const [enablePairing, setEnablePairing] = useState(false);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [response, setResponse] = useState<PipelineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [maxCandidates, setMaxCandidates] = useState(
    DEFAULT_RUNTIME_MAX_CANDIDATES,
  );
  const [isGeneratingScenarios, setIsGeneratingScenarios] = useState(false);
  const [scenarioGenerationStatus, setScenarioGenerationStatus] = useState("");
  const [validationResetKey, setValidationResetKey] = useState(0);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void getHealth().then((health) => {
      setAiEnabled(health?.ai_enabled ?? false);
      if (health) setMaxCandidates(health.limits.max_candidates);
    });
  }, []);

  useEffect(() => {
    if (!scenario || !scenarios.includes(scenario)) {
      setScenario(scenarios[0] ?? "");
    }
  }, [scenario, scenarios]);

  const resetInputs = useCallback(() => {
    setRole({ title: "", description: "" });
    setScenarios([]);
    setScenario("");
    setCandidates([]);
    setEnablePairing(false);
    setResponse(null);
    setStages([]);
    setError(null);
    setScenarioGenerationStatus("");
    setValidationResetKey((key) => key + 1);
    setPhase("eval");
  }, []);

  const loadDefaults = useCallback(() => {
    setRole({ ...DEFAULT_ROLE });
    setScenarios([...DEFAULT_SCENARIOS]);
    setScenario(DEFAULT_SCENARIOS[0]);
    setCandidates(
      DEFAULT_CANDIDATES.map((candidate) => ({ ...candidate })),
    );
    setEnablePairing(false);
    setResponse(null);
    setStages([]);
    setError(null);
    setScenarioGenerationStatus("");
    setValidationResetKey((key) => key + 1);
    setPhase("eval");
  }, []);

  const handleGenerateScenarios = useCallback(async () => {
    if (!role.title.trim() || !role.description.trim()) {
      setError("Enter a role title and description first.");
      setScenarioGenerationStatus(
        "Scenario generation needs a role title and description.",
      );
      return;
    }

    setIsGeneratingScenarios(true);
    setError(null);

    try {
      const result = await generateScenarios(
        { title: role.title, description: role.description },
        SCENARIO_TIMEOUT_MS,
      );
      setScenarios(result.scenarios);
      setScenario(result.scenarios[0]);
      setScenarioGenerationStatus(
        result.source === "fallback"
          ? "Scenario suggestions are ready using fallback examples."
          : "Scenario suggestions are ready.",
      );
    } catch (caught) {
      const message =
        caught instanceof SafeDecisionClientError
          ? caught.message
          : "Scenario generation failed. Please try again.";
      setError(message);
      setScenarioGenerationStatus(
        "Scenario generation failed. You can add scenarios manually.",
      );
    } finally {
      setIsGeneratingScenarios(false);
    }
  }, [role]);

  const handleRun = useCallback(async () => {
    setPhase("running");
    setResponse(null);
    setError(null);

    const initialStages = INITIAL_STAGES.filter(
      (stage) => enablePairing || stage.id !== "pairing",
    ).map((stage) => ({ ...stage }));
    setStages(initialStages);

    try {
      const result = await runEvaluation(
        {
          role,
          scenario,
          decision_mode: decisionMode,
          candidates,
          options: { enable_pair_simulation: enablePairing },
        },
        setStages,
        PIPELINE_TIMEOUT_MS,
      );

      setResponse(result);
      setPhase("results");
      window.setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 200);
    } catch (caught) {
      const message =
        caught instanceof SafeDecisionClientError
          ? caught.message
          : "The evaluation connection failed. Please try again.";
      setError(message);
      setPhase("eval");
    }
  }, [role, scenario, decisionMode, candidates, enablePairing]);

  return {
    phase,
    setPhase,
    role,
    setRole,
    scenarios,
    setScenarios,
    scenario,
    setScenario,
    decisionMode,
    setDecisionMode,
    candidates,
    setCandidates,
    enablePairing,
    setEnablePairing,
    stages,
    response,
    error,
    aiEnabled,
    maxCandidates,
    isGeneratingScenarios,
    scenarioGenerationStatus,
    validationResetKey,
    resultsRef,
    resetInputs,
    loadDefaults,
    handleGenerateScenarios,
    handleRun,
  };
}
