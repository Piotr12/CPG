import { compareDecimals } from "../quantities/decimal";
import type { SortDirection } from "../../validators/lists/list-query.schema";
import type { PlanningParameterSort } from "../../validators/planning-parameters/planning-parameter-list.schema";

/** What a set is sorted by: its material's and location's business IDs and its stored values, quantities by value (#224). */
export interface SortablePlanningParameters {
  material: string;
  location: string;
  procurement: string;
  leadTimeDays: number;
  minimumQuantity: string;
  lotMultiple: string;
}

const COMPARE: Record<PlanningParameterSort, (a: SortablePlanningParameters, b: SortablePlanningParameters) => number> = {
  material: (a, b) => a.material.localeCompare(b.material),
  location: (a, b) => a.location.localeCompare(b.location),
  procurement: (a, b) => a.procurement.localeCompare(b.procurement),
  leadTime: (a, b) => a.leadTimeDays - b.leadTimeDays,
  minimum: (a, b) => compareDecimals(a.minimumQuantity, b.minimumQuantity),
  multiple: (a, b) => compareDecimals(a.lotMultiple, b.lotMultiple),
};

/**
 * The planning parameters list's order (#217): `sort` in `dir`, then, within equal values, the
 * material's ID and the location's ascending, the set's business key. The list is sorted after
 * reading, by the business IDs the populated references carry: an `orderBy` on relation fields would
 * add query joins the tenant lint rules don't vet.
 */
export function comparePlanningParameters(sort: PlanningParameterSort, dir: SortDirection) {
  const sign = dir === "asc" ? 1 : -1;
  return (a: SortablePlanningParameters, b: SortablePlanningParameters): number =>
    sign * COMPARE[sort](a, b) || COMPARE.material(a, b) || COMPARE.location(a, b);
}
