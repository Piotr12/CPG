import { describe, expect, it } from "vitest";
import { PRODUCTION_ORDER_SORTS, productionOrderSortSchema } from "./production-order-list.schema";

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
