import { describe, expect, it } from "vitest";
import { netForecasts, type ConsumingOrderLine, type DemandForecast } from "./forecast-netting";

// The DEM catalogue's cases restated per D08 (spec #240). Whole units for readability: 1 = 1n.
// "Today" is before the forecast month unless a case is about placement, so nothing expires.
const TODAY = "2026-10-25";
const forecast = (quantity: number, date = "2026-11-01", material = "M", location = "L"): DemandForecast => ({ material, location, date, quantity: BigInt(quantity) });
const order = (quantity: number, requiredDate = "2026-11-01", { abandoned = 0, material = "M", location = "L" } = {}): ConsumingOrderLine => ({
  material, location, requiredDate, quantity: BigInt(quantity), abandoned: BigInt(abandoned),
});
const residuals = (forecasts: DemandForecast[], lines: ConsumingOrderLine[], today = TODAY) => netForecasts(forecasts, lines, today).map(({ residual }) => residual);

describe("netForecasts (D08)", () => {
  it("DEM-002: an order on the forecast's date consumes it", () => {
    expect(residuals([forecast(100)], [order(60)])).toEqual([40n]);
  });

  it("DEM-002 per D08: an order later in the same month consumes it too (DEM-007's rule would leave 100)", () => {
    expect(residuals([forecast(100)], [order(60, "2026-11-14")])).toEqual([40n]);
  });

  it("DEM-003: orders above the forecast leave zero, never a negative residual", () => {
    expect(residuals([forecast(100)], [order(120, "2026-11-30")])).toEqual([0n]);
  });

  it("DEM-004: without orders the whole forecast is left", () => {
    expect(residuals([forecast(100)], [])).toEqual([100n]);
  });

  it("DEM-005/006: another material or location consumes nothing", () => {
    const other = forecast(80, "2026-11-01", "N");
    expect(residuals([forecast(100), other], [order(60, "2026-11-01", { material: "N" }), order(60, "2026-11-01", { location: "K" })])).toEqual([100n, 20n]);
  });

  it("DEM-007 per D08: an order in another month consumes nothing", () => {
    expect(residuals([forecast(100)], [order(60, "2026-10-31"), order(60, "2026-12-01")])).toEqual([100n]);
  });

  it("shipping doesn't change consumption, partly or fully (DEM-008/009; the open part is the tally's)", () => {
    // Netting reads `quantity − abandoned`: what a goods issue fulfilled is still ordered.
    expect(residuals([forecast(100)], [order(60, "2026-11-10")])).toEqual([40n]);
  });

  it("DEM-010: a line closed early after shipping 30 of 60 consumes 30", () => {
    expect(residuals([forecast(100)], [order(60, "2026-11-10", { abandoned: 30 })])).toEqual([70n]);
  });

  it("DEM-011: a cancelled line consumes nothing", () => {
    expect(residuals([forecast(100)], [order(60, "2026-11-10", { abandoned: 60 })])).toEqual([100n]);
  });

  it("DEM-013: an overdue line still consumes its own month", () => {
    expect(residuals([forecast(100, "2026-10-01")], [order(60, "2026-10-05")])).toEqual([40n]);
  });

  it("consumes a month's forecasts in date order, whatever order they arrive in", () => {
    const first = forecast(50, "2026-11-01");
    const second = forecast(50, "2026-11-15");
    expect(residuals([second, first], [order(70, "2026-11-20")])).toEqual([30n, 0n]);
  });

  it("places a residual on its date, or today for one of this month dated before today", () => {
    const placed = netForecasts([forecast(100, "2026-11-01"), forecast(100, "2026-10-01"), forecast(100, "2026-10-28")], [order(60, "2026-10-03")], TODAY);
    expect(placed.map(({ residual, placedOn }) => [residual, placedOn])).toEqual([
      [100n, "2026-11-01"],
      [40n, TODAY],
      [100n, "2026-10-28"],
    ]);
  });

  it("expires the forecasts of months that ended before today's month", () => {
    const [expired] = netForecasts([forecast(100, "2026-09-01")], [], TODAY);
    expect(expired).toMatchObject({ residual: 100n, placedOn: null });
  });

  it("returns each forecast with its own residual", () => {
    const input = forecast(100);
    expect(netForecasts([input], [], TODAY)[0].forecast).toBe(input);
  });
});
