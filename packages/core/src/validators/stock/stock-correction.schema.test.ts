import { describe, expect, it } from "vitest";
import { stockCorrectionSchema, stockPostingSchema, stockPairSchema, STOCK_QUANTITY_MESSAGE, STOCK_REASON_MESSAGE } from "./stock-correction.schema";
const line = { material: "00000001", location: "00000002", quantity: " -2.5 ", unit: " each ", reason: " Return " };
describe("stock input", () => {
  it("keeps only writable fields, trims input and discards caller dates/provenance", () => {
    expect(stockCorrectionSchema.parse({ ...line, date: "1900-01-01", actor: "x", numerator: "100" })).toEqual({ ...line, quantity: "-2.5", unit: "each", reason: "Return" });
    expect(stockPairSchema.parse(line)).toEqual({ material: line.material, location: line.location });
  });
  it.each(["0", "-0.000000", "bad", "1e2", "0.0000001", 2, undefined])("refuses invalid/zero quantity %s", (quantity) => {
    const result = stockCorrectionSchema.safeParse({ ...line, quantity });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe(STOCK_QUANTITY_MESSAGE);
  });
  it.each(["", " ", "x".repeat(501), undefined])("requires a bounded reason", (reason) => {
    const result = stockCorrectionSchema.safeParse({ ...line, reason });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.at(-1)?.message).toBe(STOCK_REASON_MESSAGE);
  });
  it("bounds a trusted posting group", () => {
    expect(stockPostingSchema.safeParse({ lines: [], reason: "x" }).success).toBe(false);
    expect(stockPostingSchema.safeParse({ lines: Array(101).fill(line), reason: "x" }).success).toBe(false);
    expect(stockPostingSchema.parse({ lines: [line], reason: "x" }).lines).toHaveLength(1);
  });
});
