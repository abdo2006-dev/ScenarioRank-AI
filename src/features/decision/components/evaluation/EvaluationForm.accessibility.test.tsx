import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CANDIDATES, DEFAULT_ROLE, DEFAULT_SCENARIOS } from "../../constants";
import { DECISION_INPUT_LIMITS } from "../../contracts";
import { EvaluationForm } from "./EvaluationForm";

type DraftProps = { onRun?: () => void; empty?: boolean; incompleteCandidate?: boolean };

function FormHarness({ onRun = vi.fn(), empty = false, incompleteCandidate = false }: DraftProps) {
  const [role, setRole] = useState(empty ? { title: "", description: "" } : { ...DEFAULT_ROLE });
  const [scenarios, setScenarios] = useState(empty ? [] : [...DEFAULT_SCENARIOS]);
  const [scenario, setScenario] = useState(empty ? "" : DEFAULT_SCENARIOS[0]);
  const [candidates, setCandidates] = useState(() => (empty ? [] : DEFAULT_CANDIDATES.slice(0, 2).map((candidate, index) => ({
    ...candidate, description: incompleteCandidate && index === 0 ? "" : candidate.description,
  }))));
  const [pairing, setPairing] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  return <EvaluationForm role={role} setRole={setRole} scenarios={scenarios} setScenarios={setScenarios}
    scenario={scenario} setScenario={setScenario} decisionMode="best_fit" setDecisionMode={() => undefined}
    candidates={candidates} setCandidates={setCandidates} enablePairing={pairing} setEnablePairing={setPairing}
    onRun={onRun} isRunning={false} onGenerateScenarios={() => undefined} isGeneratingScenarios={false}
    onLoadDefaults={() => {
      setRole({ ...DEFAULT_ROLE }); setScenarios([...DEFAULT_SCENARIOS]);
      setScenario(DEFAULT_SCENARIOS[0]); setCandidates(DEFAULT_CANDIDATES.slice(0, 2));
      setResetKey((key) => key + 1);
    }}
    onResetInputs={() => { setRole({ title: "", description: "" }); setScenarios([]); setScenario(""); setCandidates([]); setResetKey((key) => key + 1); }}
    aiEnabled maxCandidates={2} validationResetKey={resetKey} scenarioGenerationStatus="" />;
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: /run decision pipeline/i }));
}

describe("EvaluationForm accessibility", () => {
  it("labels every visible form control and exposes pairing semantics", () => {
    render(<FormHarness />);
    expect(screen.getByLabelText("Role title")).toBeInTheDocument();
    expect(screen.getByLabelText("Role description")).toBeInTheDocument();
    expect(screen.getByLabelText("Scenario 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Active scenario")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Candidate name")).toHaveLength(2);
    expect(screen.getAllByLabelText("Candidate description")).toHaveLength(2);
    const pairing = screen.getByRole("switch", { name: /simulate leadership pairing/i });
    expect(pairing).toHaveAttribute("aria-describedby", "pairing-description");
    expect(pairing).toHaveAttribute("aria-checked", "false");
  });

  it("blocks invalid submit and focuses the error summary", async () => {
    const onRun = vi.fn();
    render(<FormHarness empty onRun={onRun} />);
    submit();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
    expect(onRun).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Role title")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Role title")).toHaveAttribute("aria-describedby", expect.stringContaining("role-title-error"));
  });

  it("submits valid drafts exactly once and permits duplicate names", () => {
    const onRun = vi.fn();
    render(<FormHarness onRun={onRun} />);
    const names = screen.getAllByLabelText("Candidate name");
    fireEvent.change(names[1], { target: { value: names[0].getAttribute("value") } });
    submit();
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it("focuses every summary target, including count sections", async () => {
    const { rerender } = render(<FormHarness empty />);
    submit();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("link", { name: "Enter a role title." }));
    expect(screen.getByLabelText("Role title")).toHaveFocus();
    fireEvent.click(screen.getByRole("link", { name: /add at least two candidates/i }));
    expect(document.getElementById("candidate-count")).toHaveFocus();
    fireEvent.click(screen.getByRole("link", { name: /add between 1 and 5 scenarios/i }));
    expect(document.getElementById("scenario-count")).toHaveFocus();
    rerender(<FormHarness key="incomplete-candidate" incompleteCandidate />);
    submit();
    await waitFor(() => expect(screen.getByRole("link", { name: "Candidate description is required." })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("link", { name: "Candidate description is required." }));
    expect(screen.getAllByLabelText("Candidate description")[0]).toHaveFocus();
  });

  it("uses shared counters and explains reached add limits", () => {
    render(<FormHarness />);
    expect(document.getElementById("role-title-help")).toHaveTextContent(
      DECISION_INPUT_LIMITS.roleTitle.max.toLocaleString(),
    );
    expect(screen.getByRole("button", { name: /add$/i })).toBeDisabled();
    expect(screen.getByText(/maximum candidate limit reached/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add scenario/i })).toBeDisabled();
    expect(screen.getByText(/maximum scenario limit reached/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove alexandra chen/i })).toBeDisabled();
  });

  it("uses direct legends for named role, scenario, and candidate fieldsets", () => {
    render(<FormHarness />);
    expect(screen.getByRole("group", { name: "Role" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /scenarios/i })).toHaveAttribute("id", "scenario-count");
    expect(screen.getByRole("group", { name: /candidates/i })).toHaveAttribute("id", "candidate-count");
  });
});
