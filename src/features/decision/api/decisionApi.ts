import { BACKEND_URL } from "@/lib/backendUrl";
import {
  completedPipelineResponseSchema, evaluationRequestSchema, healthResponseSchema,
  pipelineStageProgressEventSchema, scenarioGenerationRequestSchema,
  scenarioGenerationResponseSchema, sseErrorEventSchema,
} from "../contracts";
import type { EvaluationRequest, PipelineResponse, PipelineStage, ScenarioGenerationRequest, ScenarioGenerationResponse } from "../contracts";
import { InvalidSsePayloadError, SseParser } from "./sseParser";

function safeMessage(value: unknown, fallback: string) {
  return value instanceof Error && value.message ? value.message : fallback;
}
async function readJson(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return undefined; }
}
async function requestWithTimeout(url: string, options: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { window.clearTimeout(timer); }
}

export async function getHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${BACKEND_URL}/health`);
    if (!response.ok) return false;
    const parsed = healthResponseSchema.safeParse(await readJson(response));
    return parsed.success && parsed.data.ai_enabled;
  } catch { return false; }
}

// The public function keeps validation and safe conversion close to fetch.
export async function getAiEnabled(): Promise<boolean> {
  return getHealth();
}

export async function generateScenarios(request: ScenarioGenerationRequest, timeoutMs: number): Promise<ScenarioGenerationResponse> {
  const body = scenarioGenerationRequestSchema.parse(request);
  let response: Response;
  try {
    response = await requestWithTimeout(`${BACKEND_URL}/api/scenarios`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, timeoutMs);
  } catch (error) {
    if (error instanceof InvalidSsePayloadError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("Scenario generation timed out after 35 seconds. The server may be under load — please try again.");
    throw new Error("Scenario generation failed. Please try again.");
  }
  const data = await readJson(response);
  if (!response.ok) throw new Error("Scenario generation failed. Please try again.");
  const parsed = scenarioGenerationResponseSchema.safeParse(data);
  if (!parsed.success) throw new Error("The server returned an invalid scenario response.");
  return parsed.data;
}

export async function runEvaluation(request: EvaluationRequest, onStage: (stages: PipelineStage[]) => void, timeoutMs: number): Promise<PipelineResponse> {
  const body = evaluationRequestSchema.parse(request);
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${BACKEND_URL}/api/decision/stream`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
    if (!response.ok) throw new Error("The server could not start the evaluation. Please try again.");
    if (!response.body) throw new Error("The server returned no evaluation stream.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = new SseParser();
    let serverError: string | undefined;
    while (true) {
      const { done, value } = await reader.read();
      const events = done ? parser.push(decoder.decode()) : parser.push(decoder.decode(value, { stream: true }));
      for (const event of events) {
        if (event.event === "stage_update") {
          const parsed = pipelineStageProgressEventSchema.safeParse(event.data);
          if (!parsed.success) throw new Error("The server returned an invalid progress update.");
          onStage(parsed.data);
        } else if (event.event === "error") {
          const parsed = sseErrorEventSchema.safeParse(event.data);
          serverError = parsed.success ? parsed.data.message : "The server returned an invalid error response.";
        } else if (event.event === "complete") {
          const parsed = completedPipelineResponseSchema.safeParse(event.data);
          if (!parsed.success) throw new Error("The server returned an invalid evaluation response.");
          await reader.cancel();
          return parsed.data;
        }
        // Unknown event names are deliberately ignored for forward compatibility.
      }
      if (done) throw new Error(serverError ?? "Stream ended before pipeline completed.");
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error(`Pipeline request timed out after ${Math.round(timeoutMs / 60000)} minutes. Please try again.`);
    throw new Error(safeMessage(error, "Pipeline failed. Please try again."));
  } finally { window.clearTimeout(timer); }
}
