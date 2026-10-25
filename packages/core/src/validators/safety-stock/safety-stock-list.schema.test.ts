import { describe, expect, it } from "vitest";
import { SORT_DIR_MESSAGE, SORT_KEY_MESSAGE } from "../lists/list-query.schema";
import { SAFETY_STOCK_SORTS, safetyStockApiQuerySchema } from "./safety-stock-list.schema";

describe("safetyStockApiQuerySchema", () => {
  it("leaves the sort and direction to the service and the search blank when the query has none", () => {
    expect(safetyStockApiQuerySchema.parse({})).toEqual({ q: "" });
  });

  it("accepts every listed column in either direction, with a search", () => {
    for (const sort of SAFETY_STOCK_SORTS) expect(safetyStockApiQuerySchema.parse({ q: " steel ", sort, dir: "desc" })).toEqual({ q: "steel", sort, dir: "desc" });
  });

  it("refuses an unlisted column or direction with the fixed messages", () => {
    expect(safetyStockApiQuerySchema.safeParse({ sort: "id" }).error?.issues[0]?.message).toBe(SORT_KEY_MESSAGE);
    expect(safetyStockApiQuerySchema.safeParse({ dir: "up" }).error?.issues[0]?.message).toBe(SORT_DIR_MESSAGE);
  });

  it("ignores a query key it doesn't list, as before", () => {
    expect(safetyStockApiQuerySchema.parse({ status: "open" })).toEqual({ q: "" });
  });
});
