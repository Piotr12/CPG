import { describe, expect, it } from "vitest";
import { exceptionParams, toStoredException } from "./stored-exception";

describe("toStoredException and exceptionParams", () => {
  it("stores Invalid UoM Conversion without a date, naming the record and its document when it has one", () => {
    const stored = toStoredException({ code: "INVALID_UOM_CONVERSION", material: "M1", location: "L1", record: "customer-order-line", document: "00000004/2" });
    expect(stored).toEqual({ code: "INVALID_UOM_CONVERSION", material: "M1", location: "L1", date: null, details: { record: "customer-order-line", document: "00000004/2" } });
    expect(exceptionParams(stored)).toEqual({ material: "M1", location: "L1", record: "customer-order-line", document: "00000004/2" });
    expect(toStoredException({ code: "INVALID_UOM_CONVERSION", material: "M1", location: "L1", record: "stock-balance" }).details).toEqual({ record: "stock-balance" });
  });

  it("stores Missing Planning Parameters with its reason, and its date only when it has one", () => {
    const dated = toStoredException({ code: "MISSING_PLANNING_PARAMETERS", material: "M1", location: "L1", date: "2026-10-04", reason: "no-set" });
    expect(dated).toMatchObject({ date: "2026-10-04", details: { reason: "no-set" } });
    expect(exceptionParams(dated)).toEqual({ material: "M1", location: "L1", date: "2026-10-04", reason: "no-set" });
    const undated = toStoredException({ code: "MISSING_PLANNING_PARAMETERS", material: "M1", location: "L1", reason: "raw-make" });
    expect(undated.date).toBeNull();
    expect(exceptionParams(undated)).toEqual({ material: "M1", location: "L1", reason: "raw-make" });
  });

  it("stores Missing BOM with its date and no details", () => {
    const stored = toStoredException({ code: "MISSING_BOM", material: "M1", location: "L2", date: "2026-10-09" });
    expect(stored).toEqual({ code: "MISSING_BOM", material: "M1", location: "L2", date: "2026-10-09", details: null });
    expect(exceptionParams(stored)).toEqual({ material: "M1", location: "L2", date: "2026-10-09" });
  });

  it("stores Insufficient Transfer Stock at its source, its quantities as six-decimal texts", () => {
    const stored = toStoredException({
      code: "INSUFFICIENT_TRANSFER_STOCK", transfer: "00000003", material: "M1", source: "S", destination: "D", date: "2026-10-02", planned: 100_000_000n, available: 60_500_000n,
    });
    expect(stored).toEqual({
      code: "INSUFFICIENT_TRANSFER_STOCK", material: "M1", location: "S", date: "2026-10-02",
      details: { transfer: "00000003", destination: "D", planned: "100.000000", available: "60.500000" },
    });
    expect(exceptionParams(stored)).toEqual({ material: "M1", location: "S", date: "2026-10-02", transfer: "00000003", destination: "D", planned: "100.000000", available: "60.500000" });
  });
});
