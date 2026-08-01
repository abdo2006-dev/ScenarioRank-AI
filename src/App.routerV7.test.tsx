import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import App from "./App";

/**
 * Phase 2D migrated routing from react-router-dom@6.30.4 to react-router@7.18.2
 * (Declarative Mode only: BrowserRouter/Routes/Route/useLocation — see
 * docs/security/DEPENDENCY_AUDIT.md, "Phase 2D update"). These tests guard
 * the v7 behavior changes and the chosen package strategy; they do not
 * change scoring, prompts, provider behavior, or route content.
 */
describe("App — React Router 7 route behavior (Phase 2D)", () => {
  afterEach(() => {
    cleanup();
    window.history.pushState({}, "", "/");
  });

  it("renders the ScenarioRank application at the root route", () => {
    window.history.pushState({}, "", "/");
    render(<App />);
    expect(screen.getByText(/executive decision intelligence/i)).toBeInTheDocument();
  });

  it("renders NotFound for an unknown top-level route", () => {
    window.history.pushState({}, "", "/this-route-does-not-exist");
    render(<App />);
    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByText(/page not found/i)).toBeInTheDocument();
  });

  it("renders NotFound for a nested unknown route", () => {
    window.history.pushState({}, "", "/this/route/is/deeply/nested/and/unknown");
    render(<App />);
    expect(screen.getByText("404")).toBeInTheDocument();
  });

  it("initializes BrowserRouter without a React Router future-flag warning", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    window.history.pushState({}, "", "/");
    render(<App />);
    const routerFutureFlagWarnings = warnSpy.mock.calls.filter((args) =>
      String(args[0]).includes("React Router Future Flag Warning"),
    );
    expect(routerFutureFlagWarnings).toHaveLength(0);
    warnSpy.mockRestore();
  });

  it("navigates between routes (browser back/forward) without an unhandled rejection or a React act() warning", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    window.history.pushState({}, "", "/");
    render(<App />);

    await act(async () => {
      window.history.pushState({}, "", "/another-unknown-route");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await screen.findByText("404");

    const problemLogs = errorSpy.mock.calls.filter((args) => {
      const message = String(args[0]);
      return message.includes("not wrapped in act") || message.includes("Unhandled Rejection");
    });
    expect(problemLogs).toHaveLength(0);
    errorSpy.mockRestore();
  });
});

describe("React Router 7 package-strategy guard (Phase 2D)", () => {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const appSource = readFileSync(path.join(repoRoot, "src/App.tsx"), "utf8");
  const notFoundSource = readFileSync(path.join(repoRoot, "src/pages/NotFound.tsx"), "utf8");

  it("imports router APIs only from the selected v7 package (react-router), never react-router-dom", () => {
    expect(appSource).toMatch(/from "react-router"/);
    expect(appSource).not.toMatch(/react-router-dom/);
    expect(notFoundSource).toMatch(/from "react-router"/);
    expect(notFoundSource).not.toMatch(/react-router-dom/);
  });

  it("does not use React Router's data APIs (createBrowserRouter, RouterProvider, loaders, actions)", () => {
    for (const source of [appSource, notFoundSource]) {
      expect(source).not.toMatch(/createBrowserRouter/);
      expect(source).not.toMatch(/RouterProvider/);
      expect(source).not.toMatch(/\bloader\s*:/);
      expect(source).not.toMatch(/\baction\s*:/);
    }
  });

  it("keeps no v6-only future flag or migration workaround", () => {
    expect(appSource).not.toMatch(/future=/);
    expect(appSource).not.toMatch(/v7_startTransition/);
    expect(appSource).not.toMatch(/v7_relativeSplatPath/);
  });

  it("does not route the evaluation form through React Router's route-aware Form API", () => {
    const evaluationFormSource = readFileSync(
      path.join(repoRoot, "src/features/decision/components/evaluation/EvaluationForm.tsx"),
      "utf8",
    );
    expect(evaluationFormSource).not.toMatch(/from "react-router"/);
    expect(evaluationFormSource).toMatch(/<form\b/);
  });
});
