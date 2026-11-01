import { describe, expect, it } from "vitest";
import { parseDecimal } from "../../quantities/decimal";
import type { MrpOverdueSupply, MrpOverdueTransfer, MrpPlan, MrpWarning } from "../mrp-result";
import { compareWarnings, isMrpWarningCode, MRP_WARNING_CODES, overdueWarnings, toStoredWarning } from "./overdue";

const q = (text: string) => parseDecimal(text)!;
const TODAY = "2026-10-01";

const supply = (overrides: Partial<MrpOverdueSupply>): MrpOverdueSupply => ({
  code: "OVERDUE_SUPPLY", material: "M1", location: "L1", date: TODAY, source: "purchase-order", document: "00000001", plannedDate: "2026-09-28", quantity: q("30"), ...overrides,
});
const arrival = (overrides: Partial<MrpOverdueTransfer>): MrpOverdueTransfer => ({
  code: "OVERDUE_TRANSFER", material: "M1", location: "L1", date: TODAY, transfer: "00000002", stage: "in-transit", plannedDate: "2026-09-30", quantity: q("25"), ...overrides,
});

describe("overdueWarnings", () => {
  const empty = { physical: 0n, buckets: [], firmDemand: [], forecastDemand: [], componentDemand: [], transfersOut: [], shortages: [] };

  it("warns of every overdue purchase-order line, requisition, production output and arrival of the pair, and of nothing on time", () => {
    const plan: MrpPlan = {
      ...empty,
      material: "M1",
      location: "L1",
      supply: [
        { kind: "purchase-order", reliability: "dependable", document: "00000001", position: 2, material: "M1", location: "L1", plannedDate: "2026-09-28", date: TODAY, overdue: true, quantity: q("30") },
        { kind: "requisition", reliability: "tentative", document: "00000004", position: null, material: "M1", location: "L1", plannedDate: "2026-09-29", date: TODAY, overdue: true, quantity: q("7") },
        { kind: "purchase-order", reliability: "dependable", document: "00000005", position: 1, material: "M1", location: "L1", plannedDate: "2026-10-03", date: "2026-10-03", overdue: false, quantity: q("9") },
      ],
      productionOutput: [
        { order: "00000003", material: "M1", location: "L1", plannedFinish: "2026-09-27", date: TODAY, quantity: q("20"), overdue: true },
        { order: "00000006", material: "M1", location: "L1", plannedFinish: TODAY, date: TODAY, quantity: q("4"), overdue: false },
      ],
      transfersIn: [
        { transfer: "00000002", material: "M1", location: "L1", stage: "in-transit", plannedDate: "2026-09-30", date: TODAY, quantity: q("25"), overdue: true },
        { transfer: "00000008", material: "M1", location: "L1", stage: "planned", plannedDate: "2026-10-04", date: "2026-10-04", quantity: q("3"), overdue: false },
      ],
    };
    expect(overdueWarnings(plan)).toEqual([
      supply({ position: 2 }),
      supply({ source: "requisition", document: "00000004", plannedDate: "2026-09-29", quantity: q("7") }),
      supply({ source: "production-order", document: "00000003", plannedDate: "2026-09-27", quantity: q("20") }),
      arrival({}),
    ]);
  });
});

describe("compareWarnings", () => {
  it("orders every warning the same way whatever the input order, telling apart one transfer's two arrivals and two kinds of document with one ID", () => {
    const sorted: MrpWarning[] = [
      supply({ material: "M1", location: "L1", plannedDate: "2026-09-20" }),
      supply({ material: "M1", location: "L1", plannedDate: "2026-09-28", source: "production-order", document: "00000007" }),
      supply({ material: "M1", location: "L1", plannedDate: "2026-09-28", source: "purchase-order", document: "00000001", position: 1 }),
      supply({ material: "M1", location: "L1", plannedDate: "2026-09-28", source: "purchase-order", document: "00000001", position: 3 }),
      supply({ material: "M1", location: "L1", plannedDate: "2026-09-28", source: "purchase-order", document: "00000002", position: 1 }),
      supply({ material: "M1", location: "L1", plannedDate: "2026-09-28", source: "requisition", document: "00000007" }),
      arrival({ material: "M1", location: "L1", stage: "in-transit", transfer: "00000002" }),
      arrival({ material: "M1", location: "L1", stage: "planned", transfer: "00000002" }),
      supply({ material: "M1", location: "L2" }),
      arrival({ material: "M2", location: "L1" }),
    ];
    expect([...sorted].reverse().sort(compareWarnings)).toEqual(sorted);
    expect([...sorted.slice(5), ...sorted.slice(0, 5)].sort(compareWarnings)).toEqual(sorted);
    // A missing position sorts first.
    expect(compareWarnings(supply({ position: undefined }), supply({ position: 1 }))).toBeLessThan(0);
  });
});

describe("toStoredWarning", () => {
  it("stores a purchase-order line's warning with its position and a six-decimal quantity", () => {
    expect(toStoredWarning(supply({ position: 2 }))).toEqual({
      code: "OVERDUE_SUPPLY", material: "M1", location: "L1", date: TODAY,
      details: { source: "purchase-order", document: "00000001", position: "2", plannedDate: "2026-09-28", quantity: "30.000000" },
    });
  });

  it("stores a requisition's or production order's warning without a position, and an arrival with its transfer and stage", () => {
    expect(toStoredWarning(supply({ source: "requisition", quantity: q("0.5") })).details).toEqual({ source: "requisition", document: "00000001", plannedDate: "2026-09-28", quantity: "0.500000" });
    expect(toStoredWarning(arrival({}))).toEqual({
      code: "OVERDUE_TRANSFER", material: "M1", location: "L1", date: TODAY,
      details: { transfer: "00000002", stage: "in-transit", plannedDate: "2026-09-30", quantity: "25.000000" },
    });
  });
});

describe("isMrpWarningCode", () => {
  it("knows the two warning codes and no exception code", () => {
    expect(MRP_WARNING_CODES.every(isMrpWarningCode)).toBe(true);
    expect(isMrpWarningCode("MISSING_BOM")).toBe(false);
    expect(isMrpWarningCode("INSUFFICIENT_TRANSFER_STOCK")).toBe(false);
  });
});
