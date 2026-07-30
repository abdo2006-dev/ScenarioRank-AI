import { DECISION_MODES } from "../../constants";
import { Card } from "../ui";
import {
  editorButtonFocusClass,
  editorInputClass,
  type DecisionMode,
  type ValidationProps,
} from "./types";

type DecisionOptionsProps = {
  decisionMode: DecisionMode;
  setDecisionMode: (mode: DecisionMode) => void;
  enablePairing: boolean;
  setEnablePairing: (enabled: boolean) => void;
} & ValidationProps;

export function DecisionOptions(props: DecisionOptionsProps) {
  const { decisionMode, setDecisionMode, enablePairing, setEnablePairing, errors, showAllErrors, touched, onFieldBlur } = props;
  const decisionError = showAllErrors || touched.has("decision-mode") ? errors.decisionMode : undefined;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <fieldset>
          <legend className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/50">Decision options</legend>
          <label htmlFor="decision-mode" className="mb-1 block text-sm font-medium">Decision mode</label>
          <select id="decision-mode" name="decision-mode" className={editorInputClass} value={decisionMode}
            aria-invalid={Boolean(decisionError)} aria-describedby={decisionError ? "decision-mode-error" : undefined}
            onBlur={() => onFieldBlur("decision-mode")} onChange={(event) => setDecisionMode(event.target.value as DecisionMode)}>
            {DECISION_MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
          </select>
          {decisionError && <p id="decision-mode-error" className="mt-1 text-xs text-red-300">{decisionError.message}</p>}
        </fieldset>
      </Card>
      <Card>
        <div className="flex gap-4">
          <button id="pairing-switch" type="button" role="switch" aria-checked={enablePairing}
            aria-labelledby="pairing-label" aria-describedby="pairing-description" onClick={() => setEnablePairing(!enablePairing)}
            className={`relative mt-0.5 h-6 w-11 rounded-full ${enablePairing ? "bg-amber-400" : "bg-white/20"} ${editorButtonFocusClass}`}>
            <span aria-hidden="true" className={`absolute top-1 h-4 w-4 rounded-full bg-white ${enablePairing ? "left-6" : "left-1"}`} />
          </button>
          <div>
            <p id="pairing-label" className="text-sm font-semibold">Simulate leadership pairing</p>
            <p id="pairing-description" className="text-xs text-white/50">Find the best pair by testing complementarity, cohesion, and conflict risk.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
