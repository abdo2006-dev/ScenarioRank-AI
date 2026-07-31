import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import App from "./App";

/**
 * Phase 2B-2 removed QueryClientProvider, TooltipProvider, Toaster, and Sonner
 * from App.tsx because no active component called React Query, a tooltip, or
 * either toast system. These tests prove the app still renders and routes
 * correctly without them — a regression here would mean the removal broke a
 * consumer this review missed.
 */
describe("App — root providers simplified in Phase 2B-2", () => {
  afterEach(() => {
    cleanup();
    window.history.pushState({}, "", "/");
  });

  it("renders the landing route without needing a query client, tooltip, or toast provider", () => {
    window.history.pushState({}, "", "/");
    render(<App />);
    expect(
      screen.getByText(/executive decision intelligence/i),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /start evaluation/i }).length,
    ).toBeGreaterThan(0);
  });

  it("renders the catch-all NotFound route for an unknown path", () => {
    window.history.pushState({}, "", "/this-route-does-not-exist");
    render(<App />);
    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByText(/page not found/i)).toBeInTheDocument();
  });
});
