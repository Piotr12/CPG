import { describe, expect, it } from "vitest";
import { customerOrderLifecycleSchema, documentLifecycleSchema, purchaseOrderLifecycleSchema } from "./lifecycle.schema";

const line = "b39a1861-4d27-4df5-8eee-d4c9879053d4";
describe("lifecycle commands", () => {
  it("accepts whole documents and native CO/PO line identifiers", () => {
    for (const schema of [documentLifecycleSchema, customerOrderLifecycleSchema, purchaseOrderLifecycleSchema]) {
      expect(schema.parse({ version: 2 })).toEqual({ version: 2 });
    }
    expect(customerOrderLifecycleSchema.parse({ version: 2, lines: [line] })).toEqual({ version: 2, lines: [line] });
    expect(purchaseOrderLifecycleSchema.parse({ version: 3, lines: [1, 2] })).toEqual({ version: 3, lines: [1, 2] });
  });
  it("refuses invalid versions, unknown mutation fields, empty/duplicate/oversized and malformed selections", () => {
    for (const value of [{}, { version: 0 }, { version: "1" }, { version: 1.5 }, { version: 1, status: "completed" }, { version: 1, lines: [1] }]) {
      expect(documentLifecycleSchema.safeParse(value).success).toBe(false);
    }
    for (const lines of [[], [line, line], ["1"], Array.from({ length: 101 }, () => line)]) {
      expect(customerOrderLifecycleSchema.safeParse({ version: 1, lines }).success).toBe(false);
    }
    for (const lines of [[], [1, 1], [0], [1.5], ["1"], [line], Array.from({ length: 101 }, (_, i) => i + 1)]) {
      expect(purchaseOrderLifecycleSchema.safeParse({ version: 1, lines }).success).toBe(false);
    }
  });
});
