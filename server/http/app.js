/**
 * @file Express app construction — transport concerns only (CORS, JSON
 * body parsing, route registration). No orchestration or AI logic here.
 */

import express from "express";
import cors from "cors";
import { registerRoutes } from "./routes.js";

/**
 * @param {{ provider: import("../ai/types.js").AIProvider | null, aiEnabled: boolean, maxCandidates: number, maxProviderRequestsPerRun: number }} deps
 */
export function createApp(deps) {
  const app = express();
  app.use(cors({ origin: true, methods: ["GET", "POST", "OPTIONS"] }));
  app.use(express.json({ limit: "10mb" }));
  registerRoutes(app, deps);
  return app;
}
