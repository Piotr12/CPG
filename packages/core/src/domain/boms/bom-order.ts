import type { SortDirection } from "../../validators/lists/list-query.schema";
import type { BomSort } from "../../validators/boms/bom-list.schema";

/** What a BOM is sorted by: its business ID, its output's, and its current recipe's header. */
export interface SortableBom {
  id: string;
  output: string;
  active: boolean;
  revision: number;
  priority: number;
  validFrom: string;
  validThrough: string | null;
}

const text = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** A recipe without an end sorts after every dated one: it is valid the longest. */
const NO_END = "9999-12-31";

const COMPARE: Record<BomSort, (a: SortableBom, b: SortableBom) => number> = {
  output: (a, b) => text(a.output, b.output),
  id: (a, b) => text(a.id, b.id),
  priority: (a, b) => a.priority - b.priority,
  revision: (a, b) => a.revision - b.revision,
  validFrom: (a, b) => text(a.validFrom, b.validFrom),
  validThrough: (a, b) => text(a.validThrough ?? NO_END, b.validThrough ?? NO_END),
  status: (a, b) => Number(a.active) - Number(b.active),
};

/**
 * The BOMs list's order (#217): `sort` in `dir`, then, within equal values, the BOM ID ascending.
 * By output, alternatives for one output stay in priority order whichever way the outputs run
 * (BOM-008). A BOM's priority and validity live on its current revision, so the list is sorted
 * after reading, not in SQL; it is short and unpaged.
 */
export function compareBoms(sort: BomSort, dir: SortDirection): (a: SortableBom, b: SortableBom) => number {
  const sign = dir === "asc" ? 1 : -1;
  return (a, b) => sign * COMPARE[sort](a, b) || (sort === "output" ? COMPARE.priority(a, b) : 0) || COMPARE.id(a, b);
}
