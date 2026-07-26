/**
 * @file Express transport layer — routes only. All actual work
 * (orchestration, AI calls, deterministic scoring) lives in
 * server/pipeline/. No provider SDK type appears here.
 */

import { runPipeline } from "../pipeline/runPipeline.js";
import { generateScenarios } from "../pipeline/scenarioGeneration.js";

// FIX (kept from the pre-migration implementation): both /api/decision and
// /api/decision/stream race the pipeline against this timeout so a stalled
// call never holds the connection open indefinitely. The frontend's own
// request timeout is longer (see src/pages/Index.tsx), so the backend
// always has a chance to respond with a clean error first.
const PIPELINE_TIMEOUT_MS = 150_000; // 2.5 minutes

/**
 * @param {import("express").Express} app
 * @param {{ provider: import("../ai/types.js").AIProvider | null, aiEnabled: boolean, maxCandidates: number, maxProviderRequestsPerRun: number }} deps
 *   `provider` is resolved exactly once at process startup (see
 *   server.mjs) and reused for every request — this is what guarantees
 *   every run uses the same provider/model, since there is only ever one
 *   instance in the process for the app's whole lifetime. `maxCandidates`
 *   and `maxProviderRequestsPerRun` are likewise resolved once at startup
 *   (server/config/env.js) — routes never read process.env directly.
 */
export function registerRoutes(app, { provider, aiEnabled, maxCandidates, maxProviderRequestsPerRun }) {
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      ai_enabled: aiEnabled,
      ai_provider: aiEnabled ? provider?.name ?? null : null,
      ai_model: aiEnabled ? provider?.model ?? null : null,
    });
  });

  app.post("/api/scenarios", async (req, res) => {
    const { title = "", description = "" } = req.body || {};
    if (!title.trim() || !description.trim()) {
      return res.status(400).json({ error: "Role title and description are required." });
    }
    const result = await generateScenarios(aiEnabled ? provider : null, title, description);
    return res.json(result);
  });

  app.post("/api/decision", async (req, res) => {
    console.log(`POST /api/decision — ${req.body?.candidates?.length ?? 0} candidates`);
    const input = req.body;
    if (!input.role?.title) return res.status(400).json({ error: "role.title required" });
    if (!input.scenario) return res.status(400).json({ error: "scenario required" });
    if (!input.decision_mode) return res.status(400).json({ error: "decision_mode required" });
    if (!Array.isArray(input.candidates) || input.candidates.length < 2) return res.status(400).json({ error: "2+ candidates required" });
    if (input.candidates.length > maxCandidates) {
      return res.status(400).json({ error: `At most ${maxCandidates} candidates are supported per evaluation (AI_MAX_CANDIDATES=${maxCandidates}).` });
    }
    if (!aiEnabled) return res.status(503).json({ error: "AI pipeline is unavailable: the OpenAI provider is not ready. Check server OPENAI_API_KEY configuration." });

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Pipeline timed out after ${PIPELINE_TIMEOUT_MS / 1000}s. Try fewer candidates or a shorter description.`)), PIPELINE_TIMEOUT_MS)
      );
      const result = await Promise.race([runPipeline(provider, provider.model, input, undefined, { maxCandidates, maxProviderRequestsPerRun }), timeoutPromise]);
      res.json(result);
    } catch (err) {
      console.error("Pipeline error:", err.message);
      res.status(500).json({ error: "Pipeline failed", message: err.message });
    }
  });

  app.post("/api/decision/stream", async (req, res) => {
    console.log("POST /api/decision/stream");

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    if (req.socket) req.socket.setNoDelay(true);

    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(": keepalive\n\n");
    }, 15000);

    const send = (event, data) => {
      if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const input = req.body;
    if (!input?.role?.title || !input?.scenario || !Array.isArray(input?.candidates) || input.candidates.length < 2) {
      send("error", { message: "Invalid request: role.title, scenario, and 2+ candidates required." });
      clearInterval(heartbeat);
      res.end();
      return;
    }
    if (input.candidates.length > maxCandidates) {
      send("error", { message: `At most ${maxCandidates} candidates are supported per evaluation (AI_MAX_CANDIDATES=${maxCandidates}).` });
      clearInterval(heartbeat);
      res.end();
      return;
    }
    if (!aiEnabled) {
      send("error", { message: "AI pipeline is unavailable: the OpenAI provider is not ready. Check server OPENAI_API_KEY configuration." });
      clearInterval(heartbeat);
      res.end();
      return;
    }

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Pipeline timed out after ${PIPELINE_TIMEOUT_MS / 1000}s. Try fewer candidates or a shorter description.`)), PIPELINE_TIMEOUT_MS)
      );
      const result = await Promise.race([
        runPipeline(provider, provider.model, input, (stages) => send("stage_update", stages), { maxCandidates, maxProviderRequestsPerRun }),
        timeoutPromise,
      ]);
      send("complete", result);
    } catch (err) {
      console.error("Pipeline error:", err.message);
      send("error", { message: err.message });
    } finally {
      clearInterval(heartbeat);
      res.end();
    }
  });
}
