import type { PipelineRequest, PipelineResponse, PipelineStage } from "@/types/pipeline";
import { generateMockResponse, INITIAL_PIPELINE_STAGES } from "@/data/mockData";

type Mode = "mock" | "live";

// Auto-detect mode: if VITE_USE_LIVE_BACKEND is set to "true", use live
const AUTO_MODE: Mode =
  (import.meta.env.VITE_USE_LIVE_BACKEND === "true") ? "live" : "mock";

let currentMode: Mode = AUTO_MODE;

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

export function setServiceMode(mode: Mode) {
  currentMode = mode;
}

export function getServiceMode(): Mode {
  return currentMode;
}

export async function runDecisionPipeline(
  request: PipelineRequest,
  onStageUpdate?: (stages: PipelineStage[]) => void
): Promise<PipelineResponse> {
  if (currentMode === "live") {
    return runLivePipeline(request, onStageUpdate);
  }
  return runMockPipeline(request, onStageUpdate);
}

async function runMockPipeline(
  request: PipelineRequest,
  onStageUpdate?: (stages: PipelineStage[]) => void
): Promise<PipelineResponse> {
  const stages = INITIAL_PIPELINE_STAGES
    .filter(s => request.options.enable_pair_simulation || s.id !== "pairing")
    .map(s => ({ ...s }));

  // Simulate progressive pipeline execution
  for (let i = 0; i < stages.length; i++) {
    stages[i].status = "running";
    onStageUpdate?.([...stages]);
    await delay(600 + Math.random() * 800);

    stages[i].status = "completed";
    stages[i].summary = `${stages[i].label} completed successfully.`;
    stages[i].duration_ms = Math.round(600 + Math.random() * 1500);
    onStageUpdate?.([...stages]);
    await delay(150);
  }

  return generateMockResponse(
    request.scenario,
    request.decision_mode,
    request.candidates,
    request.options.enable_pair_simulation
  );
}

async function runLivePipeline(
  request: PipelineRequest,
  onStageUpdate?: (stages: PipelineStage[]) => void
): Promise<PipelineResponse> {
  // Build request payload matching backend PipelineInput
  const payload = {
    role: request.role,
    scenario: request.scenario,
    decision_mode: request.decision_mode,
    candidates: request.candidates.map(c => ({
      id: c.id,
      name: c.name,
      description: c.description,
      source: c.source,
    })),
    options: {
      enable_pair_simulation: request.options.enable_pair_simulation,
      include_pipeline_logs: true,
    },
  };

  // Use streaming endpoint if stage updates are requested
  if (onStageUpdate) {
    return runLivePipelineWithStream(payload, onStageUpdate);
  }

  // Otherwise use standard POST
  const response = await fetch(`${BACKEND_URL}/api/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Backend error ${response.status}: ${err}`);
  }

  return response.json();
}

async function runLivePipelineWithStream(
  payload: unknown,
  onStageUpdate: (stages: PipelineStage[]) => void
): Promise<PipelineResponse> {
  return new Promise(async (resolve, reject) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/decision/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.text();
        reject(new Error(`Backend error ${response.status}: ${err}`));
        return;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let result: PipelineResponse | null = null;

      const processChunk = (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            // handled below
          } else if (line.startsWith("data: ")) {
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr);

              // Detect event type from previous lines in buffer context
              // SSE format: "event: X\ndata: Y\n\n"
              if (Array.isArray(data)) {
                // stage_update
                onStageUpdate(data as PipelineStage[]);
              } else if (data.pipeline_steps) {
                // complete event
                result = data as PipelineResponse;
              } else if (data.error) {
                reject(new Error(data.message || data.error));
                return;
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      };

      // Also handle event names properly
      let currentEvent = "";
      const processLine = (line: string) => {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          const dataStr = line.slice(6);
          try {
            const data = JSON.parse(dataStr);
            if (currentEvent === "stage_update" || Array.isArray(data)) {
              onStageUpdate(data as PipelineStage[]);
            } else if (currentEvent === "complete" || data.pipeline_steps) {
              result = data as PipelineResponse;
            } else if (currentEvent === "error" || data.error) {
              reject(new Error(data.message || "Pipeline error"));
            }
          } catch {
            // ignore
          }
          currentEvent = "";
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = (buffer + chunk).split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          processLine(line);
        }
      }

      if (result) {
        resolve(result);
      } else {
        reject(new Error("Stream ended without result"));
      }
    } catch (err) {
      reject(err);
    }
  });
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
