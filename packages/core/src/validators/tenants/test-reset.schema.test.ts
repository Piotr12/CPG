import { describe, expect, it } from "vitest";
import { MAX_DATASET_GENERATION, testResetBodySchema, testResetSchema } from "./test-reset.schema";

describe("Test reset input", () => {
  it("accepts exactly a generation the API can represent", () => {
    expect(testResetSchema.parse({ generation: 1 })).toEqual({ generation: 1 });
    expect(testResetSchema.parse({ generation: MAX_DATASET_GENERATION })).toEqual({ generation: 999999999 });
    for (const generation of [0, -1, 1.5, 1000000000, "1", null]) expect(testResetSchema.safeParse({ generation }).success).toBe(false);
    expect(testResetSchema.safeParse({ generation: 1, tenant: "prod" }).success).toBe(false);
  });
  it("accepts only an empty API body", () => {
    expect(testResetBodySchema.parse({})).toEqual({});
    expect(testResetBodySchema.safeParse({ tenant: "prod" }).success).toBe(false);
    expect(testResetBodySchema.safeParse(null).success).toBe(false);
  });
});
