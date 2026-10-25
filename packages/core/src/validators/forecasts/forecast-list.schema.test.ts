import { describe, expect, it } from "vitest";
import { SORT_DIR_MESSAGE, SORT_KEY_MESSAGE } from "../lists/list-query.schema";
import { FORECAST_SORTS, forecastApiQuerySchema, forecastSortSchema } from "./forecast-list.schema";

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

describe("forecastApiQuerySchema", () => {
  it("leaves the sort and direction to the service and the search blank when the query has none", () => {
    expect(forecastApiQuerySchema.parse({})).toEqual({ q: "", page: 1 });
  });

  it("accepts every listed column in either direction, with a search", () => {
    for (const sort of FORECAST_SORTS) expect(forecastApiQuerySchema.parse({ q: " steel ", sort, dir: "desc" })).toEqual({ q: "steel", sort, dir: "desc", page: 1 });
  });

  it("refuses an unlisted column or direction with the fixed messages", () => {
    expect(forecastApiQuerySchema.safeParse({ sort: "quantity" }).error?.issues[0]?.message).toBe(SORT_KEY_MESSAGE);
    expect(forecastApiQuerySchema.safeParse({ dir: "up" }).error?.issues[0]?.message).toBe(SORT_DIR_MESSAGE);
  });

  it("keeps reading the page and the material and location filters", () => {
    expect(forecastApiQuerySchema.parse({ material: "00000001", location: "00000002", sort: "date" })).toMatchObject({ material: "00000001", location: "00000002", sort: "date" });
    expect(forecastApiQuerySchema.safeParse({ material: "steel" }).success).toBe(false);
    expect(forecastApiQuerySchema.parse({ page: "2", sort: "date" })).toMatchObject({ page: 2 });
    expect(forecastApiQuerySchema.safeParse({ page: "0" }).success).toBe(false);
  });

  it("ignores a query key it doesn't list, as before", () => {
    expect(forecastApiQuerySchema.parse({ status: "open" })).toEqual({ q: "", page: 1 });
  });
});
