import { searchSchema, type SortDirection } from "@cpg/core/validators/lists/list-query.schema";

/** A page's `searchParams`, resolved. */
export type SearchParams = Record<string, string | string[] | undefined>;

/** A parameter's first value: `?q=a&q=b` reads as `a`. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** A list's search from the URL (#217): `q` when valid; a refused one keeps what was typed and says why. */
export interface ListSearchState {
  /** What the service searches for: "" for none, or when the search was refused. */
  q: string;
  /** What the box shows back. */
  typed: string;
  /** The refusal's English message, to translate. */
  error?: string;
}

export function readSearch(params: SearchParams): ListSearchState {
  const typed = firstParam(params.q) ?? "";
  const parsed = searchSchema.safeParse(typed);
  return parsed.success ? { q: parsed.data, typed: parsed.data } : { q: "", typed, error: parsed.error.issues[0].message };
}

/** Reads `sort` and `dir` with a list's own schema, which falls back to its default order. */
export function readSort<Key extends string>(
  params: SearchParams,
  schema: { parse(input: unknown): { sort: Key; dir: SortDirection } },
): { sort: Key; dir: SortDirection } {
  return schema.parse({ sort: firstParam(params.sort), dir: firstParam(params.dir) });
}

/**
 * `path` with the given query parameters, in order, leaving out empty ones and page 1, so the
 * default list keeps its plain address.
 */
export function listHref(path: string, params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value === undefined || value === "" || (name === "page" && Number(value) === 1)) continue;
    query.set(name, String(value));
  }
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}

/** A list's addresses (#217): the sort, search and page each keep the others, and the list's own filters. */
export interface ListLinks {
  /** The list sorted by `key` in `dir`, from page 1. */
  sortHref: (key: string, dir: SortDirection) => string;
  /** Another page of the same search and sort. */
  pageHref: (page: number) => string;
  /** The list without its search, keeping the sort. */
  clearHref: string;
  /** What a new search keeps, as hidden fields. */
  keep: Record<string, string | undefined>;
  path: string;
}

/**
 * The links of a list at `path` showing `search` sorted by `sort`. The default order is left out of
 * the addresses, so an unsorted list keeps its plain `?page=2` links; `extra` holds the list's own
 * filters (`material`, `location`), kept by every link.
 */
export function listLinks<Key extends string>({
  path,
  search,
  sort,
  defaults,
  extra = {},
}: {
  path: string;
  search: string;
  sort: { sort: Key; dir: SortDirection };
  defaults: { sort: Key; dir: SortDirection };
  extra?: Record<string, string | undefined>;
}): ListLinks {
  const sorted = sort.sort === defaults.sort && sort.dir === defaults.dir ? {} : { sort: sort.sort, dir: sort.dir };
  return {
    path,
    sortHref: (key, dir) => listHref(path, { ...extra, q: search, sort: key, dir }),
    pageHref: (page) => listHref(path, { ...extra, q: search, ...sorted, page }),
    clearHref: listHref(path, { ...extra, ...sorted }),
    keep: { ...extra, ...sorted },
  };
}
