import { describe, expect, expectTypeOf, it } from "vitest";
import type { ConsumingOrderLine } from "../../demand/forecast-netting";
import type { MrpOrderLine } from "../mrp-inputs";
import { horizonDates } from "../projection/horizon";
import { firmDemand } from "./firm-demand";

const dates = horizonDates("2026-10-01");

const line = (overrides: Partial<MrpOrderLine> = {}): MrpOrderLine => ({
  order: "00000001",
  position: 1,
  material: "M1",
  location: "L1",
  requiredDate: "2026-10-15",
  quantity: 10_000_000n,
  fulfilled: 0n,
  abandoned: 0n,
  status: "open",
  removed: false,
  ...overrides,
});

describe("MRP firm demand", () => {
  it("is the input forecast netting takes unchanged (E15-S01)", () => {
    expectTypeOf<MrpOrderLine>().toExtend<ConsumingOrderLine>();
  });

  it("counts an open line's quantity less what was issued and abandoned, at its order's location", () => {
    const items = firmDemand([line({ location: "L2", quantity: 50_000_000n, fulfilled: 10_000_000n, abandoned: 15_000_000n })], dates);
    expect(items).toEqual([
      { order: "00000001", position: 1, material: "M1", location: "L2", requiredDate: "2026-10-15", date: "2026-10-15", quantity: 25_000_000n },
    ]);
  });

  it("adds nothing for removed, cancelled, closed-early, completed, fully issued or over-issued lines", () => {
    const lines = [
      line({ removed: true }),
      line({ status: "cancelled", abandoned: 10_000_000n }),
      line({ status: "closed-early", fulfilled: 4_000_000n, abandoned: 6_000_000n }),
      line({ status: "completed", fulfilled: 10_000_000n }),
      line({ status: "completed", fulfilled: 12_000_000n }),
      line({ fulfilled: 10_000_000n }),
      line({ fulfilled: 11_000_000n }),
    ];
    expect(firmDemand(lines, dates)).toEqual([]);
  });

  it("keeps a closed-early or cancelled line out even when a reversal left a remainder", () => {
    // A goods-issue reversal returns `fulfilled` to zero but never reopens an explicitly closed line.
    const lines = [line({ status: "closed-early", abandoned: 6_000_000n }), line({ status: "cancelled" })];
    expect(firmDemand(lines, dates)).toEqual([]);
  });

  it("SAL-017: moves an overdue line to today and keeps its required date", () => {
    const [item] = firmDemand([line({ requiredDate: "2026-09-30", quantity: 50_000_000n, fulfilled: 20_000_000n })], dates);
    expect(item).toMatchObject({ requiredDate: "2026-09-30", date: "2026-10-01", quantity: 30_000_000n });
  });

  it("MRP-004: keeps day 89 and leaves day 90 out of the horizon", () => {
    const items = firmDemand([line({ order: "A", requiredDate: "2026-12-29" }), line({ order: "B", requiredDate: "2026-12-30" })], dates);
    expect(items.map(({ order, date }) => [order, date])).toEqual([["A", "2026-12-29"]]);
  });

  it("sorts by date, required date, order and position, whatever the input order", () => {
    const lines = [
      line({ order: "B", position: 2, requiredDate: "2026-10-02" }),
      line({ order: "B", position: 1, requiredDate: "2026-10-02" }),
      line({ order: "A", position: 9, requiredDate: "2026-10-02" }),
      line({ order: "C", position: 1, requiredDate: "2026-09-29" }),
      line({ order: "D", position: 1, requiredDate: "2026-09-15" }),
      line({ order: "E", position: 1, requiredDate: "2026-10-01" }),
    ];
    const expected = [["D", 1], ["C", 1], ["E", 1], ["A", 9], ["B", 1], ["B", 2]];
    expect(firmDemand(lines, dates).map(({ order, position }) => [order, position])).toEqual(expected);
    expect(firmDemand([...lines].reverse(), dates).map(({ order, position }) => [order, position])).toEqual(expected);
  });
});
