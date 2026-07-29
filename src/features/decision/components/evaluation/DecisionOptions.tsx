import { DECISION_MODES } from "../../constants";
import { Card } from "../ui";
import {
  editorInputClass,
  type DecisionMode,
} from "./types";

type DecisionOptionsProps = {
  decisionMode: DecisionMode;
  setDecisionMode: (mode: DecisionMode) => void;
  enablePairing: boolean;
  setEnablePairing: (enabled: boolean) => void;
};

export function DecisionOptions({
  decisionMode,
  setDecisionMode,
  enablePairing,
  setEnablePairing,
}: DecisionOptionsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-white/50">
          Decision Mode
        </label>
        <select
          className={editorInputClass}
          value={decisionMode}
          onChange={(event) => {
            setDecisionMode(event.target.value as DecisionMode);
          }}
        >
          {DECISION_MODES.map((mode) => (
            <option key={mode.value} value={mode.value}>
              {mode.label}
            </option>
          ))}
        </select>
      </Card>

      <Card>
        <div className="flex gap-4">
          <button
            type="button"
            role="switch"
            aria-checked={enablePairing}
            onClick={() => setEnablePairing(!enablePairing)}
            className={
              "relative mt-0.5 h-6 w-11 rounded-full " +
              (enablePairing ? "bg-amber-400" : "bg-white/20")
            }
          >
            <span
              className={
                "absolute top-1 h-4 w-4 rounded-full bg-white " +
                (enablePairing ? "left-6" : "left-1")
              }
            />
          </button>
          <div>
            <div className="text-sm font-semibold">
              Simulate leadership pairing
            </div>
            <p className="text-xs text-white/50">
              Find the best pair by testing complementarity, cohesion, and
              conflict risk.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
