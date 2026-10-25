import { describe, expect, it } from "vitest";
import { FORECAST_SORTS, forecastSortSchema } from "./forecast-list.schema";

describe("forecastSortSchema", () => {
  it("defaults to material ascending, the list's order without a sort", () => {
    expect(forecastSortSchema.parse({})).toEqual({ sort: "material", dir: "asc" });
    expect(forecastSortSchema.parse({ sort: "version", dir: "up" })).toEqual({ sort: "material", dir: "asc" });
  });

  it("accepts every listed column in either direction", () => {
    expect(FORECAST_SORTS).toEqual(["material", "location", "date", "quantity"]);
    for (const sort of FORECAST_SORTS) expect(forecastSortSchema.parse({ sort, dir: "desc" })).toEqual({ sort, dir: "desc" });
  });
});
