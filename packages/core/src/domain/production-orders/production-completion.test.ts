import { describe, expect, it } from "vitest";
import {
  consumptionVariance,
  exceedsTarget,
  expectedConsumption,
  productionOutstanding,
  producedAfter,
  productionStatus,
} from "./production-completion";

describe("production completion arithmetic", () => {
  it("scales the pinned per-output quantity by the output exactly (PRD-010, BOM-007)", () => {
    expect(expectedConsumption("0.500000", "4.000000")).toBe("2.000000");
    expect(expectedConsumption("2.000000", "4.000000")).toBe("8.000000");
    expect(expectedConsumption("0.125000", "4.000000")).toBe("0.500000");
  });
  it("rounds an inexact expectation upward once, and expects nothing for zero output (PRD-018)", () => {
    expect(expectedConsumption("0.333333", "0.5")).toBe("0.166667");
    expect(expectedConsumption("0.000001", "0.000001")).toBe("0.000001");
    expect(expectedConsumption("3.000000", "0.000000")).toBe("0.000000");
    expect(() => expectedConsumption("999999999999", "2")).toThrow("Some fields are invalid.");
  });
  it("signs the variance as actual minus expected (PRD-013, PRD-014)", () => {
    expect(consumptionVariance("20.000000", "18.000000")).toBe("-2.000000");
    expect(consumptionVariance("20.000000", "23.000000")).toBe("3.000000");
    expect(consumptionVariance("20.000000", "20.000000")).toBe("0.000000");
    expect(consumptionVariance("0.000000", "10.000000")).toBe("10.000000");
    expect(consumptionVariance("0.000001", "0.000000")).toBe("-0.000001");
  });
  it("adds the output to produced and refuses a total too large to store", () => {
    expect(producedAfter("40.000000", "25.000000")).toBe("65.000000");
    expect(producedAfter("40.000000", "0.000000")).toBe("40.000000");
    expect(producedAfter("999999999999.999998", "0.000001")).toBe("999999999999.999999");
    expect(() => producedAfter("999999999999.999999", "0.000001")).toThrow(expect.objectContaining({ code: "QUANTITY_OUT_OF_RANGE" }));
  });
  it("tells overproduction from reaching the target exactly (PRD-019, PRD-030)", () => {
    expect(exceedsTarget("105.000000", "100.000000")).toBe(true);
    expect(exceedsTarget("100.000000", "100.000000")).toBe(false);
    expect(exceedsTarget("99.999999", "100.000000")).toBe(false);
  });
  it("completes an order at or above its target and keeps it open below (LFC-003, spec Q8)", () => {
    expect(productionStatus("100.000000", "100.000000")).toBe("completed");
    expect(productionStatus("105.000000", "100.000000")).toBe("completed");
    expect(productionStatus("65.000000", "100.000000")).toBe("open");
    expect(productionStatus("0.000000", "100.000000")).toBe("open");
  });
  it("reports what is still to produce, never below zero", () => {
    expect(productionOutstanding("100.000000", "40.000000")).toBe("60.000000");
    expect(productionOutstanding("100.000000", "100.000000")).toBe("0.000000");
    expect(productionOutstanding("100.000000", "105.000000")).toBe("0.000000");
  });
});
