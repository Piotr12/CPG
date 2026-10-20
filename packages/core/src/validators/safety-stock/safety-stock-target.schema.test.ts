import { describe, expect, it } from "vitest";
import { CALENDAR_DATE_MESSAGE } from "../dates/calendar-date.schema";
import { QUANTITY_MESSAGE } from "../quantities/quantity.schema";
import {
  safetyStockTargetChangeBodySchema,
  safetyStockTargetChangeFormSchema,
  safetyStockTargetChangeSchema,
  safetyStockTargetCreateSchema,
  safetyStockTargetRemoveBodySchema,
  safetyStockTargetRemoveSchema,
} from "./safety-stock-target.schema";

const target = { material: "00000005", location: "00000001", effectiveFrom: "2027-01-01", quantity: "20" };

describe("safetyStockTargetCreateSchema", () => {
  it("parses a target, the quantity in the six-decimal form", () => {
    expect(safetyStockTargetCreateSchema.parse(target)).toEqual({ ...target, quantity: "20.000000" });
  });

  it("accepts a target of 0, which ends a buffer from its date", () => {
    expect(safetyStockTargetCreateSchema.parse({ ...target, quantity: "0" }).quantity).toBe("0.000000");
  });

  it("refuses an impossible date and a negative quantity", () => {
    const result = safetyStockTargetCreateSchema.safeParse({ ...target, effectiveFrom: "2026-02-30", quantity: "-1" });
    expect(result.error?.issues.map(({ path, message }) => [path[0], message])).toEqual([
      ["effectiveFrom", CALENDAR_DATE_MESSAGE],
      ["quantity", QUANTITY_MESSAGE],
    ]);
  });
});

describe("change and remove", () => {
  const row = { material: "00000005", location: "00000001", effectiveFrom: "2027-01-01", version: 2 };

  it("change a quantity at a version, by API body or bound row", () => {
    expect(safetyStockTargetChangeBodySchema.parse({ quantity: "40", version: 2 })).toEqual({ quantity: "40.000000", version: 2 });
    expect(safetyStockTargetChangeFormSchema.parse({ quantity: "40" })).toEqual({ quantity: "40.000000" });
    expect(safetyStockTargetChangeSchema.parse({ quantity: "40", ...row })).toEqual({ quantity: "40.000000", ...row });
    expect(safetyStockTargetChangeBodySchema.safeParse({ quantity: "40" }).success).toBe(false);
  });

  it("remove at a version, by API body or bound row", () => {
    expect(safetyStockTargetRemoveBodySchema.parse({ version: 2 })).toEqual({ version: 2 });
    expect(safetyStockTargetRemoveSchema.parse(row)).toEqual(row);
    expect(safetyStockTargetRemoveSchema.safeParse({ ...row, effectiveFrom: "2027-1-1" }).success).toBe(false);
  });
});
