import { describe, expect, it } from "vitest";
import { CUSTOMER_ORDER_SORTS, customerOrderSortSchema } from "./customer-order-list.schema";

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
