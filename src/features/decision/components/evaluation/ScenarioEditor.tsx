import { Card } from "../ui";
import { editorInputClass } from "./types";

type ScenarioEditorProps = {
  scenarios: string[];
  setScenarios: (scenarios: string[]) => void;
  scenario: string;
  setScenario: (scenario: string) => void;
};

export function ScenarioEditor({
  scenarios,
  setScenarios,
  scenario,
  setScenario,
}: ScenarioEditorProps) {
  function updateScenario(index: number, previousValue: string, value: string) {
    const next = [...scenarios];
    next[index] = value;
    setScenarios(next);

    if (scenario === previousValue) {
      setScenario(value);
    }
  }

  function removeScenario(index: number, removedValue: string) {
    const next = scenarios.filter((_, itemIndex) => itemIndex !== index);
    setScenarios(next);

    if (scenario === removedValue || !next.includes(scenario)) {
      setScenario(next[0] ?? "");
    }
  }

  return (
    <>
      <Card>
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-widest text-white/50">
            Scenarios ({scenarios.length})
          </label>
          <button
            type="button"
            onClick={() => setScenarios([...scenarios, ""])}
            className="text-xs text-amber-400"
          >
            + Add Scenario
          </button>
        </div>

        <div className="mt-3 space-y-2">
          {scenarios.map((item, index) => (
            <div key={`${index}-${item}`} className="flex gap-2">
              <input
                className={editorInputClass}
                value={item}
                placeholder={`Scenario ${index + 1}`}
                onChange={(event) => {
                  updateScenario(index, item, event.target.value);
                }}
              />
              <button
                type="button"
                onClick={() => removeScenario(index, item)}
                className="px-2 text-xs text-white/30"
                aria-label={`Remove scenario ${index + 1}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-white/50">
          Active Scenario
        </label>
        <select
          className={editorInputClass}
          value={scenario}
          onChange={(event) => setScenario(event.target.value)}
        >
          {scenarios.length === 0 && <option value="">No scenarios yet</option>}
          {scenarios.map((item, index) => (
            <option key={`${index}-${item}`} value={item}>
              {item || `Scenario ${index + 1}`}
            </option>
          ))}
        </select>
      </Card>
    </>
  );
}
