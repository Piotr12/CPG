import { z } from "zod";

/** The longest search a list accepts, in characters and in words (#217). */
export const SEARCH_MAX = 100;
export const SEARCH_WORDS_MAX = 5;

/** The English message; screens translate it by matching this constant. */
export const SEARCH_TOO_LONG_MESSAGE = `Search with at most ${SEARCH_WORDS_MAX} words and ${SEARCH_MAX} characters.`;

export const SORT_DIRECTIONS = ["asc", "desc"] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

/** A list's search text: trimmed, blank as `""`, refused past the limits. */
export const searchSchema = z
  .string()
  .trim()
  .max(SEARCH_MAX, SEARCH_TOO_LONG_MESSAGE)
  .refine((text) => text.split(/\s+/).filter(Boolean).length <= SEARCH_WORDS_MAX, SEARCH_TOO_LONG_MESSAGE)
  .optional()
  .transform((text) => text ?? "");

/** One allow-listed sort key and a direction; anything else falls back to the list's default order. */
export interface ListSort<Key extends string> {
  sort: Key;
  dir: SortDirection;
}

/**
 * The sort of a list whose keys are `keys`, its first key ascending by default. Unknown or missing
 * values fall back to that default rather than failing: they come from header links, not typing.
 */
export function listSortSchema<Key extends string>(keys: readonly [Key, ...Key[]], defaults: ListSort<Key> = { sort: keys[0], dir: "asc" }) {
  return z.object({
    sort: z.enum(keys).catch(defaults.sort),
    dir: z.enum(SORT_DIRECTIONS).catch(defaults.dir),
  });
}

/** The English messages of the API's refusals of a list's `sort` and `dir` (#221). */
export const SORT_KEY_MESSAGE = "Sort by one of this list's columns.";
export const SORT_DIR_MESSAGE = "Sort direction must be asc or desc.";

/**
 * The API's `q`, `sort` and `dir` of a list whose keys are `keys` (#221), for a route's query schema.
 * Strict, unlike `listSortSchema`: a client that misspells a key is told rather than silently given
 * another order. Missing ones stay missing, so the service applies its own default order.
 */
export function listQueryShape<Key extends string>(keys: readonly [Key, ...Key[]]) {
  return {
    q: searchSchema,
    sort: z.enum(keys, SORT_KEY_MESSAGE).optional(),
    dir: z.enum(SORT_DIRECTIONS, SORT_DIR_MESSAGE).optional(),
  };
}

/** What a list service is asked for: a page, an optional search and a sort. */
export interface ListOptions<Key extends string> {
  page?: number;
  q?: string;
  sort?: Key;
  dir?: SortDirection;
}
