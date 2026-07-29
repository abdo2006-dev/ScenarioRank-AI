export type SseEvent = { event: string; data: unknown };

/** Incremental SSE parser for the small POST response stream used by ScenarioRank. */
export class SseParser {
  private buffer = "";
  private event = "message";
  private dataLines: string[] = [];

  push(chunk: string): SseEvent[] {
    this.buffer += chunk.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    const events: SseEvent[] = [];
    for (const line of lines) {
      if (line === "") {
        const event = this.finish();
        if (event) events.push(event);
      } else if (!line.startsWith(":")) {
        const separator = line.indexOf(":");
        const field = separator === -1 ? line : line.slice(0, separator);
        const value = separator === -1 ? "" : line.slice(separator + 1).replace(/^ /, "");
        if (field === "event") this.event = value;
        if (field === "data") this.dataLines.push(value);
      }
    }
    return events;
  }

  finish(): SseEvent | undefined {
    if (!this.dataLines.length) {
      this.event = "message";
      return undefined;
    }
    const event = { event: this.event, data: JSON.parse(this.dataLines.join("\n")) };
    this.event = "message";
    this.dataLines = [];
    return event;
  }
}
