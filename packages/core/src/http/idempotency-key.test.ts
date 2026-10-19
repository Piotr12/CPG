import { describe, expect, it } from "vitest";
import { IdempotencyKeyRequiredError, PreconditionRequiredError } from "./errors";
import {
  GENERATION_HEADER,
  IDEMPOTENCY_KEY_HEADER,
  readGeneration,
  readIdempotencyKey,
  REPLAYED_HEADER,
} from "./idempotency-key";

const withHeaders = (headers: Record<string, string>) => new Request("http://cpg.test/api/users", { method: "POST", headers });

describe("readIdempotencyKey", () => {
  it("names the headers the API contract uses", () => {
    expect([IDEMPOTENCY_KEY_HEADER, GENERATION_HEADER, REPLAYED_HEADER]).toEqual([
      "Idempotency-Key",
      "Dataset-Generation",
      "Idempotent-Replayed",
    ]);
  });

  it("returns the key as sent, case included", () => {
    expect(readIdempotencyKey(withHeaders({ "idempotency-key": "Run-42_a.b~!" }))).toBe("Run-42_a.b~!");
    expect(readIdempotencyKey(withHeaders({ "Idempotency-Key": "k".repeat(255) }))).toHaveLength(255);
  });

  it.each([
    ["missing", {}],
    ["empty", { "Idempotency-Key": "" }],
    ["256 characters", { "Idempotency-Key": "k".repeat(256) }],
    ["an inner space", { "Idempotency-Key": "two words" }],
    ["a non-ASCII character", { "Idempotency-Key": "cl\u00e9" }],
  ])("refuses a key that is %s (API-019)", (_case, headers) => {
    expect(() => readIdempotencyKey(withHeaders(headers))).toThrow(IdempotencyKeyRequiredError);
  });
});

describe("readGeneration", () => {
  it("returns null when none was sent", () => {
    expect(readGeneration(withHeaders({}))).toBeNull();
  });

  it("parses a whole number from 1", () => {
    expect(readGeneration(withHeaders({ "Dataset-Generation": "1" }))).toBe(1);
    expect(readGeneration(withHeaders({ "dataset-generation": " 42 " }))).toBe(42);
  });

  it.each(["0", "-1", "1.5", "01", "1e3", "two", "", "1234567890"])("refuses %j as GENERATION_REQUIRED", (value) => {
    const read = () => readGeneration(withHeaders({ "Dataset-Generation": value }));
    expect(read).toThrow(PreconditionRequiredError);
    expect(read).toThrow(expect.objectContaining({ code: "GENERATION_REQUIRED", status: 428 }));
  });
});
