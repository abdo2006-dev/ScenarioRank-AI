import { DECISION_INPUT_LIMITS } from "../../contracts";
import { Card } from "../ui";
import { editorButtonFocusClass, editorInputClass, type ValidationProps } from "./types";

type ScenarioEditorProps = {
  scenarios: string[];
  setScenarios: (scenarios: string[]) => void;
  scenario: string;
  setScenario: (scenario: string) => void;
} & Partial<ValidationProps>;

export function ScenarioEditor(props: ScenarioEditorProps) {
  const { scenarios, setScenarios, scenario, setScenario } = props;
  const errors = props.errors ?? { scenarios: {}, candidateNames: {}, candidateDescriptions: {} };
  const showAllErrors = props.showAllErrors ?? false;
  const touched = props.touched ?? new Set<string>();
  const onFieldBlur = props.onFieldBlur ?? (() => undefined);
  const shouldShow = (fieldId: string) => showAllErrors || touched.has(fieldId);
  const countError = shouldShow("scenario-count") ? errors.scenarioCount : undefined;
  const activeError = shouldShow("active-scenario") ? errors.activeScenario : undefined;
  const updateScenario = (index: number, previousValue: string, value: string) => {
    const next = [...scenarios];
    next[index] = value;
    setScenarios(next);
    if (scenario === previousValue) setScenario(value);
  };
  const removeScenario = (index: number, removedValue: string) => {
    const next = scenarios.filter((_, itemIndex) => itemIndex !== index);
    setScenarios(next);
    if (scenario === removedValue || !next.includes(scenario)) setScenario(next[0] ?? "");
  };

  return <>
    <Card>
      <fieldset>
        <div className="flex items-center justify-between">
          <legend id="scenario-count" className="text-xs font-semibold uppercase tracking-widest text-white/50">
            Scenarios ({scenarios.length} / {DECISION_INPUT_LIMITS.scenarios.max})
          </legend>
          <button type="button" disabled={scenarios.length >= DECISION_INPUT_LIMITS.scenarios.max}
            title={scenarios.length >= DECISION_INPUT_LIMITS.scenarios.max ? `A maximum of ${DECISION_INPUT_LIMITS.scenarios.max} scenarios is allowed.` : undefined}
            onClick={() => setScenarios([...scenarios, ""])}
            className={`text-xs text-amber-400 disabled:cursor-not-allowed disabled:opacity-50 ${editorButtonFocusClass}`}>
            + Add Scenario
          </button>
        </div>
        {countError && <p className="mt-1 text-xs text-red-300">{countError.message}</p>}
        <div className="mt-3 space-y-2">
          {scenarios.map((item, index) => {
            const fieldId = `scenario-${index}`;
            const error = shouldShow(fieldId) ? errors.scenarios[index] : undefined;
            return <div key={index} className="flex gap-2">
              <div className="flex-1">
                <label htmlFor={fieldId} className="mb-1 block text-sm font-medium">Scenario {index + 1}</label>
                <input id={fieldId} name={fieldId} placeholder={`Scenario ${index + 1}`} className={editorInputClass} value={item} aria-invalid={Boolean(error)}
                  aria-describedby={`${fieldId}-help${error ? ` ${fieldId}-error` : ""}`}
                  onBlur={() => onFieldBlur(fieldId)} onChange={(event) => updateScenario(index, item, event.target.value)} />
                <p id={`${fieldId}-help`} aria-live={item.trim().length >= DECISION_INPUT_LIMITS.scenario.max - 100 ? "polite" : undefined} className="mt-1 text-xs text-white/50">
                  {item.trim().length.toLocaleString()} / {DECISION_INPUT_LIMITS.scenario.max.toLocaleString()} characters
                </p>
                {error && <p id={`${fieldId}-error`} className="mt-1 text-xs text-red-300">{error.message}</p>}
              </div>
              <button type="button" disabled={scenarios.length <= DECISION_INPUT_LIMITS.scenarios.min}
                onClick={() => removeScenario(index, item)}
                className={`mt-7 px-2 text-xs text-white/50 disabled:cursor-not-allowed disabled:opacity-30 ${editorButtonFocusClass}`}
                aria-label={`Remove scenario ${index + 1}`}>✕</button>
            </div>;
          })}
        </div>
      </fieldset>
    </Card>
    <Card>
      <label htmlFor="active-scenario" className="mb-2 block text-xs font-semibold uppercase tracking-widest text-white/50">Active scenario</label>
      <select id="active-scenario" name="active-scenario" className={editorInputClass} value={scenario} aria-invalid={Boolean(activeError)}
        aria-describedby={activeError ? "active-scenario-error" : undefined} onBlur={() => onFieldBlur("active-scenario")}
        onChange={(event) => setScenario(event.target.value)}>
        {scenarios.length === 0 && <option value="">No scenarios yet</option>}
        {scenarios.map((item, index) => <option key={index} value={item}>{item || `Scenario ${index + 1}`}</option>)}
      </select>
      {activeError && <p id="active-scenario-error" className="mt-1 text-xs text-red-300">{activeError.message}</p>}
    </Card>
  </>;
}
