import { describe, expect, it } from "vitest";
import { demandWindow } from "./demand-buckets";
import { tallyDemand, zeroFigures, type DemandOrderLine, type IssuedLine } from "./demand-tally";

// Weekly window around Sunday 2026-10-25: bucket 13 is this week (19–25 Oct), 11 the week of
// 5 Oct, 12 the week of 12 Oct, 14 the week of 26 Oct and 15 the week of 2 Nov.
const TODAY = "2026-10-25";
const window = demandWindow("week", TODAY);
const ONE = 1_000_000n;
const units = (n: number) => BigInt(n) * ONE;
const text = (n: number) => `${n}.000000`;

const issued = (businessDate: string, quantity: number, { reversed = false, material = "M", location = "L" } = {}): IssuedLine => ({
  material, location, businessDate, quantity: units(quantity), reversed,
});
const line = (requiredDate: string, quantity: number, status: DemandOrderLine["status"], { fulfilled = 0, abandoned = 0, material = "M", location = "L" } = {}): DemandOrderLine => ({
  material, location, requiredDate, quantity: text(quantity), fulfilled: text(fulfilled), abandoned: text(abandoned), status,
});
const forecast = (date: string, quantity: number, material = "M", location = "L") => ({ material, location, date, quantity: units(quantity) });

describe("tallyDemand", () => {
  const cells = tallyDemand(window, {
    issued: [
      issued("2026-10-20", 5),
      issued("2026-10-20", 3, { reversed: true }),
      issued("2026-10-13", 2),
      issued("2026-07-01", 9, { material: "X" }),
    ],
    orderLines: [
      line("2026-10-10", 10, "open", { fulfilled: 4 }),
      line("2026-11-03", 20, "open"),
      line("2026-11-05", 8, "closed-early", { fulfilled: 3, abandoned: 5 }),
      line("2026-10-21", 7, "completed", { fulfilled: 7, material: "N", location: "K" }),
    ],
    forecasts: [forecast("2026-11-01", 50), forecast("2026-10-01", 30), forecast("2026-09-01", 40), forecast("2026-10-01", 7, "N", "K")],
  });
  const figures = (material: string, location: string) => cells.find((cell) => cell.material === material && cell.location === location)!.figures;

  it("keeps one cell per material and location that has a figure in the window", () => {
    expect(cells.map(({ material, location }) => `${material}/${location}`)).toEqual(["M/L", "N/K"]);
    expect(figures("M", "L")).toHaveLength(window.buckets.length);
  });

  it("counts goods issued on their business date, a reversed line as zero", () => {
    expect(figures("M", "L")[13].shipped).toBe(units(5));
    expect(figures("M", "L")[12].shipped).toBe(units(2));
  });

  it("counts ordered by required date, net of what was abandoned, whatever the status", () => {
    expect(figures("M", "L")[11].ordered).toBe(units(10));
    expect(figures("M", "L")[15].ordered).toBe(units(23));
    expect(figures("N", "K")[13]).toEqual({ ...zeroFigures(), ordered: units(7) });
  });

  it("DEM-012: counts an overdue Open line's outstanding quantity today, as overdue", () => {
    expect(figures("M", "L")[13]).toMatchObject({ open: units(6), overdue: units(6) });
    expect(figures("M", "L")[11]).toMatchObject({ open: 0n, overdue: 0n });
  });

  it("counts an Open line due later on its required date, and nothing for a closed one", () => {
    expect(figures("M", "L")[15]).toMatchObject({ open: units(20), overdue: 0n });
  });

  it("places what the month's orders leave of a forecast, today for this month's, nothing for an ended month's", () => {
    // November: 50 − (20 + 3) = 27 on 1 Nov; October: 30 − 10 = 20 today; September expired.
    expect(figures("M", "L")[14].forecast).toBe(units(27));
    expect(figures("M", "L")[13].forecast).toBe(units(20));
    expect(figures("N", "K").every(({ forecast }) => forecast === 0n)).toBe(true);
    const total = figures("M", "L").reduce((sum, { forecast }) => sum + forecast, 0n);
    expect(total).toBe(units(47));
  });
});
