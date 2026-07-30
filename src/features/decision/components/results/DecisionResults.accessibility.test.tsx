import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { pipelineResponseFixture, successfulPairingFixture } from "../../test/fixtures";
import { DecisionResults } from "./DecisionResults";

describe("DecisionResults accessibility", () => {
  it("uses a complete roving-tab pattern and focuses results on mount", () => {
    render(<DecisionResults response={pipelineResponseFixture({ pairing_result: successfulPairingFixture() })} />);
    expect(screen.getByRole("heading", { name: /decision results/i })).toHaveFocus();
    const tabs = screen.getAllByRole("tab");
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(tabs.filter((tab) => tab.getAttribute("tabindex") === "0")).toHaveLength(1);
    expect(tabs.filter((tab) => tab.getAttribute("tabindex") === "-1")).toHaveLength(tabs.length - 1);
    const overview = screen.getByRole("tab", { name: "Overview" });
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("aria-labelledby", overview.id);
    expect(overview).toHaveAttribute("aria-controls", panel.id);
  });

  it("selects, focuses, wraps, and updates aria-selected with Arrow/Home/End", () => {
    render(<DecisionResults response={pipelineResponseFixture({ pairing_result: successfulPairingFixture() })} />);
    const overview = screen.getByRole("tab", { name: "Overview" });
    const pipeline = screen.getByRole("tab", { name: "Pipeline" });
    overview.focus();
    fireEvent.keyDown(overview, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Candidates" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Candidates" })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Candidates" }), { key: "ArrowLeft" });
    expect(overview).toHaveFocus();
    fireEvent.keyDown(overview, { key: "ArrowLeft" });
    expect(pipeline).toHaveFocus();
    fireEvent.keyDown(pipeline, { key: "Home" });
    expect(overview).toHaveFocus();
    fireEvent.keyDown(overview, { key: "End" });
    expect(pipeline).toHaveFocus();
  });

  it("omits the pairing tab when pairing data is absent", () => {
    render(<DecisionResults response={pipelineResponseFixture()} />);
    expect(screen.queryByRole("tab", { name: /pairing/i })).not.toBeInTheDocument();
  });
});
