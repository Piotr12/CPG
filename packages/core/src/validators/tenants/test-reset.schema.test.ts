import { describe, expect, it } from "vitest";
import { MAX_DATASET_GENERATION, testResetBodySchema, testResetSchema } from "./test-reset.schema";

describe("Test reset input", () => {
  it("accepts exactly a generation the API can represent", () => {
    expect(testResetSchema.parse({ generation: 1 })).toEqual({ generation: 1 });
    expect(testResetSchema.parse({ generation: MAX_DATASET_GENERATION })).toEqual({ generation: 999999999 });
    for (const generation of [0, -1, 1.5, 1000000000, "1", null]) expect(testResetSchema.safeParse({ generation }).success).toBe(false);
    expect(testResetSchema.safeParse({ generation: 1, tenant: "prod" }).success).toBe(false);
  });
  it("takes an optional dataset, tiny or realistic, beside the generation", () => {
    expect(testResetSchema.parse({ generation: 1, dataset: "realistic" })).toEqual({ generation: 1, dataset: "realistic" });
    expect(testResetSchema.parse({ generation: 1, dataset: "tiny" })).toEqual({ generation: 1, dataset: "tiny" });
    expect(testResetSchema.safeParse({ generation: 1, dataset: "huge" }).success).toBe(false);
  });
  it("accepts an empty API body or one naming a dataset, nothing else", () => {
    expect(testResetBodySchema.parse({})).toEqual({});
    expect(testResetBodySchema.parse({ dataset: "realistic" })).toEqual({ dataset: "realistic" });
    expect(testResetBodySchema.parse({ dataset: "tiny" })).toEqual({ dataset: "tiny" });
    for (const body of [{ tenant: "prod" }, { dataset: "huge" }, { dataset: null }, { dataset: "tiny", tenant: "prod" }, null]) {
      expect(testResetBodySchema.safeParse(body).success).toBe(false);
    }
  });
});
