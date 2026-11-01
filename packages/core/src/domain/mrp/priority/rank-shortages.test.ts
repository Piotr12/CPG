import { describe, expect, it } from "vitest";
import { addDays } from "../../demand/demand-buckets";
import { parseDecimal } from "../../quantities/decimal";
import type { MrpComponentDemand, MrpFirmDemand, MrpForecastDemand, MrpTransferMovement } from "../mrp-result";
import { emptyFlows } from "../projection/project-buckets";
import { rankShortages, type RankedPair } from "./rank-shortages";

const TODAY = "2026-10-05";
const q = (text: string) => parseDecimal(text)!;
const day = (offset: number) => addDays(TODAY, offset);

const order = (offset: number, quantity: string, overrides: Partial<MrpFirmDemand> = {}): MrpFirmDemand => ({
  order: "00000001",
  position: 1,
  material: "M1",
  location: "L1",
  requiredDate: day(offset),
  date: day(Math.max(offset, 0)),
  quantity: q(quantity),
  ...overrides,
});
const forecast = (offset: number, quantity: string): MrpForecastDemand => ({
  material: "M1",
  location: "L1",
  forecastDate: day(offset),
  date: day(offset),
  forecastQuantity: q(quantity),
  quantity: q(quantity),
});
const component = (offset: number, quantity: string, order = "00000001"): MrpComponentDemand => ({
  order,
  material: "M1",
  location: "L1",
  plannedStart: day(offset),
  date: day(offset),
  quantity: q(quantity),
  overdue: false,
});
const dispatch = (offset: number, quantity: string, transfer = "00000001"): MrpTransferMovement => ({
  transfer,
  material: "M1",
  location: "L1",
  stage: "planned",
  plannedDate: day(offset),
  date: day(offset),
  quantity: q(quantity),
  overdue: false,
});

/** Six days from TODAY; `receipts` and `targets` by day offset. */
const pair = (
  physical: string,
  lists: Partial<Pick<RankedPair, "firmDemand" | "forecastDemand" | "componentDemand" | "transfersOut">>,
  receipts: Record<number, string> = {},
  targets: Record<number, string> = {},
): RankedPair => ({
  physical: q(physical),
  buckets: Array.from({ length: 6 }, (_, offset) => ({
    ...emptyFlows(day(offset)),
    dependableSupply: q(receipts[offset] ?? "0"),
    safetyTarget: q(targets[offset] ?? "0"),
  })),
  firmDemand: [],
  forecastDemand: [],
  componentDemand: [],
  transfersOut: [],
  ...lists,
});

describe("rankShortages", () => {
  it("reports nothing when stock covers every requirement and the target", () => {
    expect(rankShortages(pair("30", { firmDemand: [order(1, "10")], forecastDemand: [forecast(2, "10")] }, {}, { 3: "10" }))).toEqual([]);
  });

  it("DEM-019, MRP-044: of 15 available, a customer order of 10 is served in full and the forecast's 15 short is a forecast shortage", () => {
    expect(rankShortages(pair("15", { forecastDemand: [forecast(2, "20")], firmDemand: [order(2, "10")] }))).toEqual([
      { kind: "forecast", date: day(2), originalDate: day(2), document: null, position: null, required: q("20"), uncovered: q("15") },
    ]);
  });

  it("DEM-020: O1 due Monday is served before O2 due Tuesday, and O2's shortage is shown against O2", () => {
    const o1 = order(1, "10", { order: "00000002" });
    const o2 = order(2, "10", { order: "00000001" });
    expect(rankShortages(pair("12", { firmDemand: [o2, o1] }))).toEqual([
      { kind: "customer-order", date: day(2), originalDate: day(2), document: "00000001", position: 1, required: q("10"), uncovered: q("8") },
    ]);
  });

  it("DEM-020: overdue orders that count today keep their original due dates as their priority", () => {
    const later = order(-2, "10", { order: "00000001" });
    const earlier = order(-3, "10", { order: "00000002" });
    expect(rankShortages(pair("12", { firmDemand: [later, earlier] }))).toEqual([
      { kind: "customer-order", date: TODAY, originalDate: day(-2), document: "00000001", position: 1, required: q("10"), uncovered: q("8") },
    ]);
  });

  it("DEM-021: lines due on one date share a priority; only the order code, then the position, decides, the same for any input order", () => {
    const lines = [order(1, "5", { order: "B" }), order(1, "5", { order: "A", position: 2 }), order(1, "5", { order: "A", position: 1 })];
    const expected = [
      { kind: "customer-order", date: day(1), originalDate: day(1), document: "A", position: 2, required: q("5"), uncovered: q("2") },
      { kind: "customer-order", date: day(1), originalDate: day(1), document: "B", position: 1, required: q("5"), uncovered: q("5") },
    ];
    expect(rankShortages(pair("8", { firmDemand: lines }))).toEqual(expected);
    expect(rankShortages(pair("8", { firmDemand: [...lines].reverse() }))).toEqual(expected);
  });

  it("DEM-022: a forecast residual of 40 is served before a safety top-up of 20", () => {
    expect(rankShortages(pair("40", { forecastDemand: [forecast(1, "40")] }, {}, { 1: "20" }))).toEqual([
      { kind: "safety-target", date: day(1), originalDate: day(1), document: null, position: null, required: q("20"), uncovered: q("20") },
    ]);
  });

  it("DEM-018: stock that covers a due order but not the target serves the order and shows the gap as the lower-priority requirement", () => {
    expect(rankShortages(pair("12", { firmDemand: [order(0, "10")] }, {}, { 0: "15" }))).toEqual([
      { kind: "safety-target", date: TODAY, originalDate: TODAY, document: null, position: null, required: q("15"), uncovered: q("13") },
    ]);
  });

  it("serves a requirement left short by a later receipt first, before a later one of its rank, and reports it only on its own day", () => {
    const shortages = rankShortages(pair("0", { firmDemand: [order(1, "10", { order: "A" }), order(3, "10", { order: "B" })] }, { 3: "10" }));
    expect(shortages.map(({ document, date, uncovered }) => [document, date, uncovered])).toEqual([
      ["A", day(1), q("10")],
      ["B", day(3), q("10")],
    ]);
  });

  it("lets a later customer order take a later receipt ahead of an earlier forecast left short", () => {
    const shortages = rankShortages(pair("0", { forecastDemand: [forecast(1, "10"), forecast(5, "5")], firmDemand: [order(3, "4")] }, { 3: "10" }));
    // Day 3: the order takes 4 of 10, the day-1 forecast 6; day 5's forecast finds nothing left.
    expect(shortages.map(({ kind, date, uncovered }) => [kind, date, uncovered])).toEqual([
      ["forecast", day(1), q("10")],
      ["forecast", day(5), q("5")],
    ]);
  });

  it("serves open production orders' components and transfer dispatches first (rank 0), a component before a transfer of the same code and day", () => {
    const shortages = rankShortages(pair("5", { firmDemand: [order(2, "3")], transfersOut: [dispatch(2, "5")], componentDemand: [component(2, "5")] }));
    expect(shortages).toEqual([
      { kind: "transfer", date: day(2), originalDate: day(2), document: "00000001", position: null, required: q("5"), uncovered: q("5") },
      { kind: "customer-order", date: day(2), originalDate: day(2), document: "00000001", position: 1, required: q("3"), uncovered: q("3") },
    ]);
  });

  it("orders rank 0 by original date across kinds, an overdue dispatch before a component due today", () => {
    const late = { ...dispatch(-1, "4"), date: TODAY, overdue: true };
    const shortages = rankShortages(pair("4", { componentDemand: [component(0, "4")], transfersOut: [late] }));
    expect(shortages.map(({ kind, uncovered }) => [kind, uncovered])).toEqual([["component", q("4")]]);
  });

  it("counts every receipt of a day before serving it, and lists a day's shortages by priority with the target last", () => {
    const shortages = rankShortages(pair("0", { firmDemand: [order(2, "10")], forecastDemand: [forecast(2, "10")] }, { 2: "6" }, { 2: "5" }));
    expect(shortages.map(({ kind, uncovered }) => [kind, uncovered])).toEqual([
      ["customer-order", q("4")],
      ["forecast", q("10")],
      ["safety-target", q("5")],
    ]);
  });
});
