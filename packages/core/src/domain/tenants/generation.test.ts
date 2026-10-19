import { describe, expect, it } from "vitest";
import { assertCurrentGeneration } from "./generation";

describe("assertCurrentGeneration", () => {
  it("accepts the current generation, required or not", () => {
    expect(() => assertCurrentGeneration(2, 2, true)).not.toThrow();
    expect(() => assertCurrentGeneration(2, 2, false)).not.toThrow();
  });

  it("refuses a missing generation where it is required (API-034: 428)", () => {
    expect(() => assertCurrentGeneration(1, null, true)).toThrow(
      expect.objectContaining({ code: "GENERATION_REQUIRED", status: 428 }),
    );
  });

  it("lets a missing generation through where it is optional", () => {
    expect(() => assertCurrentGeneration(1, null, false)).not.toThrow();
  });

  it("refuses a stale generation, required or not (API-033: 409)", () => {
    for (const required of [true, false]) {
      expect(() => assertCurrentGeneration(2, 1, required)).toThrow(
        expect.objectContaining({
          code: "GENERATION_STALE",
          status: 409,
          message: "This tenant's data was reset since you read it: its generation is now 2. Reload and try again.",
        }),
      );
    }
  });
});
