import { Card } from "../ui";
import { editorInputClass, type Role } from "./types";

type RoleEditorProps = {
  role: Role;
  setRole: (role: Role) => void;
  onGenerateScenarios: () => void;
  isGeneratingScenarios: boolean;
  onLoadDefaults: () => void;
  onResetInputs: () => void;
  aiEnabled: boolean;
};

export function RoleEditor({
  role,
  setRole,
  onGenerateScenarios,
  isGeneratingScenarios,
  onLoadDefaults,
  onResetInputs,
  aiEnabled,
}: RoleEditorProps) {
  const generationDisabled =
    isGeneratingScenarios ||
    !role.title.trim() ||
    !role.description.trim() ||
    !aiEnabled;

  return (
    <Card>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-xs font-semibold uppercase tracking-widest text-white/50">
            Role
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onGenerateScenarios}
              disabled={generationDisabled}
              className={
                "rounded-lg bg-blue-400/15 px-3 py-1.5 text-xs " +
                "font-semibold text-blue-300 disabled:opacity-40"
              }
            >
              {isGeneratingScenarios ? "Generating..." : "Generate Scenarios"}
            </button>
            <button
              type="button"
              onClick={onLoadDefaults}
              className={
                "rounded-lg bg-amber-400 px-3 py-1.5 " +
                "text-xs font-semibold text-black"
              }
            >
              Default Entries
            </button>
            <button
              type="button"
              onClick={onResetInputs}
              className={
                "rounded-lg bg-white/10 px-3 py-1.5 " +
                "text-xs font-semibold"
              }
            >
              Reset
            </button>
          </div>
        </div>

        <input
          className={editorInputClass}
          placeholder="Role title (e.g. VP of Product)"
          value={role.title}
          onChange={(event) => {
            setRole({ ...role, title: event.target.value });
          }}
        />
        <textarea
          className={`${editorInputClass} resize-none`}
          rows={3}
          placeholder="Role description — context, responsibilities, must-haves..."
          value={role.description}
          onChange={(event) => {
            setRole({ ...role, description: event.target.value });
          }}
        />
      </div>
    </Card>
  );
}
