/**
 * @file Express transport layer — routes only. All actual work
 * (orchestration, AI calls, deterministic scoring) lives in
 * server/pipeline/. No provider SDK type appears here.
 */

import { runPipeline } from "../pipeline/runPipeline.js";
import { generateScenarios } from "../pipeline/scenarioGeneration.js";
import {
  completedPipelineResponseSchema,
  evaluationRequestSchema,
  healthResponseSchema,
  safeErrorSchema,
  scenarioGenerationRequestSchema,
  scenarioGenerationResponseSchema,
  sseErrorEventSchema,
  pipelineStageProgressEventSchema,
} from "../../shared/contracts/decisionApi.js";

// FIX (kept from the pre-migration implementation): both /api/decision and
// /api/decision/stream race the pipeline against this timeout so a stalled
// call never holds the connection open indefinitely. The frontend's own
// request timeout is longer (see src/pages/Index.tsx), so the backend
// always has a chance to respond with a clean error first.
const PIPELINE_TIMEOUT_MS = 150_000; // 2.5 minutes

/**
 * @param {import("express").Express} app
 * @param {{ provider: import("../ai/types.js").AIProvider | null, aiEnabled: boolean, maxCandidates: number }} deps
 *   `provider` is resolved exactly once at process startup (see
 *   server.mjs) and reused for every request — this is what guarantees
 *   every run uses the same provider/model, since there is only ever one
 *   instance in the process for the app's whole lifetime. `maxCandidates`
 *   is likewise resolved once at startup (server/config/env.js) — routes
 *   never read process.env directly. The pipeline's fixed maximum of 4
 *   logical model-backed stages is an architectural constant, not a
 *   configurable dependency (server/pipeline/runPipeline.js).
 */
export function registerRoutes(app, { provider, aiEnabled, maxCandidates }) {
  app.get("/health", (_req, res) => {
    res.json(healthResponseSchema.parse({
      status: "ok",
      ai_enabled: aiEnabled,
      ai_provider: aiEnabled ? provider?.name ?? null : null,
      ai_model: aiEnabled ? provider?.model ?? null : null,
    }));
  });

  app.post("/api/scenarios", async (req, res) => {
    const parsed = scenarioGenerationRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(safeErrorSchema.parse({ error: "Role title and description are required." }));
    }
    const result = await generateScenarios(aiEnabled ? provider : null, parsed.data.title, parsed.data.description);
    return res.json(scenarioGenerationResponseSchema.parse(result));
  });

  app.post("/api/decision", async (req, res) => {
    const parsed = evaluationRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(safeErrorSchema.parse({ error: "Invalid evaluation request." }));
    const input = parsed.data;
    if (input.candidates.length > maxCandidates) {
      return res.status(400).json(safeErrorSchema.parse({ error: `At most ${maxCandidates} candidates are supported per evaluation (AI_MAX_CANDIDATES=${maxCandidates}).` }));
    }
    if (!aiEnabled) return res.status(503).json(safeErrorSchema.parse({ error: "AI pipeline is unavailable: the OpenAI provider is not ready. Check server configuration." }));

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Pipeline timed out after ${PIPELINE_TIMEOUT_MS / 1000}s. Try fewer candidates or a shorter description.`)), PIPELINE_TIMEOUT_MS)
      );
      const result = await Promise.race([runPipeline(provider, provider.model, input, undefined, { maxCandidates }), timeoutPromise]);
      res.json(completedPipelineResponseSchema.parse(result));
    } catch (err) {
      console.error("Pipeline request failed:", err instanceof Error ? err.message : "unknown error");
      res.status(500).json(safeErrorSchema.parse({ error: "Pipeline failed. Please try again." }));
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

    const parsed = evaluationRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      send("error", sseErrorEventSchema.parse({ message: "Invalid request: role.title, scenario, decision mode, and two unique candidate profiles are required." }));
      clearInterval(heartbeat);
      res.end();
      return;
    }
    const input = parsed.data;
    if (input.candidates.length > maxCandidates) {
      send("error", sseErrorEventSchema.parse({ message: `At most ${maxCandidates} candidates are supported per evaluation (AI_MAX_CANDIDATES=${maxCandidates}).` }));
      clearInterval(heartbeat);
      res.end();
      return;
    }
    if (!aiEnabled) {
      send("error", sseErrorEventSchema.parse({ message: "AI pipeline is unavailable: the OpenAI provider is not ready. Check server configuration." }));
      clearInterval(heartbeat);
      res.end();
      return;
    }

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Pipeline timed out after ${PIPELINE_TIMEOUT_MS / 1000}s. Try fewer candidates or a shorter description.`)), PIPELINE_TIMEOUT_MS)
      );
      const result = await Promise.race([
        runPipeline(provider, provider.model, input, (stages) => send("stage_update", pipelineStageProgressEventSchema.parse(stages)), { maxCandidates }),
        timeoutPromise,
      ]);
      send("complete", completedPipelineResponseSchema.parse(result));
    } catch (err) {
      console.error("Pipeline stream failed:", err instanceof Error ? err.message : "unknown error");
      send("error", sseErrorEventSchema.parse({ message: "Pipeline failed. Please try again." }));
    } finally {
      clearInterval(heartbeat);
      res.end();
    }
  });
}
