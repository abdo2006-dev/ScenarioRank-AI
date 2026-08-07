import { describe, it, expect, afterEach } from "vitest";
import { createApp } from "./app.js";
import { createFakePipelineProvider, defaultHandlers, defaultInput } from "../pipeline/testSupport/fakePipelineProvider.js";
import { completedPipelineResponseSchema } from "../../shared/contracts/decisionApi.js";

const DEFAULT_TEST_DEPS = { maxCandidates: 5 };

async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

/** Starts the real Express app on an ephemeral loopback port. */
async function startServer(deps) {
  const app = createApp({ ...DEFAULT_TEST_DEPS, ...deps });
  const server = app.listen(0, "127.0.0.1");

  await new Promise((resolve, reject) => {
    const cleanUp = () => {
      server.off("listening", onListening);
      server.off("error", onError);
    };
    const onListening = () => {
      cleanUp();
      resolve();
    };
    const onError = (error) => {
      cleanUp();
      reject(error);
    };
    server.once("listening", onListening);
    server.once("error", onError);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await closeServer(server);
    throw new Error("Test server did not expose an ephemeral TCP port.");
  }
  return server;
}

function parseSseEvents(rawText) {
  return rawText
    .split("\n\n")
    .filter((block) => block.trim().length > 0 && !block.startsWith(":"))
    .map((block) => {
      const eventLine = block.split("\n").find((l) => l.startsWith("event: "));
      const dataLine = block.split("\n").find((l) => l.startsWith("data: "));
      return { event: eventLine?.slice("event: ".length), data: dataLine ? JSON.parse(dataLine.slice("data: ".length)) : undefined };
    });
}

let activeServer;
afterEach(async () => {
  if (activeServer) {
    await closeServer(activeServer);
    activeServer = undefined;
  }
});

describe("/health", () => {
  it("reports liveness, AI readiness, and the configured model, without exposing secrets", async () => {
    const provider = createFakePipelineProvider({ handlers: defaultHandlers() });
    activeServer = await startServer({ provider, aiEnabled: true });
    const port = activeServer.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await res.json();

    expect(body).toMatchObject({ status: "ok", ai_enabled: true, ai_provider: "fake", ai_model: "fake-model" });
    expect(body.limits.max_candidates).toBe(5);
    expect(JSON.stringify(body)).not.toMatch(/key|secret|token/i);
  });

  it("reports ai_enabled:false, ai_provider:null, ai_model:null when AI is unavailable", async () => {
    activeServer = await startServer({ provider: null, aiEnabled: false });
    const port = activeServer.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(await res.json()).toMatchObject({ status: "ok", ai_enabled: false, ai_provider: null, ai_model: null, limits: { max_candidates: 5 } });
  });
});

describe("POST /api/decision/stream", () => {
  it("emits a valid complete event for a signed negative score after offline provider work completes", async () => {
    const provider = createFakePipelineProvider({
      handlers: defaultHandlers({ scoreByCandidateId: { strong: 6, weak: 3 } }),
    });
    activeServer = await startServer({ provider, aiEnabled: true });
    const port = activeServer.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/api/decision/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(defaultInput({ candidateIds: ["strong", "weak"] })),
    });
    const events = parseSseEvents(await res.text());

    expect(provider.calls.map(({ promptId }) => promptId)).toEqual([
      "context-analysis", "batch-candidate-scoring", "decision-explanation",
    ]);
    expect(events.some((event) => event.event === "error")).toBe(false);
    expect(events.at(-1).event).toBe("complete");
    expect(completedPipelineResponseSchema.safeParse(events.at(-1).data).success).toBe(true);
    expect(events.at(-1).data.candidate_evaluations.find((candidate) => candidate.candidate_id === "weak").risk_adjusted_score).toBe(-30);
  });

  it("emits stage_update events in order, then a complete event, and closes the response", async () => {
    const provider = createFakePipelineProvider({ handlers: defaultHandlers() });
    activeServer = await startServer({ provider, aiEnabled: true });
    const port = activeServer.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/api/decision/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(defaultInput()),
    });
    const text = await res.text();
    const events = parseSseEvents(text);

    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
    expect(events.some((e) => e.event === "stage_update")).toBe(true);
    expect(events.at(-1).event).toBe("complete");
    expect(events.at(-1).data.decision_result.recommended_candidate_id).toBeTruthy();

    // Stage ordering: the last stage_update before "complete" must show
    // every stage completed, in the declared order, ending with "complete".
    const lastStageUpdate = [...events].reverse().find((e) => e.event === "stage_update");
    const ids = lastStageUpdate.data.map((s) => s.id);
    expect(ids).toEqual(["input", "context", "scoring", "confidence_review", "outcome", "decision", "complete"]);
    expect(lastStageUpdate.data.every((s) => s.status === "completed")).toBe(true);
  });

  it("emits an error event (not a hang) for invalid input", async () => {
    activeServer = await startServer({ provider: createFakePipelineProvider({ handlers: defaultHandlers() }), aiEnabled: true });
    const port = activeServer.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/api/decision/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario: "x" }), // missing role, candidates
    });
    const events = parseSseEvents(await res.text());
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("error");
    expect(events[0].data.message).toBe("Invalid evaluation request.");
  });

  it("emits an error event when the submitted candidate count exceeds AI_MAX_CANDIDATES", async () => {
    activeServer = await startServer({ provider: createFakePipelineProvider({ handlers: defaultHandlers() }), aiEnabled: true, maxCandidates: 2 });
    const port = activeServer.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/api/decision/stream`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(defaultInput({ candidateIds: ["a", "b", "c"] })),
    });
    const events = parseSseEvents(await res.text());
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("error");
    expect(events[0].data.message).toBe(
      "You can evaluate at most 2 candidates in this environment.",
    );
  });

  it("emits an error event and closes cleanly when a pipeline stage fails — never hangs", async () => {
    const handlers = { ...defaultHandlers(), "context-analysis": () => { throw new Error("simulated provider failure"); } };
    activeServer = await startServer({ provider: createFakePipelineProvider({ handlers }), aiEnabled: true });
    const port = activeServer.address().port;

    const start = Date.now();
    const res = await Promise.race([
      fetch(`http://127.0.0.1:${port}/api/decision/stream`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(defaultInput()),
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("test timeout — response hung")), 5000)),
    ]);
    const events = parseSseEvents(await res.text());

    expect(Date.now() - start).toBeLessThan(5000);
    expect(events.some((e) => e.event === "error" && /Pipeline failed/.test(e.data.message))).toBe(true);
  });

  it("reports AI unavailable via an error event rather than attempting a null provider call", async () => {
    activeServer = await startServer({ provider: null, aiEnabled: false });
    const port = activeServer.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/api/decision/stream`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(defaultInput()),
    });
    const events = parseSseEvents(await res.text());
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("error");
    expect(events[0].data.message).toMatch(/AI pipeline is unavailable/);
  });

  it("completes a pairing-enabled stream with public pair candidate IDs", async () => {
    const provider = createFakePipelineProvider({ handlers: defaultHandlers() });
    activeServer = await startServer({ provider, aiEnabled: true });
    const port = activeServer.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/api/decision/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(defaultInput({ candidateIds: ["a", "b", "c"], enablePairing: true })),
    });
    const events = parseSseEvents(await res.text());
    const complete = events.at(-1);

    expect(events.some((event) => event.event === "stage_update")).toBe(true);
    expect(events.some((event) => event.event === "error")).toBe(false);
    expect(complete.event).toBe("complete");
    expect(completedPipelineResponseSchema.safeParse(complete.data).success).toBe(true);
    expect(complete.data.pairing_result.best_pair.candidate_id_a).toBeTruthy();
    expect(complete.data.pairing_result.best_pair.candidate_id_b).toBeTruthy();
  });
});

describe("POST /api/decision (non-streaming)", () => {
  it("returns a valid signed negative score after offline provider work completes", async () => {
    const provider = createFakePipelineProvider({
      handlers: defaultHandlers({ scoreByCandidateId: { strong: 6, weak: 3 } }),
    });
    activeServer = await startServer({ provider, aiEnabled: true });
    const port = activeServer.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/api/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(defaultInput({ candidateIds: ["strong", "weak"] })),
    });

    expect(provider.calls.map(({ promptId }) => promptId)).toEqual([
      "context-analysis", "batch-candidate-scoring", "decision-explanation",
    ]);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(completedPipelineResponseSchema.safeParse(body).success).toBe(true);
    expect(body.candidate_evaluations.find((candidate) => candidate.candidate_id === "weak").risk_adjusted_score).toBe(-30);
    expect(body.decision_result.recommended_candidate_id).toBe("strong");
  });

  it("returns the full pipeline result as JSON", async () => {
    const provider = createFakePipelineProvider({ handlers: defaultHandlers() });
    activeServer = await startServer({ provider, aiEnabled: true });
    const port = activeServer.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/api/decision`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(defaultInput()),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.decision_result.recommended_candidate_id).toBeTruthy();
    expect(body.run_metadata.logicalProviderStageCount).toBeGreaterThan(0);
    expect(body.run_metadata.providerAttemptCount).toBeGreaterThan(0);
  });

  it("returns 400 when the submitted candidate count exceeds AI_MAX_CANDIDATES", async () => {
    const provider = createFakePipelineProvider({ handlers: defaultHandlers() });
    activeServer = await startServer({ provider, aiEnabled: true, maxCandidates: 2 });
    const port = activeServer.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/api/decision`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(defaultInput({ candidateIds: ["a", "b", "c"] })),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe(
      "You can evaluate at most 2 candidates in this environment.",
    );
  });

  it("rejects oversized and whitespace-only values without echoing them", async () => {
    const provider = createFakePipelineProvider({ handlers: defaultHandlers() });
    activeServer = await startServer({ provider, aiEnabled: true });
    const port = activeServer.address().port;
    const submittedText = "private submitted profile";
    const tooLongTitle = `${submittedText}${"x".repeat(120)}`;
    const input = defaultInput();
    input.role.title = tooLongTitle;
    input.candidates[0].description = "   ";

    const response = await fetch(`http://127.0.0.1:${port}/api/decision`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "Invalid evaluation request." });
    expect(JSON.stringify(body)).not.toContain(submittedText);
  });

  it("returns 503 when AI is unavailable, without a secret-revealing message", async () => {
    activeServer = await startServer({ provider: null, aiEnabled: false });
    const port = activeServer.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/api/decision`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(defaultInput()),
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/AI pipeline is unavailable/);
  });

  it("returns a valid pairing-enabled response with candidate IDs", async () => {
    const provider = createFakePipelineProvider({ handlers: defaultHandlers() });
    activeServer = await startServer({ provider, aiEnabled: true });
    const port = activeServer.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/api/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(defaultInput({ candidateIds: ["a", "b", "c"], enablePairing: true })),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(completedPipelineResponseSchema.safeParse(body).success).toBe(true);
    expect(body.pairing_result.status).toBe("ok");
    expect(body.pairing_result.best_pair.candidate_id_a).toBeTruthy();
    expect(body.pairing_result.best_pair.candidate_id_b).toBeTruthy();
  });
});
