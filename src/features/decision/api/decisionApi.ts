import { BACKEND_URL } from "@/lib/backendUrl";
import {
  completedPipelineResponseSchema,
  evaluationRequestSchema,
  healthResponseSchema,
  pipelineStageProgressEventSchema,
  scenarioGenerationRequestSchema,
  scenarioGenerationResponseSchema,
  sseErrorEventSchema,
} from "../contracts";
import type {
  EvaluationRequest,
  PipelineResponse,
  PipelineStage,
  ScenarioGenerationRequest,
  ScenarioGenerationResponse,
} from "../contracts";
import { InvalidSsePayloadError, SseParser } from "./sseParser";

export class SafeDecisionClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SafeDecisionClientError";
  }
}

function safeError(message: string) {
  return new SafeDecisionClientError(message);
}

function isAbortError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

async function requestWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

export async function getHealth() {
  try {
    const response = await fetch(`${BACKEND_URL}/health`);
    if (!response.ok) return null;

    const parsed = healthResponseSchema.safeParse(await readJson(response));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function getAiEnabled(): Promise<boolean> {
  return (await getHealth())?.ai_enabled ?? false;
}

export async function generateScenarios(
  request: ScenarioGenerationRequest,
  timeoutMs: number,
): Promise<ScenarioGenerationResponse> {
  const parsedRequest = scenarioGenerationRequestSchema.safeParse(request);
  if (!parsedRequest.success) {
    throw safeError("Enter a role title and description first.");
  }

  let response: Response;
  try {
    response = await requestWithTimeout(
      `${BACKEND_URL}/api/scenarios`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsedRequest.data),
      },
      timeoutMs,
    );
  } catch (error) {
    if (isAbortError(error)) {
      throw safeError("Scenario generation timed out. Please try again.");
    }
    throw safeError("Scenario generation failed. Please try again.");
  }

  const data = await readJson(response);
  if (!response.ok) {
    throw safeError("Scenario generation failed. Please try again.");
  }

  const parsedResponse = scenarioGenerationResponseSchema.safeParse(data);
  if (!parsedResponse.success) {
    throw safeError("The server returned an invalid scenario response.");
  }

  return parsedResponse.data;
}

export async function runEvaluation(
  request: EvaluationRequest,
  onStage: (stages: PipelineStage[]) => void,
  timeoutMs: number,
): Promise<PipelineResponse> {
  const parsedRequest = evaluationRequestSchema.safeParse(request);
  if (!parsedRequest.success) {
    throw safeError("The evaluation request is invalid.");
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${BACKEND_URL}/api/decision/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsedRequest.data),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw safeError(
        "The server could not start the evaluation. Please try again.",
      );
    }
    if (!response.body) {
      throw safeError("The server returned no evaluation stream.");
    }

    return await readEvaluationStream(
      response.body,
      onStage,
      controller.signal,
    );
  } catch (error) {
    if (error instanceof SafeDecisionClientError) throw error;
    if (error instanceof InvalidSsePayloadError) {
      throw safeError(error.message);
    }
    if (isAbortError(error)) {
      throw safeError("The evaluation timed out. Please try again.");
    }
    throw safeError("The evaluation connection failed. Please try again.");
  } finally {
    window.clearTimeout(timer);
  }
}

async function readEvaluationStream(
  body: ReadableStream<Uint8Array>,
  onStage: (stages: PipelineStage[]) => void,
  signal: AbortSignal,
): Promise<PipelineResponse> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser();
  let serverError: string | undefined;

  while (true) {
    const { done, value } = await readWithAbort(reader, signal);
    const text = done
      ? decoder.decode()
      : decoder.decode(value, { stream: true });
    const events = [...parser.push(text), ...(done ? parser.end() : [])];

    for (const event of events) {
      if (event.event === "stage_update") {
        const parsed = pipelineStageProgressEventSchema.safeParse(event.data);
        if (!parsed.success) {
          throw safeError("The server returned an invalid progress update.");
        }
        onStage(parsed.data);
      } else if (event.event === "error") {
        const parsed = sseErrorEventSchema.safeParse(event.data);
        serverError = parsed.success
          ? parsed.data.message
          : "The server returned an invalid error response.";
      } else if (event.event === "complete") {
        const parsed = completedPipelineResponseSchema.safeParse(event.data);
        if (!parsed.success) {
          throw safeError("The server returned an invalid evaluation response.");
        }
        await reader.cancel().catch(() => undefined);
        return parsed.data;
      }
      // Unknown event types are ignored for forward compatibility.
    }

    if (done) {
      throw safeError(
        serverError ?? "Stream ended before the evaluation completed.",
      );
    }
  }
}

function readWithAbort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
) {
  if (signal.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }

  return new Promise<ReadableStreamReadResult<Uint8Array>>(
    (resolve, reject) => {
      const handleAbort = () => {
        void reader.cancel().catch(() => undefined);
        reject(new DOMException("Aborted", "AbortError"));
      };

      signal.addEventListener("abort", handleAbort, { once: true });
      void reader.read().then(
        (result) => {
          signal.removeEventListener("abort", handleAbort);
          resolve(result);
        },
        (error: unknown) => {
          signal.removeEventListener("abort", handleAbort);
          reject(error);
        },
      );
    },
  );
}
