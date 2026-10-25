import { describe, expect, it } from "vitest";
import { SORT_DIR_MESSAGE, SORT_KEY_MESSAGE } from "../lists/list-query.schema";
import { CUSTOMER_ORDER_SORTS, customerOrderApiQuerySchema, customerOrderSortSchema } from "./customer-order-list.schema";

describe("customerOrderSortSchema", () => {
  it("defaults to id ascending, the list's order without a sort", () => {
    expect(customerOrderSortSchema.parse({})).toEqual({ sort: "id", dir: "asc" });
    expect(customerOrderSortSchema.parse({ sort: "quantity", dir: "up" })).toEqual({ sort: "id", dir: "asc" });
  });

  it("accepts every listed column in either direction", () => {
    expect(CUSTOMER_ORDER_SORTS).toEqual(["id", "customer", "location", "status"]);
    for (const sort of CUSTOMER_ORDER_SORTS) expect(customerOrderSortSchema.parse({ sort, dir: "desc" })).toEqual({ sort, dir: "desc" });
  });
});

describe("customerOrderApiQuerySchema", () => {
  it("leaves the sort and direction to the service and the search blank when the query has none", () => {
    expect(customerOrderApiQuerySchema.parse({})).toEqual({ q: "", page: 1 });
  });

  it("accepts every listed column in either direction, with a search", () => {
    for (const sort of CUSTOMER_ORDER_SORTS) expect(customerOrderApiQuerySchema.parse({ q: " steel ", sort, dir: "desc" })).toEqual({ q: "steel", sort, dir: "desc", page: 1 });
  });

  it("refuses an unlisted column or direction with the fixed messages", () => {
    expect(customerOrderApiQuerySchema.safeParse({ sort: "quantity" }).error?.issues[0]?.message).toBe(SORT_KEY_MESSAGE);
    expect(customerOrderApiQuerySchema.safeParse({ dir: "up" }).error?.issues[0]?.message).toBe(SORT_DIR_MESSAGE);
  });

  it("keeps reading the page", () => {
    expect(customerOrderApiQuerySchema.parse({ page: "2", sort: "status" })).toMatchObject({ page: 2 });
    expect(customerOrderApiQuerySchema.safeParse({ page: "0" }).success).toBe(false);
  });

  it("still refuses a query key it doesn't list", () => {
    expect(customerOrderApiQuerySchema.safeParse({ page: "1", status: "open" }).success).toBe(false);
  });
});
