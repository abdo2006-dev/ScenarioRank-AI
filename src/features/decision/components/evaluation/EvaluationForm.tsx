import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { CandidateEditor } from "./CandidateEditor";
import { DecisionOptions } from "./DecisionOptions";
import { RoleEditor } from "./RoleEditor";
import { ScenarioEditor } from "./ScenarioEditor";
import type { EvaluationFormProps } from "./types";
import { validateEvaluationDraft } from "../../validation/validateEvaluationDraft";
import type { EvaluationValidationErrors } from "../../validation/validationTypes";

export function EvaluationForm(props: EvaluationFormProps) {
  const [errors, setErrors] = useState<EvaluationValidationErrors>({
    scenarios: {}, candidateNames: {}, candidateDescriptions: {},
  });
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const summaryRef = useRef<HTMLDivElement>(null);
  const validation = useCallback(() => validateEvaluationDraft({
    role: props.role, scenarios: props.scenarios, scenario: props.scenario,
    decisionMode: props.decisionMode, candidates: props.candidates,
    enablePairing: props.enablePairing, maxCandidates: props.maxCandidates,
  }), [props.role, props.scenarios, props.scenario, props.decisionMode,
    props.candidates, props.enablePairing, props.maxCandidates]);

  useEffect(() => {
    setErrors({ scenarios: {}, candidateNames: {}, candidateDescriptions: {} });
    setShowAllErrors(false);
    setTouched(new Set());
  }, [props.validationResetKey]);

  useEffect(() => {
    if (showAllErrors) setErrors(validation().errors);
  }, [showAllErrors, validation]);

  function handleFieldBlur(fieldId: string) {
    setTouched((current) => new Set(current).add(fieldId));
    setErrors(validation().errors);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = validation();
    setErrors(next.errors);
    setShowAllErrors(true);
    if (!next.isValid) {
      window.setTimeout(() => summaryRef.current?.focus(), 0);
      return;
    }
    setShowAllErrors(false);
    props.onRun();
  }

  return (
    <form className="mx-auto max-w-3xl space-y-6 px-6 py-10"
      onSubmit={handleSubmit} noValidate>
      <h2 className="text-xl font-bold">Configure Evaluation</h2>

      {showAllErrors && validation().summary.length > 0 && (
        <div ref={summaryRef} id="evaluation-error-summary" tabIndex={-1}
          role="alert" className="rounded-xl border border-red-400/40 bg-red-400/10 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
          <h3 className="text-sm font-semibold text-red-200">Review the highlighted fields</h3>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-white/80">
            {validation().summary.map((error) => (
              <li key={error.fieldId}>
                <a className="underline decoration-red-300 underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                  href={`#${error.fieldId}`} onClick={(event) => {
                    event.preventDefault();
                    document.getElementById(error.fieldId)?.focus();
                  }}>
                  {error.message}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

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
        errors={errors}
        showAllErrors={showAllErrors}
        touched={touched}
        onFieldBlur={handleFieldBlur}
        scenarioGenerationStatus={props.scenarioGenerationStatus}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <ScenarioEditor
          scenarios={props.scenarios}
          setScenarios={props.setScenarios}
          scenario={props.scenario}
          setScenario={props.setScenario}
          errors={errors}
          showAllErrors={showAllErrors}
          touched={touched}
          onFieldBlur={handleFieldBlur}
        />
      </div>

      <CandidateEditor
        candidates={props.candidates}
        setCandidates={props.setCandidates}
        maxCandidates={props.maxCandidates}
        errors={errors}
        showAllErrors={showAllErrors}
        touched={touched}
        onFieldBlur={handleFieldBlur}
      />

      <DecisionOptions
        decisionMode={props.decisionMode}
        setDecisionMode={props.setDecisionMode}
        enablePairing={props.enablePairing}
        setEnablePairing={props.setEnablePairing}
        errors={errors}
        showAllErrors={showAllErrors}
        touched={touched}
        onFieldBlur={handleFieldBlur}
      />

      <button
        type="submit"
        disabled={props.isRunning || !props.aiEnabled}
        className={
          "w-full rounded-xl bg-amber-400 py-3 text-sm font-bold " +
          "text-black disabled:opacity-50 focus-visible:outline-none " +
          "focus-visible:ring-2 focus-visible:ring-amber-300 " +
          "focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d0f14]"
        }
      >
        {props.isRunning ? "Running Pipeline..." : "▶ Run Decision Pipeline"}
      </button>

      <p className="text-xs text-white/40">
        Add a role, at least one scenario, and at least two complete candidate profiles.
      </p>
    </form>
  );
}
