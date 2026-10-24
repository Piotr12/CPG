import { describe, expect, it } from "vitest";
import type { PlanningParameterSort } from "../../validators/planning-parameters/planning-parameter-list.schema";
import { comparePlanningParameters, type SortablePlanningParameters } from "./planning-parameter-order";

const set = (material: string, location: string, procurement: string, leadTimeDays: number): SortablePlanningParameters => ({
  material,
  location,
  procurement,
  leadTimeDays,
});

const SETS = [
  set("00000002", "00000001", "make", 5),
  set("00000001", "00000002", "buy", 5),
  set("00000002", "00000002", "buy", 1),
  set("00000001", "00000001", "make", 10),
];

const order = (sort: PlanningParameterSort, dir: "asc" | "desc" = "asc") =>
  [...SETS].sort(comparePlanningParameters(sort, dir)).map(({ material, location }) => `${material}/${location}`);

describe("comparePlanningParameters (#217)", () => {
  it("orders by material, then location, both ways", () => {
    expect(order("material")).toEqual(["00000001/00000001", "00000001/00000002", "00000002/00000001", "00000002/00000002"]);
    expect(order("material", "desc")).toEqual(["00000002/00000001", "00000002/00000002", "00000001/00000001", "00000001/00000002"]);
  });

  it("orders by location, procurement and lead time, by material and location within equal values", () => {
    expect(order("location")).toEqual(["00000001/00000001", "00000002/00000001", "00000001/00000002", "00000002/00000002"]);
    expect(order("location", "desc")).toEqual(["00000001/00000002", "00000002/00000002", "00000001/00000001", "00000002/00000001"]);
    expect(order("procurement")).toEqual(["00000001/00000002", "00000002/00000002", "00000001/00000001", "00000002/00000001"]);
    expect(order("leadTime")).toEqual(["00000002/00000002", "00000001/00000002", "00000002/00000001", "00000001/00000001"]);
    expect(order("leadTime", "desc")).toEqual(["00000001/00000001", "00000001/00000002", "00000002/00000001", "00000002/00000002"]);
  });
});
