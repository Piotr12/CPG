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

  it("stores BOM Cycle with no date and its path as its one detail (#281)", () => {
    const path = "M1 →(BOM 00000002) M2 →(BOM 00000003) M1";
    const stored = toStoredException({ code: "CYCLIC_BOM", material: "M1", location: "L2", path });
    expect(stored).toEqual({ code: "CYCLIC_BOM", material: "M1", location: "L2", date: null, details: { path } });
    expect(exceptionParams(stored)).toEqual({ material: "M1", location: "L2", path });
  });

  it("stores Missing Usable BOM with its date and each valid BOM's inactive components in the neutral notation (#282)", () => {
    const inactive = [{ bom: "00000004", revision: 1, materials: ["00000011", "00000012"] }, { bom: "00000005", revision: 3, materials: ["00000013"] }];
    const stored = toStoredException({ code: "MISSING_USABLE_BOM", material: "M1", location: "L2", date: "2026-10-09", inactive });
    expect(stored).toEqual({ code: "MISSING_USABLE_BOM", material: "M1", location: "L2", date: "2026-10-09", details: { inactive: "00000004/1: 00000011, 00000012; 00000005/3: 00000013" } });
    expect(exceptionParams(stored)).toEqual({ material: "M1", location: "L2", date: "2026-10-09", inactive: "00000004/1: 00000011, 00000012; 00000005/3: 00000013" });
  });

  it("stores No Feasible BOM on the proposal's need date, each usable BOM's shortages as required, available and shortage texts, and inactive BOMs only when there are some (#282)", () => {
    const shortage = (material: string, required: bigint, available: bigint) => ({ material, required, available, shortage: required - available });
    const short = [
      { bom: "00000004", revision: 1, reason: "shortage" as const, shortages: [shortage("00000011", 6_000_000n, 5_000_000n), shortage("00000013", 500_000n, 0n)] },
      { bom: "00000005", revision: 2, reason: "shortage" as const, shortages: [shortage("00000012", 6_000_000n, 3_000_000n)] },
    ];
    const missing = "00000004/1: 00000011 6.000000 5.000000 1.000000, 00000013 0.500000 0.000000 0.500000; 00000005/2: 00000012 6.000000 3.000000 3.000000";
    const stored = toStoredException({ code: "NO_FEASIBLE_BOM", material: "M1", location: "L1", date: "2026-10-05", rejections: short });
    const order = "00000004/1, 00000005/2";
    expect(stored).toEqual({ code: "NO_FEASIBLE_BOM", material: "M1", location: "L1", date: "2026-10-05", details: { missing, order } });
    expect(exceptionParams(stored)).toEqual({ material: "M1", location: "L1", date: "2026-10-05", missing, order });
    const withInactive = toStoredException({
      code: "NO_FEASIBLE_BOM", material: "M1", location: "L1", date: "2026-10-05",
      rejections: [{ bom: "00000003", revision: 1, reason: "inactive-component", materials: ["00000014"] }, ...short],
    });
    // `order` keeps the engine's order across both lists (E18-S03 spec Q3).
    expect(withInactive.details).toEqual({ missing, inactive: "00000003/1: 00000014", order: "00000003/1, 00000004/1, 00000005/2" });
  });

  it("stores At-Risk Production on the order's planned finish, its quantity as a six-decimal text and its inactive components joined (#283)", () => {
    const stored = toStoredException({
      code: "AT_RISK_PRODUCTION", material: "M1", location: "L1", date: "2026-10-08", order: "00000007", quantity: 12_500_000n, inactiveComponents: ["00000011", "00000012"],
    });
    expect(stored).toEqual({ code: "AT_RISK_PRODUCTION", material: "M1", location: "L1", date: "2026-10-08", details: { order: "00000007", quantity: "12.500000", inactiveComponents: "00000011, 00000012" } });
    expect(exceptionParams(stored)).toEqual({ material: "M1", location: "L1", date: "2026-10-08", order: "00000007", quantity: "12.500000", inactiveComponents: "00000011, 00000012" });
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
