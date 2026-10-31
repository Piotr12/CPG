import { describe, expect, it } from "vitest";
import { PLANNED_START_YEAR_MESSAGE, REQUIREMENT_OVERFLOW_MESSAGE } from "../../validators/production-orders/production-order.schema";
import { componentRequirement, plannedStart, scaledMicro } from "./production-planning";

describe("production planning", () => {
  it("subtracts whole calendar days across weekends, leap days and years (PRD-007)", () => {
    expect(plannedStart("2026-10-15", 5)).toBe("2026-10-10");
    expect(plannedStart("2028-03-01", 1)).toBe("2028-02-29");
    expect(plannedStart("2027-01-01", 2)).toBe("2026-12-30");
    expect(plannedStart("0000-01-01", 0)).toBe("0000-01-01");
    expect(() => plannedStart("0000-01-01", 1)).toThrow(expect.objectContaining({ fieldErrors: { plannedFinish: [PLANNED_START_YEAR_MESSAGE] } }));
  });
  it("rounds tiny positive requirements upward and reports exact shortages", () => {
    expect(componentRequirement("0.000001", "0.000001", "0.000000")).toEqual({ required: "0.000001", available: "0.000000", shortage: "0.000001" });
    expect(componentRequirement("0.333333", "3", "2.000000")).toEqual({ required: "0.999999", available: "2.000000", shortage: "0.000000" });
    expect(componentRequirement("2", "30", "30.000000")).toEqual({ required: "60.000000", available: "30.000000", shortage: "30.000000" });
    expect(() => componentRequirement("999999999999", "2", "0")).toThrow(expect.objectContaining({ fieldErrors: { quantity: [REQUIREMENT_OVERFLOW_MESSAGE] } }));
  });
  it("scales micro-units exactly and rounds a remainder upward once (#277)", () => {
    expect(scaledMicro(2_000_000n, 60_000_000n)).toBe(120_000_000n);
    expect(scaledMicro(333_333n, 3_000_000n)).toBe(999_999n);
    expect(scaledMicro(1n, 1n)).toBe(1n);
    expect(scaledMicro(1_500_000n, 0n)).toBe(0n);
    expect(scaledMicro(999_999_999_999_000_000n, 2_000_000n)).toBe(1_999_999_999_998_000_000n);
  });
});
