import { describe, expect, it } from "vitest";
import type { MrpShortage } from "../mrp-result";
import { isMrpShortageCode, MRP_SHORTAGE_CODE, readStoredShortage, toStoredShortage, type MrpShortageView } from "./stored-shortages";

const q = (units: string) => BigInt(units) * 1_000_000n;
const shortage = (fields: Partial<MrpShortage>): MrpShortage => ({
  kind: "forecast", date: "2026-10-05", originalDate: "2026-10-05", document: null, position: null, required: q("20"), uncovered: q("15"), root: null, ...fields,
});
/** Stored, then read back. */
const roundTrip = (fields: Partial<MrpShortage>): MrpShortageView | null => {
  const { date, details } = toStoredShortage("00000001", "00000002", shortage(fields));
  return readStoredShortage(date, details);
};

describe("a run's stored shortages (#380, spec Q2, Q3)", () => {
  it("are told apart from exceptions, warnings, provisional actions and rejected BOMs by their one code", () => {
    expect(MRP_SHORTAGE_CODE).toBe("SHORTAGE");
    expect(isMrpShortageCode("SHORTAGE")).toBe(true);
    for (const code of ["OVERDUE_SUPPLY", "PROVISIONAL_PRODUCTION", "BOM_REJECTIONS", "NO_FEASIBLE_BOM"]) expect(isMrpShortageCode(code)).toBe(false);
  });

  it("store a customer-order line with its document, position, priority date and six-decimal quantities", () => {
    const stored = toStoredShortage("00000001", "00000002", shortage({ kind: "customer-order", document: "00000012", position: 2, originalDate: "2026-09-28", date: "2026-10-01", required: q("10"), uncovered: 2_500_000n }));
    expect(stored).toEqual({
      code: "SHORTAGE", material: "00000001", location: "00000002", date: "2026-10-01",
      details: { kind: "customer-order", originalDate: "2026-09-28", required: "10.000000", uncovered: "2.500000", document: "00000012", position: "2" },
    });
  });

  it("store a planned component's root by its kind only, since its date is the row's own priority date (#327)", () => {
    const stored = toStoredShortage("00000003", "00000002", shortage({ kind: "planned-component", document: "00000001", date: "2026-10-08", originalDate: "2026-10-10", required: q("4"), uncovered: q("3"), root: { kind: "forecast", originalDate: "2026-10-10" } }));
    expect(stored.details).toEqual({ kind: "planned-component", originalDate: "2026-10-10", required: "4.000000", uncovered: "3.000000", document: "00000001", rootKind: "forecast" });
  });

  it("store a forecast and the target with no document, position or root", () => {
    expect(toStoredShortage("00000001", "00000002", shortage({})).details).toEqual({ kind: "forecast", originalDate: "2026-10-05", required: "20.000000", uncovered: "15.000000" });
    expect(toStoredShortage("00000001", "00000002", shortage({ kind: "safety-target", required: q("25"), uncovered: q("13") })).details).toEqual({ kind: "safety-target", originalDate: "2026-10-05", required: "25.000000", uncovered: "13.000000" });
  });

  it("read back every kind as it was ranked, with a planned component's root rebuilt from its priority date", () => {
    expect(roundTrip({ kind: "customer-order", document: "00000012", position: 1 })).toEqual({
      kind: "customer-order", date: "2026-10-05", originalDate: "2026-10-05", document: "00000012", position: 1, required: "20.000000", uncovered: "15.000000", root: null,
    });
    expect(roundTrip({})).toMatchObject({ kind: "forecast", document: null, position: null, root: null });
    expect(roundTrip({ kind: "safety-target" })).toMatchObject({ kind: "safety-target", document: null });
    expect(roundTrip({ kind: "component", document: "00000004", originalDate: "2026-10-03" })).toMatchObject({ kind: "component", document: "00000004", originalDate: "2026-10-03", position: null });
    expect(roundTrip({ kind: "transfer", document: "00000002" })).toMatchObject({ kind: "transfer", document: "00000002" });
    for (const rootKind of ["component", "transfer", "customer-order", "forecast", "safety-target"] as const) {
      expect(roundTrip({ kind: "planned-component", document: "00000001", originalDate: "2026-10-10", root: { kind: rootKind, originalDate: "2026-10-10" } })).toMatchObject({
        kind: "planned-component", document: "00000001", position: null, root: { kind: rootKind, originalDate: "2026-10-10" },
      });
    }
  });

  it("read a quantity past what one entry may hold, as a balance can sum (#288)", () => {
    expect(roundTrip({ required: 1_999_999_999_998_000_000n, uncovered: 1_999_999_999_998_000_000n })).toMatchObject({ required: "1999999999998.000000", uncovered: "1999999999998.000000" });
  });

  it("skip a row this image can't read rather than guess at it (spec Q8)", () => {
    const good = { kind: "customer-order", originalDate: "2026-10-05", required: "10.000000", uncovered: "8.000000", document: "00000012", position: "1" };
    const planned = { kind: "planned-component", originalDate: "2026-10-05", required: "4.000000", uncovered: "3.000000", document: "00000001", rootKind: "forecast" };
    expect(readStoredShortage("2026-10-05", good)).not.toBeNull();
    expect(readStoredShortage("2026-10-05", planned)).not.toBeNull();
    const unreadable: [string | null, Record<string, string> | null][] = [
      [null, good],
      ["5 Oct", good],
      ["2026-10-05", null],
      ["2026-10-05", { ...good, kind: "backorder" }],
      ["2026-10-05", { ...good, originalDate: "" }],
      ["2026-10-05", { ...good, required: "10" }],
      ["2026-10-05", { ...good, uncovered: "-8.000000" }],
      ["2026-10-05", { ...good, uncovered: "0.000000" }],
      ["2026-10-05", Object.fromEntries(Object.entries(good).filter(([key]) => key !== "uncovered"))],
      ["2026-10-05", Object.fromEntries(Object.entries(good).filter(([key]) => key !== "document"))],
      ["2026-10-05", Object.fromEntries(Object.entries(good).filter(([key]) => key !== "position"))],
      ["2026-10-05", { ...good, position: "0" }],
      ["2026-10-05", { ...good, position: "first" }],
      ["2026-10-05", { ...good, kind: "forecast" }],
      ["2026-10-05", { kind: "forecast", originalDate: "2026-10-05", required: "20.000000", uncovered: "15.000000", document: "00000012" }],
      ["2026-10-05", { ...good, rootKind: "forecast" }],
      ["2026-10-05", Object.fromEntries(Object.entries(planned).filter(([key]) => key !== "rootKind"))],
      ["2026-10-05", { ...planned, rootKind: "planned-component" }],
      ["2026-10-05", { ...planned, rootKind: "promise" }],
    ];
    for (const [date, details] of unreadable) expect(readStoredShortage(date, details), JSON.stringify(details)).toBeNull();
  });
});
