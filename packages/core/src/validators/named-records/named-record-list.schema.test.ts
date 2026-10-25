import { describe, expect, it } from "vitest";
import { SORT_DIR_MESSAGE, SORT_KEY_MESSAGE } from "../lists/list-query.schema";
import { NAMED_RECORD_SORTS, namedRecordApiQuerySchema } from "./named-record-list.schema";

describe("namedRecordApiQuerySchema", () => {
  it("leaves the sort and direction to the service and the search blank when the query has none", () => {
    expect(namedRecordApiQuerySchema.parse({})).toEqual({ q: "" });
  });

  it("accepts every listed column in either direction, with a search", () => {
    for (const sort of NAMED_RECORD_SORTS) expect(namedRecordApiQuerySchema.parse({ q: " steel ", sort, dir: "desc" })).toEqual({ q: "steel", sort, dir: "desc" });
  });

  it("refuses an unlisted column or direction with the fixed messages", () => {
    expect(namedRecordApiQuerySchema.safeParse({ sort: "quantity" }).error?.issues[0]?.message).toBe(SORT_KEY_MESSAGE);
    expect(namedRecordApiQuerySchema.safeParse({ dir: "up" }).error?.issues[0]?.message).toBe(SORT_DIR_MESSAGE);
  });

  it("ignores a query key it doesn't list, as before", () => {
    expect(namedRecordApiQuerySchema.parse({ status: "open" })).toEqual({ q: "" });
  });
});
