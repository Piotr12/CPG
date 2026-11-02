import { describe, expect, it } from "vitest";
import { MRP_EXCEPTION_CODES, MRP_EXCEPTION_FALLBACK_MESSAGE, MRP_EXCEPTION_MESSAGES, mrpExceptionMessage, mrpExceptionRank } from "./codes";

describe("MRP exception codes", () => {
  it("rank Invalid UoM, Missing Planning Parameters, Missing BOM, Missing Usable BOM, BOM Cycle, No Feasible BOM (#282), At-Risk Production (#283), then Insufficient Transfer Stock (spec Q11)", () => {
    expect(MRP_EXCEPTION_CODES.map(mrpExceptionRank)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(MRP_EXCEPTION_CODES).toEqual([
      "INVALID_UOM_CONVERSION",
      "MISSING_PLANNING_PARAMETERS",
      "MISSING_BOM",
      "MISSING_USABLE_BOM",
      "CYCLIC_BOM",
      "NO_FEASIBLE_BOM",
      "AT_RISK_PRODUCTION",
      "INSUFFICIENT_TRANSFER_STOCK",
    ]);
  });

  it("give every code a fixed message with no record ID in it, and a fallback for a code this image doesn't know", () => {
    for (const code of MRP_EXCEPTION_CODES) {
      expect(mrpExceptionMessage(code)).toBe(MRP_EXCEPTION_MESSAGES[code]);
      expect(MRP_EXCEPTION_MESSAGES[code]).not.toMatch(/\d/);
    }
    expect(mrpExceptionMessage("REJECTED_BOM_FROM_A_NEWER_IMAGE")).toBe(MRP_EXCEPTION_FALLBACK_MESSAGE);
  });
});
