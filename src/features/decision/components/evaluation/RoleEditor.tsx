import { DECISION_INPUT_LIMITS } from "../../contracts";
import { Card } from "../ui";
import {
  editorButtonFocusClass,
  editorInputClass,
  type Role,
  type ValidationProps,
} from "./types";

type RoleEditorProps = {
  role: Role;
  setRole: (role: Role) => void;
  onGenerateScenarios: () => void;
  isGeneratingScenarios: boolean;
  onLoadDefaults: () => void;
  onResetInputs: () => void;
  aiEnabled: boolean;
  scenarioGenerationStatus: string;
} & ValidationProps;

export function RoleEditor(props: RoleEditorProps) {
  const { role, setRole, onGenerateScenarios, isGeneratingScenarios, onLoadDefaults,
    onResetInputs, aiEnabled, scenarioGenerationStatus, errors, showAllErrors,
    touched, onFieldBlur } = props;
  const canShow = (fieldId: string) => showAllErrors || touched.has(fieldId);
  const titleError = canShow("role-title") ? errors.roleTitle : undefined;
  const descriptionError = canShow("role-description") ? errors.roleDescription : undefined;
  const generationDisabled = isGeneratingScenarios || !role.title.trim() || !role.description.trim() || !aiEnabled;

  return (
    <Card>
      <fieldset className="space-y-3" aria-busy={isGeneratingScenarios}>
        <legend className="text-xs font-semibold uppercase tracking-widest text-white/50">
          Role
        </legend>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onGenerateScenarios} disabled={generationDisabled}
              className={`rounded-lg bg-blue-400/15 px-3 py-1.5 text-xs font-semibold text-blue-300 disabled:opacity-40 ${editorButtonFocusClass}`}>
              {isGeneratingScenarios ? "Generating..." : "Generate Scenarios"}
            </button>
            <button type="button" onClick={onLoadDefaults}
              className={`rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-black ${editorButtonFocusClass}`}>Default Entries</button>
            <button type="button" onClick={onResetInputs}
              className={`rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold ${editorButtonFocusClass}`}>Reset</button>
          </div>
        </div>
        <div>
          <label htmlFor="role-title" className="mb-1 block text-sm font-medium">Role title</label>
          <input id="role-title" name="role-title" className={editorInputClass} value={role.title}
            aria-invalid={Boolean(titleError)} aria-describedby={`role-title-help${titleError ? " role-title-error" : ""}`}
            onBlur={() => onFieldBlur("role-title")} onChange={(event) => setRole({ ...role, title: event.target.value })} />
          <p id="role-title-help" className="mt-1 text-xs text-white/50">
            {role.title.trim().length.toLocaleString()} / {DECISION_INPUT_LIMITS.roleTitle.max.toLocaleString()} characters
          </p>
          {titleError && <p id="role-title-error" className="mt-1 text-xs text-red-300">{titleError.message}</p>}
        </div>
        <div>
          <label htmlFor="role-description" className="mb-1 block text-sm font-medium">Role description</label>
          <textarea id="role-description" name="role-description" className={`${editorInputClass} resize-none`} rows={3} value={role.description}
            aria-invalid={Boolean(descriptionError)} aria-describedby={`role-description-help${descriptionError ? " role-description-error" : ""}`}
            onBlur={() => onFieldBlur("role-description")} onChange={(event) => setRole({ ...role, description: event.target.value })} />
          <p id="role-description-help"
            aria-live={role.description.trim().length >= DECISION_INPUT_LIMITS.roleDescription.max - 100 ? "polite" : undefined}
            className="mt-1 text-xs text-white/50">
            {role.description.trim().length.toLocaleString()} / {DECISION_INPUT_LIMITS.roleDescription.max.toLocaleString()} characters
          </p>
          {descriptionError && <p id="role-description-error" className="mt-1 text-xs text-red-300">{descriptionError.message}</p>}
        </div>
        <p aria-live="polite" className="sr-only">{scenarioGenerationStatus}</p>
      </fieldset>
    </Card>
  );
}
