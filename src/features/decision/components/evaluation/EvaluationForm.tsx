import { CandidateEditor } from "./CandidateEditor";
import { DecisionOptions } from "./DecisionOptions";
import { RoleEditor } from "./RoleEditor";
import { ScenarioEditor } from "./ScenarioEditor";
import type { EvaluationFormProps } from "./types";

export function EvaluationForm(props: EvaluationFormProps) {
  const candidatesAreComplete = props.candidates.every(
    (candidate) =>
      candidate.name.trim().length > 0 &&
      candidate.description.trim().length > 0,
  );
  const canRun = Boolean(
    props.role.title.trim() &&
      props.role.description.trim() &&
      props.scenario.trim() &&
      props.candidates.length >= 2 &&
      candidatesAreComplete,
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <h2 className="text-xl font-bold">Configure Evaluation</h2>

      {!props.aiEnabled && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-5">
          <p className="text-sm font-semibold text-amber-200">
            AI generation is unavailable in this environment.
          </p>
          <p className="mt-1 text-xs text-white/60">
            You can still use Default Entries or add scenarios and candidates
            manually.
          </p>
        </div>
      )}

      <RoleEditor
        role={props.role}
        setRole={props.setRole}
        onGenerateScenarios={props.onGenerateScenarios}
        isGeneratingScenarios={props.isGeneratingScenarios}
        onLoadDefaults={props.onLoadDefaults}
        onResetInputs={props.onResetInputs}
        aiEnabled={props.aiEnabled}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <ScenarioEditor
          scenarios={props.scenarios}
          setScenarios={props.setScenarios}
          scenario={props.scenario}
          setScenario={props.setScenario}
        />
      </div>

      <CandidateEditor
        candidates={props.candidates}
        setCandidates={props.setCandidates}
      />

      <DecisionOptions
        decisionMode={props.decisionMode}
        setDecisionMode={props.setDecisionMode}
        enablePairing={props.enablePairing}
        setEnablePairing={props.setEnablePairing}
      />

      <button
        onClick={props.onRun}
        disabled={props.isRunning || !canRun || !props.aiEnabled}
        className={
          "w-full rounded-xl bg-amber-400 py-3 text-sm font-bold " +
          "text-black disabled:opacity-50"
        }
      >
        {props.isRunning ? "Running Pipeline..." : "▶ Run Decision Pipeline"}
      </button>

      {!canRun && (
        <p className="text-xs text-white/40">
          Add a role, at least one scenario, and at least two complete
          candidate profiles.
        </p>
      )}
    </div>
  );
}
