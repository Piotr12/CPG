import { describe, expect, it } from "vitest";
import type { MrpShortage } from "../mrp-result";
import { isMrpShortageCode, MRP_SHORTAGE_CODE, readStoredShortages, toStoredShortages, type MrpShortageView } from "./stored-shortages";

const q = (units: string) => BigInt(units) * 1_000_000n;
const shortage = (fields: Partial<MrpShortage>): MrpShortage => ({
  kind: "forecast", date: "2026-10-05", originalDate: "2026-10-05", document: null, position: null, required: q("20"), uncovered: q("15"), root: null, ...fields,
});
/** Stored, then read back. */
const roundTrip = (...shortages: Partial<MrpShortage>[]): MrpShortageView[] => readStoredShortages(toStoredShortages("00000001", "00000002", shortages.map(shortage))!.details);
/** A row holding exactly these entries. */
const read = (...entries: string[]) => readStoredShortages({ entries: entries.join(";") });
const ORDER = "2026-10-06 customer-order 2026-10-06 00000002 0 10.000000 8.000000 -";
const PLANNED = "2026-10-08 planned-component 2026-10-10 00000001 - 4.000000 3.000000 forecast";

describe("a run's stored shortages (#380, spec Q2, Q3)", () => {
  it("are told apart from exceptions, warnings, provisional actions and rejected BOMs by their one code", () => {
    expect(MRP_SHORTAGE_CODE).toBe("SHORTAGE");
    expect(isMrpShortageCode("SHORTAGE")).toBe(true);
    for (const code of ["OVERDUE_SUPPLY", "PROVISIONAL_PRODUCTION", "BOM_REJECTIONS", "NO_FEASIBLE_BOM"]) expect(isMrpShortageCode(code)).toBe(false);
  });

  it("store a pair's entries as one row on its first short day, in the engine's order, each with only the fields its kind has", () => {
    const stored = toStoredShortages("00000001", "00000002", [
      shortage({ kind: "customer-order", document: "00000002", position: 0, date: "2026-10-06", originalDate: "2026-10-06", required: q("10"), uncovered: q("8") }),
      shortage({ kind: "planned-component", document: "00000001", date: "2026-10-08", originalDate: "2026-10-10", required: q("4"), uncovered: q("3"), root: { kind: "forecast", originalDate: "2026-10-10" } }),
      shortage({ kind: "safety-target", date: "2026-10-09", originalDate: "2026-10-09", required: q("25"), uncovered: 12_500_000n }),
    ]);
    expect(stored).toEqual({
      code: "SHORTAGE", material: "00000001", location: "00000002", date: "2026-10-06",
      details: { entries: `${ORDER};${PLANNED};2026-10-09 safety-target 2026-10-09 - - 25.000000 12.500000 -` },
    });
  });

  it("store nothing for a pair with nothing short", () => {
    expect(toStoredShortages("00000001", "00000002", [])).toBeNull();
  });

  it("read back every kind as it was ranked, in stored order, with a planned component's root rebuilt from its priority date", () => {
    expect(roundTrip({ kind: "customer-order", document: "00000012", position: 0 }, {})).toEqual([
      { kind: "customer-order", date: "2026-10-05", originalDate: "2026-10-05", document: "00000012", position: 0, required: "20.000000", uncovered: "15.000000", root: null },
      { kind: "forecast", date: "2026-10-05", originalDate: "2026-10-05", document: null, position: null, required: "20.000000", uncovered: "15.000000", root: null },
    ]);
    expect(roundTrip({ kind: "safety-target" })).toMatchObject([{ kind: "safety-target", document: null }]);
    expect(roundTrip({ kind: "component", document: "00000004", originalDate: "2026-10-03" })).toMatchObject([{ kind: "component", document: "00000004", originalDate: "2026-10-03", position: null }]);
    expect(roundTrip({ kind: "transfer", document: "00000002" })).toMatchObject([{ kind: "transfer", document: "00000002" }]);
    for (const rootKind of ["component", "transfer", "customer-order", "forecast", "safety-target"] as const) {
      expect(roundTrip({ kind: "planned-component", document: "00000001", originalDate: "2026-10-10", root: { kind: rootKind, originalDate: "2026-10-10" } })).toMatchObject([{
        kind: "planned-component", document: "00000001", position: null, root: { kind: rootKind, originalDate: "2026-10-10" },
      }]);
    }
  });

  it("read a quantity past what one entry may hold, as a balance can sum (#288)", () => {
    expect(roundTrip({ required: 1_999_999_999_998_000_000n, uncovered: 1_999_999_999_998_000_000n })).toMatchObject([{ required: "1999999999998.000000", uncovered: "1999999999998.000000" }]);
  });

  it("read no entries from a row without details or entries", () => {
    expect(readStoredShortages(null)).toEqual([]);
    expect(readStoredShortages({})).toEqual([]);
    expect(readStoredShortages({ entries: "" })).toEqual([]);
  });

  it("leave out an entry this image can't read, keeping the others, rather than guess at it (spec Q8)", () => {
    expect(read(ORDER, PLANNED)).toHaveLength(2);
    const unreadable = [
      ORDER.replace("2026-10-06 ", "6 Oct "),
      ORDER.replace("customer-order", "backorder"),
      ORDER.replace(" 2026-10-06 00000002", " 06.10.2026 00000002"),
      ORDER.replace("10.000000", "10"),
      ORDER.replace("8.000000", "-8.000000"),
      ORDER.replace("8.000000", "0.000000"),
      `${ORDER} extra`,
      ORDER.replace(" 00000002 ", " - "),
      ORDER.replace(" 0 10.000000", " - 10.000000"),
      ORDER.replace(" 0 10.000000", " first 10.000000"),
      ORDER.replace("customer-order", "forecast"),
      "2026-10-05 forecast 2026-10-05 00000012 - 20.000000 15.000000 -",
      ORDER.replace(/ -$/, " forecast"),
      PLANNED.replace(/ forecast$/, " -"),
      PLANNED.replace(/ forecast$/, " planned-component"),
      PLANNED.replace(/ forecast$/, " promise"),
    ];
    for (const entry of unreadable) expect(read(entry, PLANNED), entry).toEqual(read(PLANNED));
  });
});
