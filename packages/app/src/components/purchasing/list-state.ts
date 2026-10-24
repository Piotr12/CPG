import type { SortDirection } from "@cpg/core/validators/lists/list-query.schema";
import type { ListLinks, ListSearchState } from "../lists/list-params";

/**
 * What a paged document list's page read from its address (#217), for its screen: the search, the
 * sort, the links that keep both, and how many rows the search found on every page.
 */
export interface DocumentListState<Key extends string> {
  search: ListSearchState;
  sort: { sort: Key; dir: SortDirection };
  links: ListLinks;
  count: number;
}
