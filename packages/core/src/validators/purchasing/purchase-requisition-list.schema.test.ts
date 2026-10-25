import { describe, expect, it } from "vitest";
import { SORT_DIR_MESSAGE, SORT_KEY_MESSAGE } from "../lists/list-query.schema";
import { REQUISITION_SORTS, requisitionApiQuerySchema } from "./purchase-requisition-list.schema";

describe("requisitionApiQuerySchema", () => {
  it("leaves the sort and direction to the service and the search blank when the query has none", () => {
    expect(requisitionApiQuerySchema.parse({})).toEqual({ q: "", page: 1 });
  });

  it("accepts every listed column in either direction, with a search", () => {
    for (const sort of REQUISITION_SORTS) expect(requisitionApiQuerySchema.parse({ q: " steel ", sort, dir: "desc" })).toEqual({ q: "steel", sort, dir: "desc", page: 1 });
  });

  it("refuses an unlisted column or direction with the fixed messages", () => {
    expect(requisitionApiQuerySchema.safeParse({ sort: "supplier" }).error?.issues[0]?.message).toBe(SORT_KEY_MESSAGE);
    expect(requisitionApiQuerySchema.safeParse({ dir: "up" }).error?.issues[0]?.message).toBe(SORT_DIR_MESSAGE);
  });

  it("keeps reading the page", () => {
    expect(requisitionApiQuerySchema.parse({ page: "2", sort: "status" })).toMatchObject({ page: 2 });
    expect(requisitionApiQuerySchema.safeParse({ page: "0" }).success).toBe(false);
  });

  it("ignores a query key it doesn't list, as before", () => {
    expect(requisitionApiQuerySchema.parse({ status: "open" })).toEqual({ q: "", page: 1 });
  });
});
