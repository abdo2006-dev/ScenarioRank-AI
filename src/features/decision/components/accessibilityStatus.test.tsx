import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ErrorBanner } from "./ErrorBanner";
import { PipelineProgress } from "./PipelineProgress";

describe("decision status accessibility", () => {
  it("focuses a safe global error alert", () => {
    render(<ErrorBanner message="Pipeline failed. Please try again." />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveFocus();
    expect(alert).toHaveTextContent("Pipeline failed. Please try again.");
  });

  it("keeps the visible stage list out of the live region", () => {
    const { container } = render(<PipelineProgress stages={[{
      id: "input", label: "Input Received", status: "running", duration_ms: 0,
    }]} />);
    const status = screen.getByRole("status");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Input Received: running");
    expect(container.querySelector(".space-y-2")).not.toHaveAttribute("role");
    expect(container.querySelector(".space-y-2")).not.toHaveAttribute("aria-live");
    expect(screen.getByText("Input Received")).toBeInTheDocument();
    expect(screen.getByText("0.0s")).toBeInTheDocument();
    expect(container.querySelector("[aria-hidden='true']")?.className).toContain("motion-reduce:animate-none");
  });

  it("announces completed pipelines concisely", () => {
    render(<PipelineProgress stages={[{
      id: "input", label: "Input Received", status: "completed", duration_ms: 0,
    }, {
      id: "decision", label: "Decision Engine", status: "completed", duration_ms: 0,
    }]} />);
    expect(screen.getByRole("status")).toHaveTextContent("Decision Pipeline completed");
  });

  it("announces a failed stage in preference to other stage changes", () => {
    render(<PipelineProgress stages={[{
      id: "input", label: "Input Received", status: "completed",
    }, {
      id: "scoring", label: "Candidate Scoring", status: "running",
    }, {
      id: "decision", label: "Decision Engine", status: "failed",
    }]} />);
    expect(screen.getByRole("status")).toHaveTextContent("Decision Engine: failed");
  });
});
