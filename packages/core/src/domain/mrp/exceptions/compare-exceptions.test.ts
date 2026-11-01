import { describe, expect, it } from "vitest";
import type { MrpException } from "../mrp-result";
import { compareExceptions, exceptionLocation } from "./compare-exceptions";

const transfer = (overrides: Partial<Extract<MrpException, { code: "INSUFFICIENT_TRANSFER_STOCK" }>> = {}): MrpException => ({
  code: "INSUFFICIENT_TRANSFER_STOCK",
  transfer: "00000001",
  material: "M1",
  source: "L1",
  destination: "L2",
  date: "2026-10-05",
  planned: 10n,
  available: 0n,
  ...overrides,
});

describe("compareExceptions", () => {
  it("files a transfer's exception at its source", () => {
    expect(exceptionLocation(transfer({ source: "S" }))).toBe("S");
    expect(exceptionLocation({ code: "MISSING_BOM", material: "M1", location: "L9", date: "2026-10-01" })).toBe("L9");
  });

  it("orders by material, location, code rank, date (none first), then transfer, whatever the input order", () => {
    const ordered: MrpException[] = [
      { code: "INVALID_UOM_CONVERSION", material: "M1", location: "L1", record: "stock-balance" },
      { code: "MISSING_PLANNING_PARAMETERS", material: "M1", location: "L1", reason: "raw-make" },
      { code: "MISSING_PLANNING_PARAMETERS", material: "M1", location: "L1", date: "2026-10-02", reason: "raw-make" },
      transfer({ date: "2026-10-03", transfer: "00000009" }),
      transfer({ transfer: "00000002" }),
      transfer({ transfer: "00000003" }),
      { code: "MISSING_PLANNING_PARAMETERS", material: "M1", location: "L2", date: "2026-10-02", reason: "no-set" },
      { code: "MISSING_PLANNING_PARAMETERS", material: "M1", location: "L2", date: "2026-10-04", reason: "no-set" },
      { code: "MISSING_BOM", material: "M1", location: "L2", date: "2026-10-01" },
      { code: "INVALID_UOM_CONVERSION", material: "M2", location: "L0", record: "transfer", document: "00000001" },
    ];
    expect([...ordered].reverse().sort(compareExceptions)).toEqual(ordered);
    expect(compareExceptions(ordered[4], { ...ordered[4] })).toBe(0);
    const invalid: MrpException = { code: "INVALID_UOM_CONVERSION", material: "M1", location: "L1", record: "stock-balance" };
    expect(compareExceptions(invalid, { ...invalid, record: "forecast" })).toBe(0);
  });
});
