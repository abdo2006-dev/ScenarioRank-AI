export type SseEvent = {
  event: string;
  data: unknown;
};

/** A transport failure whose message never exposes JSON parser internals. */
export class InvalidSsePayloadError extends Error {
  constructor() {
    super("The server returned a malformed evaluation stream.");
    this.name = "InvalidSsePayloadError";
  }
}

/**
 * Incremental parser for ScenarioRank's SSE response.
 *
 * Events are dispatched only after a blank-line terminator. `end()` resolves
 * a trailing CR but deliberately discards an unterminated final event, matching
 * SSE semantics rather than inventing a completion at connection close.
 */
export class SseParser {
  private buffer = "";
  private eventName = "message";
  private dataLines: string[] = [];
  private pendingCarriageReturn = false;

  push(chunk: string): SseEvent[] {
    return this.consumeNormalized(this.normalizeLineEndings(chunk));
  }

  end(): SseEvent[] {
    const events = this.pendingCarriageReturn
      ? this.consumeNormalized("\n")
      : [];

    this.pendingCarriageReturn = false;
    this.buffer = "";
    this.eventName = "message";
    this.dataLines = [];
    return events;
  }

  private normalizeLineEndings(chunk: string) {
    let source = chunk;
    let normalized = "";

    if (this.pendingCarriageReturn) {
      normalized += "\n";
      this.pendingCarriageReturn = false;
      if (source.startsWith("\n")) {
        source = source.slice(1);
      }
    }

    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      if (character !== "\r") {
        normalized += character;
        continue;
      }

      if (index === source.length - 1) {
        this.pendingCarriageReturn = true;
        continue;
      }

      normalized += "\n";
      if (source[index + 1] === "\n") {
        index += 1;
      }
    }

    return normalized;
  }

  private consumeNormalized(chunk: string) {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    const events: SseEvent[] = [];

    for (const line of lines) {
      if (line === "") {
        const event = this.dispatchEvent();
        if (event) events.push(event);
        continue;
      }

      if (line.startsWith(":")) continue;

      const separator = line.indexOf(":");
      const field = separator === -1 ? line : line.slice(0, separator);
      const rawValue = separator === -1 ? "" : line.slice(separator + 1);
      const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;

      if (field === "event") this.eventName = value;
      if (field === "data") this.dataLines.push(value);
    }

    return events;
  }

  private dispatchEvent(): SseEvent | undefined {
    if (!this.dataLines.length) {
      this.eventName = "message";
      return undefined;
    }

    let data: unknown;
    try {
      data = JSON.parse(this.dataLines.join("\n"));
    } catch {
      throw new InvalidSsePayloadError();
    }

    const event = { event: this.eventName, data };
    this.eventName = "message";
    this.dataLines = [];
    return event;
  }
}
