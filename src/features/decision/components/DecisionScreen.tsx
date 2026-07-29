import { useDecisionEvaluation } from "../hooks/useDecisionEvaluation";
import { ErrorBanner } from "./ErrorBanner";
import { EvaluationForm } from "./evaluation/EvaluationForm";
import { Landing } from "./Landing";
import { PipelineProgress } from "./PipelineProgress";
import { DecisionResults } from "./results/DecisionResults";

export function DecisionScreen() {
  const workflow = useDecisionEvaluation();

  return (
    <div className="min-h-screen bg-[#0d0f14] text-white">
      <header
        className={
          "sticky top-0 z-50 border-b border-white/5 " +
          "bg-[#0d0f14]/80 backdrop-blur-xl"
        }
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">
          <div className="text-base font-bold">
            <span className="text-amber-400">ScenarioRank</span> AI
            <span className="ml-2 text-xs text-white/20">V2</span>
          </div>

          <div className="flex gap-3">
            <a
              href="/demo.html"
              target="_blank"
              rel="noopener noreferrer"
              className={
                "rounded-lg border border-amber-400/30 px-3 py-1.5 " +
                "text-xs text-amber-400"
              }
            >
              System Demo ↗
            </a>

            {workflow.phase !== "landing" && (
              <button
                onClick={() => {
                  workflow.resetInputs();
                  workflow.setPhase("landing");
                }}
                className="text-xs text-white/30"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </header>

      {workflow.error && <ErrorBanner message={workflow.error} />}

      {workflow.phase === "landing" && (
        <Landing onStart={() => workflow.setPhase("eval")} />
      )}

      {(workflow.phase === "eval" || workflow.phase === "running") && (
        <EvaluationForm
          role={workflow.role}
          setRole={workflow.setRole}
          scenarios={workflow.scenarios}
          setScenarios={workflow.setScenarios}
          scenario={workflow.scenario}
          setScenario={workflow.setScenario}
          decisionMode={workflow.decisionMode}
          setDecisionMode={workflow.setDecisionMode}
          candidates={workflow.candidates}
          setCandidates={workflow.setCandidates}
          enablePairing={workflow.enablePairing}
          setEnablePairing={workflow.setEnablePairing}
          onRun={workflow.handleRun}
          isRunning={workflow.phase === "running"}
          onGenerateScenarios={workflow.handleGenerateScenarios}
          isGeneratingScenarios={workflow.isGeneratingScenarios}
          onLoadDefaults={workflow.loadDefaults}
          onResetInputs={workflow.resetInputs}
          aiEnabled={workflow.aiEnabled}
        />
      )}

      <PipelineProgress stages={workflow.stages} />

      {workflow.phase === "results" && workflow.response && (
        <div ref={workflow.resultsRef}>
          <DecisionResults response={workflow.response} />
        </div>
      )}
    </div>
  );
}
