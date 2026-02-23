import { describe, it, expect } from "vitest";
import { isErrorResponse } from "./protocol.js";
import type {
  BridgeRequest,
  BridgeResponseSuccess,
  BridgeResponseError,
  BridgeResponse,
} from "./protocol.js";

describe("isErrorResponse", () => {
  it("returns true for error responses", () => {
    const resp: BridgeResponseError = { id: "1", error: "something broke" };
    expect(isErrorResponse(resp)).toBe(true);
  });

  it("returns false for success responses", () => {
    const resp: BridgeResponseSuccess = { id: "1", result: { pong: true } };
    expect(isErrorResponse(resp)).toBe(false);
  });
});

describe("protocol message format", () => {
  it("serializes a request as newline-delimited JSON", () => {
    const req: BridgeRequest = {
      id: "test-id",
      method: "ping",
      params: {},
    };
    const line = JSON.stringify(req) + "\n";
    expect(line).toBe('{"id":"test-id","method":"ping","params":{}}\n');
  });

  it("round-trips a success response through JSON", () => {
    const resp: BridgeResponseSuccess = {
      id: "abc",
      result: { tile_id: 42, palette_id: 2 },
    };
    const json = JSON.stringify(resp);
    const parsed: BridgeResponse = JSON.parse(json);
    expect(isErrorResponse(parsed)).toBe(false);
    expect((parsed as BridgeResponseSuccess).result.tile_id).toBe(42);
  });

  it("round-trips an error response through JSON", () => {
    const resp: BridgeResponseError = {
      id: "abc",
      error: "unknown method: foo",
    };
    const json = JSON.stringify(resp);
    const parsed: BridgeResponse = JSON.parse(json);
    expect(isErrorResponse(parsed)).toBe(true);
    expect((parsed as BridgeResponseError).error).toBe("unknown method: foo");
  });

  it("handles request with complex params", () => {
    const req: BridgeRequest = {
      id: "test",
      method: "read_memory",
      params: { address: 0x2000, length: 16, mem_type: "ppuDebug" },
    };
    const json = JSON.stringify(req);
    const parsed = JSON.parse(json);
    expect(parsed.params.address).toBe(0x2000);
    expect(parsed.params.length).toBe(16);
  });
});
