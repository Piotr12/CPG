import type { SortDirection } from "../../validators/lists/list-query.schema";
import type { SafetyStockSort } from "../../validators/safety-stock/safety-stock-list.schema";
import { compareDecimals } from "../quantities/decimal";
import { targetStatus, type TargetStatus } from "./target-on";

/** What a target is sorted by: its material's and location's business IDs, its date and its quantity (#224). */
export interface SortableTarget {
  material: string;
  location: string;
  effectiveFrom: string;
  quantity: string;
}

/** Statuses in time order: replaced, in force, not started yet. */
const STATUS_ORDER: Record<TargetStatus, number> = { superseded: 0, inEffect: 1, scheduled: 2 };

type Ranked<T> = { target: T; status: number };

const COMPARE: Record<SafetyStockSort, (a: Ranked<SortableTarget>, b: Ranked<SortableTarget>) => number> = {
  material: (a, b) => a.target.material.localeCompare(b.target.material),
  location: (a, b) => a.target.location.localeCompare(b.target.location),
  effectiveFrom: (a, b) => a.target.effectiveFrom.localeCompare(b.target.effectiveFrom),
  quantity: (a, b) => compareDecimals(a.target.quantity, b.target.quantity),
  status: (a, b) => a.status - b.status,
};

/**
 * `targets` in the safety stock list's order (#217): `sort` in `dir`, then, within equal values, by
 * material ID, location ID and date ascending, the target's business key. The status is where a
 * target stands on `today` among its material and location's targets, all of which must be in
 * `targets` (a search matches the material and location only, so it keeps or drops a whole series).
 * Sorted after reading, by the business IDs the populated references carry: an `orderBy` on relation
 * fields would add query joins the tenant lint rules don't vet.
 */
export function sortTargets<T extends SortableTarget>(targets: readonly T[], sort: SafetyStockSort, dir: SortDirection, today: string): T[] {
  const sign = dir === "asc" ? 1 : -1;
  const series = (target: T) => targets.filter(({ material, location }) => material === target.material && location === target.location);
  return targets
    .map((target) => ({ target, status: STATUS_ORDER[targetStatus(series(target), target, today)] }))
    .sort((a, b) => sign * COMPARE[sort](a, b) || COMPARE.material(a, b) || COMPARE.location(a, b) || COMPARE.effectiveFrom(a, b))
    .map(({ target }) => target);
}
