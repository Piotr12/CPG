import { describe, expect, it } from "vitest";
import { parseDecimal } from "../../quantities/decimal";
import type { MrpProductionOrder } from "../mrp-inputs";
import { horizonDates } from "../projection/horizon";
import { productionMovements } from "./production-orders";

const q = (text: string) => parseDecimal(text)!;
// The horizon of 1 October 2026 ends on 29 December.
const DATES = horizonDates("2026-10-01");

const order = (overrides: Partial<MrpProductionOrder>): MrpProductionOrder => ({
  order: "00000001",
  material: "P",
  location: "L1",
  plannedStart: "2026-10-10",
  plannedFinish: "2026-10-12",
  quantity: q("10"),
  produced: 0n,
  abandoned: 0n,
  status: "open",
  inactiveComponents: [],
  components: [
    { material: "B", perOutput: q("1.5") },
    { material: "A", perOutput: q("0.333333") },
  ],
  ...overrides,
});

describe("productionMovements", () => {
  it("places output on the finish day and each pinned line's rounded need on the start day, sorted by day, order and material", () => {
    const { output, components } = productionMovements([order({ order: "00000002" }), order({ plannedStart: "2026-10-11" })], DATES);
    expect(output.map(({ order: code, date, quantity }) => [code, date, quantity])).toEqual([
      ["00000001", "2026-10-12", q("10")],
      ["00000002", "2026-10-12", q("10")],
    ]);
    expect(components.map(({ order: code, material, date, quantity }) => [code, material, date, quantity])).toEqual([
      ["00000002", "A", "2026-10-10", q("3.33333")],
      ["00000002", "B", "2026-10-10", q("15")],
      ["00000001", "A", "2026-10-11", q("3.33333")],
      ["00000001", "B", "2026-10-11", q("15")],
    ]);
  });

  it("counts a finish or a start on day 89, drops a finish on day 90, and drops both legs when the start is after day 89", () => {
    const { output, components } = productionMovements(
      [
        order({ order: "00000001", plannedStart: "2026-12-20", plannedFinish: "2026-12-29" }),
        order({ order: "00000002", plannedStart: "2026-12-20", plannedFinish: "2026-12-30" }),
        order({ order: "00000003", plannedStart: "2026-12-30", plannedFinish: "2027-01-02" }),
        order({ order: "00000004", plannedStart: "2026-12-29", plannedFinish: "2027-01-02" }),
      ],
      DATES,
    );
    expect(output.map(({ order: code }) => code)).toEqual(["00000001"]);
    expect([...new Set(components.map(({ order: code }) => code))]).toEqual(["00000001", "00000002", "00000004"]);
    expect(components.filter(({ order: code }) => code === "00000004").map(({ date }) => date)).toEqual(["2026-12-29", "2026-12-29"]);
  });

  it("moves an overdue start and finish to today, marking both and keeping the planned days", () => {
    const { output, components } = productionMovements([order({ plannedStart: "2026-09-20", plannedFinish: "2026-09-25" })], DATES);
    expect(output).toEqual([expect.objectContaining({ plannedFinish: "2026-09-25", date: "2026-10-01", overdue: true })]);
    expect(components.every(({ plannedStart, date, overdue }) => plannedStart === "2026-09-20" && date === "2026-10-01" && overdue)).toBe(true);
  });

  it("counts a start and finish due today on time, unmarked", () => {
    const { output, components } = productionMovements([order({ plannedStart: "2026-10-01", plannedFinish: "2026-10-01" })], DATES);
    expect([...output, ...components].map(({ date, overdue }) => [date, overdue])).toEqual([
      ["2026-10-01", false],
      ["2026-10-01", false],
      ["2026-10-01", false],
    ]);
  });

  it("counts an order pinning an inactive component as at risk: its balance out of the output, only its active lines as demand (E17-S03, MRP-051)", () => {
    const { output, atRisk, components } = productionMovements(
      [order({ order: "00000002", inactiveComponents: ["B"], produced: q("4") }), order({ order: "00000001", plannedFinish: "2026-10-14" })],
      DATES,
    );
    expect(output.map(({ order: code, quantity }) => [code, quantity])).toEqual([["00000001", q("10")]]);
    // Only the unproduced balance is at risk: 4 of 10 are posted, physical stock already.
    expect(atRisk).toEqual([{ order: "00000002", material: "P", location: "L1", plannedFinish: "2026-10-12", date: "2026-10-12", quantity: q("6"), overdue: false }]);
    expect(components.filter(({ order: code }) => code === "00000002").map(({ material, quantity }) => [material, quantity])).toEqual([["A", q("1.999998")]]);
  });

  it("drops an at-risk finish after the horizon like any other, and moves an overdue one to today", () => {
    const { atRisk } = productionMovements(
      [
        order({ order: "00000001", inactiveComponents: ["A"], plannedStart: "2026-12-20", plannedFinish: "2026-12-30" }),
        order({ order: "00000002", inactiveComponents: ["A"], plannedStart: "2026-09-20", plannedFinish: "2026-09-25" }),
      ],
      DATES,
    );
    expect(atRisk.map(({ order: code, date, overdue }) => [code, date, overdue])).toEqual([["00000002", "2026-10-01", true]]);
  });
});
