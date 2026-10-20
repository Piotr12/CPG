import { describe, expect, it } from "vitest";
import { DEMO_LOCATIONS } from "../locations/demo-locations";
import { DEMO_MATERIALS } from "../materials/demo-materials";
import { forecastCreateSchema } from "../../validators/forecasts/forecast.schema";
import { DEMO_FORECASTS } from "./demo-forecasts";

describe("DEMO_FORECASTS", () => {
  it("are valid forecasts on demo materials and locations, one per material, location and day", () => {
    const keys = new Set<string>();
    for (const forecast of DEMO_FORECASTS) {
      expect(forecastCreateSchema.parse(forecast)).toEqual(forecast);
      expect(Number(forecast.material)).toBeLessThanOrEqual(DEMO_MATERIALS.length);
      expect(Number(forecast.location)).toBeLessThanOrEqual(DEMO_LOCATIONS.length);
      keys.add(`${forecast.material}/${forecast.location}/${forecast.date}`);
    }
    expect(keys.size).toBe(DEMO_FORECASTS.length);
  });

  it("show per-day demand for one material over consecutive days", () => {
    const cabinet = DEMO_FORECASTS.filter(({ material }) => material === "00000005");
    expect(cabinet.map(({ date }) => date)).toEqual(["2026-11-02", "2026-11-03", "2026-11-04"]);
  });
});
