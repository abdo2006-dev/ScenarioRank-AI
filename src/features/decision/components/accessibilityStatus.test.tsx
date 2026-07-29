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

  it("exposes named polite progress while hiding decorative icons", () => {
    const { container } = render(<PipelineProgress stages={[{
      id: "input", label: "Input Received", status: "running", duration_ms: 0,
    }]} />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("Input Received")).toBeInTheDocument();
    expect(screen.getByText("0.0s")).toBeInTheDocument();
    expect(container.querySelector("[aria-hidden='true']")?.className).toContain("motion-reduce:animate-none");
  });
});
