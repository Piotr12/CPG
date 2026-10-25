import { describe, expect, it } from "vitest";
import { SORT_DIR_MESSAGE, SORT_KEY_MESSAGE } from "../lists/list-query.schema";
import { PLANNING_PARAMETER_SORTS, planningParameterApiQuerySchema } from "./planning-parameter-list.schema";

describe("planningParameterApiQuerySchema", () => {
  it("leaves the sort and direction to the service and the search blank when the query has none", () => {
    expect(planningParameterApiQuerySchema.parse({})).toEqual({ q: "" });
  });

  it("accepts every listed column in either direction, with a search", () => {
    for (const sort of PLANNING_PARAMETER_SORTS) expect(planningParameterApiQuerySchema.parse({ q: " steel ", sort, dir: "desc" })).toEqual({ q: "steel", sort, dir: "desc" });
  });

  it("refuses an unlisted column or direction with the fixed messages", () => {
    expect(planningParameterApiQuerySchema.safeParse({ sort: "quantity" }).error?.issues[0]?.message).toBe(SORT_KEY_MESSAGE);
    expect(planningParameterApiQuerySchema.safeParse({ dir: "up" }).error?.issues[0]?.message).toBe(SORT_DIR_MESSAGE);
  });

  it("ignores a query key it doesn't list, as before", () => {
    expect(planningParameterApiQuerySchema.parse({ status: "open" })).toEqual({ q: "" });
  });
});
