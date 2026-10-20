import { describe, expect, it } from "vitest";
import { addQuantities, afterConversion, fitsOutstanding, outstandingQuantity } from "./requisition-quantity";

describe("requisition quantities", () => {
  it("shows what is still outstanding with six decimals", () => {
    expect(outstandingQuantity("100.000000", "60.000000")).toBe("40.000000");
    expect(outstandingQuantity("0.300000", "0.100000")).toBe("0.200000");
    expect(outstandingQuantity("5.000000", "5.000000")).toBe("0.000000");
  });

  it("lets a line take up to exactly what is outstanding, and no more", () => {
    expect(fitsOutstanding("100.000000", "60.000000", "40.000000")).toBe(true);
    expect(fitsOutstanding("100.000000", "60.000000", "39.999999")).toBe(true);
    expect(fitsOutstanding("100.000000", "60.000000", "40.000001")).toBe(false);
  });

  it("adds the converted quantity and stays open until it equals the quantity (BUY-003, BUY-004)", () => {
    expect(afterConversion("100.000000", "0.000000", "60.000000")).toEqual({ converted: "60.000000", status: "open" });
    expect(afterConversion("100.000000", "60.000000", "40.000000")).toEqual({ converted: "100.000000", status: "completed" });
  });

  it("adds two quantities exactly", () => {
    expect(addQuantities("0.100000", "0.200000")).toBe("0.300000");
    expect(addQuantities("0.000000", "60.000000")).toBe("60.000000");
  });
});
