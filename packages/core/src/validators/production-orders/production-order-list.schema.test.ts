import { describe, expect, it } from "vitest";
import { SORT_DIR_MESSAGE, SORT_KEY_MESSAGE } from "../lists/list-query.schema";
import { PRODUCTION_ORDER_SORTS, productionOrderApiQuerySchema, productionOrderSortSchema } from "./production-order-list.schema";

describe("productionOrderSortSchema", () => {
  it("defaults to id ascending, the list's order without a sort", () => {
    expect(productionOrderSortSchema.parse({})).toEqual({ sort: "id", dir: "asc" });
    expect(productionOrderSortSchema.parse({ sort: "bom", dir: "up" })).toEqual({ sort: "id", dir: "asc" });
  });

  it("accepts every listed column in either direction", () => {
    expect(PRODUCTION_ORDER_SORTS).toEqual(["id", "output", "quantity", "location", "finish", "start", "status"]);
    for (const sort of PRODUCTION_ORDER_SORTS) expect(productionOrderSortSchema.parse({ sort, dir: "desc" })).toEqual({ sort, dir: "desc" });
  });
});

describe("productionOrderApiQuerySchema", () => {
  it("leaves the sort and direction to the service and the search blank when the query has none", () => {
    expect(productionOrderApiQuerySchema.parse({})).toEqual({ q: "", page: 1 });
  });

  it("accepts every listed column in either direction, with a search", () => {
    for (const sort of PRODUCTION_ORDER_SORTS) expect(productionOrderApiQuerySchema.parse({ q: " steel ", sort, dir: "desc" })).toEqual({ q: "steel", sort, dir: "desc", page: 1 });
  });

  it("refuses an unlisted column or direction with the fixed messages", () => {
    expect(productionOrderApiQuerySchema.safeParse({ sort: "quantity" }).error?.issues[0]?.message).toBe(SORT_KEY_MESSAGE);
    expect(productionOrderApiQuerySchema.safeParse({ dir: "up" }).error?.issues[0]?.message).toBe(SORT_DIR_MESSAGE);
  });

  it("keeps reading the page", () => {
    expect(productionOrderApiQuerySchema.parse({ page: "2", sort: "status" })).toMatchObject({ page: 2 });
    expect(productionOrderApiQuerySchema.safeParse({ page: "0" }).success).toBe(false);
  });

  it("still refuses a query key it doesn't list", () => {
    expect(productionOrderApiQuerySchema.safeParse({ page: "1", status: "open" }).success).toBe(false);
  });
});
