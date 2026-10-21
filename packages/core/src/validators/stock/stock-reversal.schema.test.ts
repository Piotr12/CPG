import { describe, expect, it } from "vitest";
import { stockMovementIdSchema, stockReversalActionSchema, stockReversalSchema } from "./stock-reversal.schema";

describe("stock reversal input", () => {
  const movementId = "11111111-1111-4111-8111-111111111111";
  it("accepts only a reason and an immutable movement reference", () => {
    expect(stockReversalSchema.parse({ reason: " Wrong quantity " })).toEqual({ reason: "Wrong quantity" });
    expect(stockReversalActionSchema.parse({ reason: "Wrong quantity", movementId })).toEqual({ reason: "Wrong quantity", movementId });
    expect(stockMovementIdSchema.safeParse("00000001").success).toBe(false);
  });
  it.each(["", "   ", "x".repeat(501), null])("refuses invalid reason %j", (reason) => {
    expect(stockReversalSchema.safeParse({ reason }).success).toBe(false);
  });
  it.each(["quantity", "date", "material", "location", "source", "unit"])("refuses client-supplied %s instead of silently ignoring it", (field) => {
    expect(stockReversalSchema.safeParse({ reason: "Wrong quantity", [field]: "1" }).success).toBe(false);
  });
});
