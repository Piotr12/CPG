import { describe, expect, it } from "vitest";
import { SORT_DIR_MESSAGE, SORT_KEY_MESSAGE } from "../lists/list-query.schema";
import { TRANSFER_SORTS, transferApiQuerySchema } from "./transfer-list.schema";

describe("transferApiQuerySchema", () => {
  it("leaves the sort and direction to the service and the search blank when the query has none", () => {
    expect(transferApiQuerySchema.parse({})).toEqual({ q: "", page: 1 });
  });

  it("accepts every listed column in either direction, with a search", () => {
    for (const sort of TRANSFER_SORTS) expect(transferApiQuerySchema.parse({ q: " steel ", sort, dir: "desc" })).toEqual({ q: "steel", sort, dir: "desc", page: 1 });
  });

  it("refuses an unlisted column or direction with the fixed messages", () => {
    expect(transferApiQuerySchema.safeParse({ sort: "destination" }).error?.issues[0]?.message).toBe(SORT_KEY_MESSAGE);
    expect(transferApiQuerySchema.safeParse({ dir: "up" }).error?.issues[0]?.message).toBe(SORT_DIR_MESSAGE);
  });

  it("keeps reading the page", () => {
    expect(transferApiQuerySchema.parse({ page: "2", sort: "status" })).toMatchObject({ page: 2 });
    expect(transferApiQuerySchema.safeParse({ page: "0" }).success).toBe(false);
  });

  it("still refuses a query key it doesn't list", () => {
    expect(transferApiQuerySchema.safeParse({ page: "1", status: "open" }).success).toBe(false);
  });
});
