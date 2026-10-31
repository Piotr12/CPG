import { describe, expect, expectTypeOf, it } from "vitest";
import type { DemandForecast } from "../../demand/forecast-netting";
import type { MrpForecast, MrpOrderLine } from "../mrp-inputs";
import { horizonDates } from "../projection/horizon";
import { forecastDemand } from "./forecast-demand";

const TODAY = "2026-10-20";
const dates = horizonDates(TODAY);
const u = (whole: number) => BigInt(whole) * 1_000_000n;

const forecast = (date: string, quantity: number, overrides: Partial<MrpForecast> = {}): MrpForecast => ({
  material: "M1",
  location: "L1",
  date,
  quantity: u(quantity),
  ...overrides,
});

const line = (requiredDate: string, quantity: number, overrides: Partial<MrpOrderLine> = {}): MrpOrderLine => ({
  order: "00000001",
  position: 1,
  material: "M1",
  location: "L1",
  requiredDate,
  quantity: u(quantity),
  fulfilled: 0n,
  abandoned: 0n,
  status: "open",
  removed: false,
  ...overrides,
});

describe("MRP forecast demand", () => {
  it("takes forecasts netting reads unchanged (D08)", () => {
    expectTypeOf<MrpForecast>().toExtend<DemandForecast>();
  });

  it("counts what the month's orders left of a forecast, on its own date", () => {
    expect(forecastDemand([forecast("2026-10-25", 100)], [line("2026-10-28", 60)], dates)).toEqual([
      { material: "M1", location: "L1", forecastDate: "2026-10-25", date: "2026-10-25", forecastQuantity: u(100), quantity: u(40) },
    ]);
  });

  it("lets a removed line consume nothing", () => {
    const [item] = forecastDemand([forecast("2026-10-25", 100)], [line("2026-10-28", 60, { removed: true })], dates);
    expect(item.quantity).toBe(u(100));
  });

  it("lets a closed-early line consume what it kept, its remainder included (DEM-010)", () => {
    // A reversed issue leaves 20 outstanding by arithmetic; the line is still closed early.
    const closed = line("2026-10-28", 60, { status: "closed-early", fulfilled: u(10), abandoned: u(30) });
    const [item] = forecastDemand([forecast("2026-10-25", 100)], [closed], dates);
    expect(item.quantity).toBe(u(70));
  });

  it("drops a fully consumed forecast, one of an ended month and one after the last day", () => {
    const forecasts = [forecast("2026-10-25", 100), forecast("2026-09-30", 100), forecast("2027-01-18", 100)];
    expect(forecastDemand(forecasts, [line("2026-10-28", 120)], dates)).toEqual([]);
    expect(dates.at(-1)).toBe("2027-01-17");
  });

  it("counts an earlier residual of this month today, keeping its own date (D08)", () => {
    expect(forecastDemand([forecast("2026-10-05", 100)], [line("2026-10-09", 60)], dates)).toEqual([
      { material: "M1", location: "L1", forecastDate: "2026-10-05", date: TODAY, forecastQuantity: u(100), quantity: u(40) },
    ]);
  });

  it("sorts by date, forecast date, material and location, whatever the input order", () => {
    const forecasts = [
      forecast("2026-11-02", 1, { material: "M2" }),
      forecast("2026-11-02", 1, { location: "L2" }),
      forecast("2026-11-01", 1),
      forecast("2026-10-10", 1),
      forecast("2026-11-02", 1),
      forecast("2026-10-02", 1),
    ];
    const keys = forecastDemand(forecasts, [], dates).map(({ material, location, forecastDate, date }) => `${date} ${forecastDate} ${material} ${location}`);
    expect(keys).toEqual([
      "2026-10-20 2026-10-02 M1 L1",
      "2026-10-20 2026-10-10 M1 L1",
      "2026-11-01 2026-11-01 M1 L1",
      "2026-11-02 2026-11-02 M1 L1",
      "2026-11-02 2026-11-02 M1 L2",
      "2026-11-02 2026-11-02 M2 L1",
    ]);
  });
});
