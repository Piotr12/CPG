import { z } from "zod";
import { describe, expect, it } from "vitest";
import { ValidationError } from "./errors";
import { parseInput, validationError } from "./parse-input";

const schema = z.object({ limit: z.coerce.number().int().min(1) });

describe("parseInput", () => {
  it("returns the parsed value", () => {
    expect(parseInput(schema, { limit: "5" })).toEqual({ limit: 5 });
  });

  it("throws a ValidationError naming the bad field", () => {
    expect(() => parseInput(schema, { limit: "0" })).toThrow(ValidationError);
    let caught: unknown;
    try {
      parseInput(schema, { limit: "x" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "VALIDATION_FAILED", status: 400, fieldErrors: { limit: [expect.any(String)] } });
  });
});

describe("validationError", () => {
  it("carries the field errors of a failed parse", () => {
    const parsed = schema.safeParse({});
    expect(parsed.success).toBe(false);
    expect(validationError(parsed.error!).fieldErrors).toEqual({ limit: [expect.any(String)] });
  });
});
