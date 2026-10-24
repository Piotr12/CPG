import { listSortSchema } from "../lists/list-query.schema";

/**
 * The columns the planning parameters list sorts by (#217); the first, the material's ID (then the
 * location's), is its default order. The minimum lot and lot multiple are decimal text, so they
 * aren't sortable (D3).
 */
export const PLANNING_PARAMETER_SORTS = ["material", "location", "procurement", "leadTime"] as const;
export type PlanningParameterSort = (typeof PLANNING_PARAMETER_SORTS)[number];

export const planningParameterSortSchema = listSortSchema(PLANNING_PARAMETER_SORTS);
