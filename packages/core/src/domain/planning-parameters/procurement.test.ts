import { PROCUREMENT_MODES as STORED_MODES } from "@cpg/db";
import { describe, expect, it } from "vitest";
import { isProcurementAllowed, LEAD_TIME_DAYS_MAX, PROCUREMENT_MODES } from "./procurement";

describe("isProcurementAllowed", () => {
  it("lets a raw material only be bought (MAT-014)", () => {
    expect(isProcurementAllowed("raw", "buy")).toBe(true);
    expect(isProcurementAllowed("raw", "make")).toBe(false);
  });

  it("lets intermediate and finished materials be made or bought (MAT-015)", () => {
    for (const type of ["intermediate", "finished"] as const) {
      for (const mode of PROCUREMENT_MODES) expect(isProcurementAllowed(type, mode)).toBe(true);
    }
  });
});

describe("PROCUREMENT_MODES", () => {
  it("equals the modes the database stores (re-declared so client code never imports the ORM)", () => {
    expect(PROCUREMENT_MODES).toEqual(STORED_MODES);
  });
});

describe("LEAD_TIME_DAYS_MAX", () => {
  it("reaches past the 90-day MRP horizon", () => {
    expect(LEAD_TIME_DAYS_MAX).toBe(999);
  });
});
