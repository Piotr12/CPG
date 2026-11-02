import { describe, expect, it } from "vitest";
import { addDays } from "../../demand/demand-buckets";
import { parseDecimal } from "../../quantities/decimal";
import type { MrpComponentDemand, MrpDemandRoot, MrpFirmDemand, MrpForecastDemand, MrpPlannedComponentDemand, MrpTransferMovement } from "../mrp-result";
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

/** A root requirement of kind `kind` on day `offset` (#327); a customer order's document is "O1", line 1. */
const root = (kind: MrpDemandRoot["kind"], offset: number, overrides: Partial<MrpDemandRoot> = {}): MrpDemandRoot => ({
  kind,
  material: "F",
  originalDate: day(offset),
  document: kind === "customer-order" || kind === "component" || kind === "transfer" ? "O1" : null,
  position: kind === "customer-order" ? 1 : null,
  ...overrides,
});

/** What a Make proposal of `parent` needed on day `needOffset` and started on day `offset` needs of M1, by root share (E17-S01, #327). */
const planned = (offset: number, shares: [MrpDemandRoot, string][], parent = "P1", needOffset = offset, provisional = false): MrpPlannedComponentDemand => ({
  parent,
  parentNeedDate: day(needOffset),
  bom: "00000001",
  bomRevision: 1,
  material: "M1",
  location: "L1",
  date: day(offset),
  quantity: shares.reduce((sum, [, quantity]) => sum + q(quantity), 0n),
  roots: shares.map(([root, quantity]) => ({ root, quantity: q(quantity) })),
  provisional,
});

/** Six days from TODAY; `receipts` and `targets` by day offset. */
const pair = (
  physical: string,
  lists: Partial<Pick<RankedPair, "firmDemand" | "forecastDemand" | "componentDemand" | "plannedComponentDemand" | "transfersOut">>,
  receipts: Record<number, string> = {},
  targets: Record<number, string> = {},
): RankedPair => ({
  material: "M1",
  physical: q(physical),
  buckets: Array.from({ length: 6 }, (_, offset) => ({
    ...emptyFlows(day(offset)),
    dependableSupply: q(receipts[offset] ?? "0"),
    safetyTarget: q(targets[offset] ?? "0"),
  })),
  firmDemand: [],
  forecastDemand: [],
  componentDemand: [],
  plannedComponentDemand: [],
  transfersOut: [],
  ...lists,
});

describe("rankShortages", () => {
  it("reports nothing when stock covers every requirement and the target", () => {
    expect(rankShortages(pair("30", { firmDemand: [order(1, "10")], forecastDemand: [forecast(2, "10")] }, {}, { 3: "10" }))).toEqual([]);
  });

  it("DEM-019, MRP-044: of 15 available, a customer order of 10 is served in full and the forecast's 15 short is a forecast shortage", () => {
    expect(rankShortages(pair("15", { forecastDemand: [forecast(2, "20")], firmDemand: [order(2, "10")] }))).toEqual([
      { kind: "forecast", date: day(2), originalDate: day(2), document: null, position: null, required: q("20"), uncovered: q("15"), root: null },
    ]);
  });

  it("DEM-020: O1 due Monday is served before O2 due Tuesday, and O2's shortage is shown against O2", () => {
    // TODAY, 5 October 2026, is a Monday.
    const o1 = order(0, "10", { order: "00000002" });
    const o2 = order(1, "10", { order: "00000001" });
    expect(rankShortages(pair("12", { firmDemand: [o2, o1] }))).toEqual([
      { kind: "customer-order", date: day(1), originalDate: day(1), document: "00000001", position: 1, required: q("10"), uncovered: q("8"), root: null },
    ]);
  });

  it("DEM-020: overdue orders that count today keep their original due dates as their priority", () => {
    const later = order(-2, "10", { order: "00000001" });
    const earlier = order(-3, "10", { order: "00000002" });
    expect(rankShortages(pair("12", { firmDemand: [later, earlier] }))).toEqual([
      { kind: "customer-order", date: TODAY, originalDate: day(-2), document: "00000001", position: 1, required: q("10"), uncovered: q("8"), root: null },
    ]);
  });

  it("DEM-021: lines due on one date share a priority; only the order code, then the position, decides, the same for any input order", () => {
    const lines = [order(1, "5", { order: "B" }), order(1, "5", { order: "A", position: 2 }), order(1, "5", { order: "A", position: 1 })];
    const expected = [
      { kind: "customer-order", date: day(1), originalDate: day(1), document: "A", position: 2, required: q("5"), uncovered: q("2"), root: null },
      { kind: "customer-order", date: day(1), originalDate: day(1), document: "B", position: 1, required: q("5"), uncovered: q("5"), root: null },
    ];
    expect(rankShortages(pair("8", { firmDemand: lines }))).toEqual(expected);
    expect(rankShortages(pair("8", { firmDemand: [...lines].reverse() }))).toEqual(expected);
  });

  it("DEM-022: a forecast residual of 40 is served before a safety top-up of 20", () => {
    expect(rankShortages(pair("40", { forecastDemand: [forecast(1, "40")] }, {}, { 1: "20" }))).toEqual([
      { kind: "safety-target", date: day(1), originalDate: day(1), document: null, position: null, required: q("20"), uncovered: q("20"), root: null },
    ]);
  });

  it("DEM-018: stock that covers a due order but not the target serves the order and shows the gap as the lower-priority requirement", () => {
    expect(rankShortages(pair("12", { firmDemand: [order(0, "10")] }, {}, { 0: "15" }))).toEqual([
      { kind: "safety-target", date: TODAY, originalDate: TODAY, document: null, position: null, required: q("15"), uncovered: q("13"), root: null },
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
      { kind: "transfer", date: day(2), originalDate: day(2), document: "00000001", position: null, required: q("5"), uncovered: q("5"), root: null },
      { kind: "customer-order", date: day(2), originalDate: day(2), document: "00000001", position: 1, required: q("3"), uncovered: q("3"), root: null },
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

  describe("Make proposals' components, by root requirement (#327)", () => {
    it("MRP-044: a need split between a parent's customer order and its forecast serves the order's share first, and the forecast's is short", () => {
      const shares: [MrpDemandRoot, string][] = [[root("forecast", 4), "4"], [root("customer-order", 4), "6"]];
      expect(rankShortages(pair("7", { plannedComponentDemand: [planned(2, shares)] }))).toEqual([
        { kind: "planned-component", date: day(2), originalDate: day(4), document: "P1", position: null, required: q("4"), uncovered: q("3"), root: root("forecast", 4) },
      ]);
    });

    it("ranks a share by its root's original date: a parent's order due on day 4 before the pair's own order due on day 5, and the forecast's share after both", () => {
      const shares: [MrpDemandRoot, string][] = [[root("customer-order", 4), "3"], [root("forecast", 3), "3"]];
      const shortages = rankShortages(pair("6", { firmDemand: [order(5, "3")], plannedComponentDemand: [planned(1, shares)] }, {}, {}));
      // Day 1 serves both shares from 6; day 5's own order finds nothing left. A later order never takes an earlier day's stock.
      expect(shortages.map(({ kind, date, uncovered }) => [kind, date, uncovered])).toEqual([["customer-order", day(5), q("3")]]);
      const outstanding = rankShortages(pair("0", { firmDemand: [order(5, "3")], plannedComponentDemand: [planned(1, shares)] }, { 5: "4" }));
      // Both shares are outstanding from day 1; on day 5 the receipt of 4 serves the day-4 order's share, then the day-5 order.
      expect(outstanding.map(({ kind, root: of, uncovered }) => [kind, of?.kind ?? null, uncovered])).toEqual([
        ["planned-component", "customer-order", q("3")],
        ["planned-component", "forecast", q("3")],
        ["customer-order", null, q("2")],
      ]);
    });

    it("keeps a later-dated share queued behind an earlier requirement that joins after it (#327 Q8)", () => {
      // Day 0: a share rooted at an order due on day 5 joins, unserved; day 1: the pair's own order due on day 1 joins.
      // Day 2's receipt serves the day-1 order first, though it joined later, so day 3's receipt finds it served and
      // serves day 3's own order before the share. Appended queues would leave day 3's order 1 short.
      const after = rankShortages(pair("0", { firmDemand: [order(1, "2"), order(3, "1", { order: "00000002" })], plannedComponentDemand: [planned(0, [[root("customer-order", 5), "2"]])] }, { 2: "2", 3: "2" }));
      expect(after.filter(({ date }) => date === day(3))).toEqual([]);
    });

    it("ranks a share rooted at an open document's need at rank 0, and one rooted at the parent's target after the pair's own forecast (Q3, Q4)", () => {
      // The component's root is due on day 3, after the pair's own order due on day 2, yet rank 0 serves it first.
      const first = rankShortages(pair("2", { firmDemand: [order(2, "2")], plannedComponentDemand: [planned(2, [[root("component", 3), "2"]])] }));
      expect(first.map(({ kind, uncovered }) => [kind, uncovered])).toEqual([["customer-order", q("2")]]);
      // The target's share is dated day 1, before the pair's forecast on day 2, yet rank 3 serves it last.
      const last = rankShortages(pair("2", { forecastDemand: [forecast(2, "2")], plannedComponentDemand: [planned(2, [[root("safety-target", 1), "2"]])] }));
      expect(last.map(({ kind, root: of, uncovered }) => [kind, of?.kind ?? null, uncovered])).toEqual([["planned-component", "safety-target", q("2")]]);
    });

    it("tells one parent's shares of one root apart by the parent's need date, never summing them", () => {
      const shortages = rankShortages(pair("1", { plannedComponentDemand: [planned(2, [[root("forecast", 2), "2"]], "P1", 4), planned(2, [[root("forecast", 2), "2"]], "P1", 3)] }));
      // The day-3 proposal's share is served first: 1 of 2, and the day-4 one's 2 stay short.
      expect(shortages.map(({ required, uncovered }) => [required, uncovered])).toEqual([[q("2"), q("1")], [q("2"), q("2")]]);
    });

    it("serves the pair's own requirement before a share of the same root, then two parents by parent code, then an executable parent before a provisional one", () => {
      const own = order(2, "2", { order: "O1", position: 1 });
      const shortages = rankShortages({
        ...pair("2", {
          firmDemand: [own],
          plannedComponentDemand: [
            planned(2, [[root("customer-order", 2, { material: "M1" }), "2"]], "P2"),
            planned(2, [[root("customer-order", 2, { material: "M1" }), "2"]], "P1", 2, true),
            planned(2, [[root("customer-order", 2, { material: "M1" }), "2"]], "P1"),
          ],
        }),
      });
      expect(shortages.map(({ kind, document, root: of }) => [kind, document, of === null ? null : 1])).toEqual([
        ["planned-component", "P1", 1],
        ["planned-component", "P1", 1],
        ["planned-component", "P2", 1],
      ]);
      // Of 2, the executable parent's 2 are served in full and the provisional one's 3 stay short, whatever the input order.
      const provisionalFirst = rankShortages(pair("2", { plannedComponentDemand: [planned(2, [[root("forecast", 2), "3"]], "P1", 2, true), planned(2, [[root("forecast", 2), "2"]], "P1")] }));
      expect(provisionalFirst).toEqual([
        { kind: "planned-component", date: day(2), originalDate: day(2), document: "P1", position: null, required: q("3"), uncovered: q("3"), root: root("forecast", 2) },
      ]);
    });

    it("sums two shares with an equal key into one requirement: two provisional proposals of one parent on one need date", () => {
      const twice = planned(2, [[root("forecast", 2), "2"]], "P1", 2, true);
      expect(rankShortages(pair("1", { plannedComponentDemand: [twice, twice] }))).toEqual([
        { kind: "planned-component", date: day(2), originalDate: day(2), document: "P1", position: null, required: q("4"), uncovered: q("3"), root: root("forecast", 2) },
      ]);
    });
  });
});
