import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ScenarioEditor } from "./ScenarioEditor";

function ScenarioEditorHarness() {
  const [scenarios, setScenarios] = useState(["Initial scenario"]);
  const [scenario, setScenario] = useState(scenarios[0]);

  return (
    <ScenarioEditor
      scenarios={scenarios}
      setScenarios={setScenarios}
      scenario={scenario}
      setScenario={setScenario}
    />
  );
}

describe("ScenarioEditor", () => {
  it("keeps the edited scenario input mounted while typing", () => {
    render(<ScenarioEditorHarness />);
    const input = screen.getByPlaceholderText("Scenario 1");

    input.focus();
    fireEvent.change(input, {
      target: {
        value: "Initial scenario A",
      },
    });
    fireEvent.change(input, {
      target: {
        value: "Initial scenario AB",
      },
    });

    expect(screen.getByPlaceholderText("Scenario 1")).toBe(input);
    expect(document.activeElement).toBe(input);
  });
});
