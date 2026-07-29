import { describe, expect, it } from "vitest";
import { InvalidSsePayloadError, SseParser } from "./sseParser";

describe("SseParser", () => {
  it("handles complete, split, multi-event, and CRLF chunks", () => {
    const parser = new SseParser();
    expect(parser.push('event: stage_update\r\ndata: [{"id":"input"}]\r\n\r\nevent: complete\r\ndata: {"ok":true}\r\n\r\n')).toEqual([
      { event: "stage_update", data: [{ id: "input" }] }, { event: "complete", data: { ok: true } },
    ]);
    expect(parser.push('event: error\ndata: {"message":"split')).toEqual([]);
    expect(parser.push('"}\n\n')).toEqual([{ event: "error", data: { message: "split" } }]);
  });

  it("throws for malformed JSON and ignores comments", () => {
    const parser = new SseParser();
    expect(parser.push(": keepalive\n\n")).toEqual([]);
    expect(() => parser.push("event: complete\ndata: nope\n\n")).toThrow(InvalidSsePayloadError);
  });
});
