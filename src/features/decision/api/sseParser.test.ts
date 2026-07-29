import { describe, expect, it } from "vitest";
import { InvalidSsePayloadError, SseParser } from "./sseParser";

describe("SseParser", () => {
  it("parses CRLF line endings contained in one chunk", () => {
    const parser = new SseParser();

    expect(
      parser.push(
        'event: complete\r\ndata: {"request_id":"one"}\r\n\r\n',
      ),
    ).toEqual([
      {
        event: "complete",
        data: {
          request_id: "one",
        },
      },
    ]);
  });

  it("holds a carriage return at the end of a chunk", () => {
    const parser = new SseParser();

    expect(parser.push("event: complete\r")).toEqual([]);
    expect(parser.push("")).toEqual([]);
  });

  it("coalesces a leading line feed with a pending carriage return", () => {
    const parser = new SseParser();

    expect(parser.push("event: complete\r")).toEqual([]);
    expect(parser.push('\ndata: {"ok":true}\r\n\r\n')).toEqual([
      {
        event: "complete",
        data: {
          ok: true,
        },
      },
    ]);
  });

  it("handles a CRLF split inside a data event", () => {
    const parser = new SseParser();

    expect(
      parser.push('event: complete\r\ndata: {"ok":true}\r'),
    ).toEqual([]);
    expect(parser.push("\n\r\n")).toEqual([
      {
        event: "complete",
        data: {
          ok: true,
        },
      },
    ]);
  });

  it("handles a CRLF split at event termination", () => {
    const parser = new SseParser();

    expect(
      parser.push('event: complete\r\ndata: {"ok":true}\r\n\r'),
    ).toEqual([]);
    expect(parser.push("\n")).toEqual([
      {
        event: "complete",
        data: {
          ok: true,
        },
      },
    ]);
  });

  it("does not dispatch before the blank-line terminator", () => {
    const parser = new SseParser();

    expect(
      parser.push('event: complete\r\ndata: {"ok":true}\r\n'),
    ).toEqual([]);
  });

  it("parses multiple events after a split CRLF", () => {
    const parser = new SseParser();

    expect(
      parser.push('event: stage_update\r\ndata: []\r\n\r'),
    ).toEqual([]);
    expect(
      parser.push(
        '\nevent: complete\r\ndata: {"request_id":"two"}\r\n\r\n',
      ),
    ).toEqual([
      {
        event: "stage_update",
        data: [],
      },
      {
        event: "complete",
        data: {
          request_id: "two",
        },
      },
    ]);
  });

  it("parses an event divided across ordinary chunks", () => {
    const parser = new SseParser();

    expect(
      parser.push('event: error\ndata: {"message":"split'),
    ).toEqual([]);
    expect(parser.push('"}\n\n')).toEqual([
      {
        event: "error",
        data: {
          message: "split",
        },
      },
    ]);
  });

  it("ignores comment-only events", () => {
    const parser = new SseParser();
    expect(parser.push(": keepalive\n\n")).toEqual([]);
  });

  it("throws a typed safe error for malformed JSON", () => {
    const parser = new SseParser();

    expect(() =>
      parser.push("event: complete\ndata: not-json\n\n"),
    ).toThrow(InvalidSsePayloadError);
  });

  it("discards an unterminated event at end of stream", () => {
    const parser = new SseParser();

    expect(
      parser.push('event: complete\ndata: {"ok":true}'),
    ).toEqual([]);
    expect(parser.end()).toEqual([]);
  });

  it("resolves a trailing carriage return without inventing a terminator", () => {
    const parser = new SseParser();

    expect(
      parser.push('event: complete\r\ndata: {"ok":true}\r'),
    ).toEqual([]);
    expect(parser.end()).toEqual([]);
  });
});
