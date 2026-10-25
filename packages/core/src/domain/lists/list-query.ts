import type { SortDirection } from "../../validators/lists/list-query.schema";

/** A plain MikroORM where or order-by object; services cast it to the entity's query type. */
export type QueryObject = { [key: string]: unknown };

/**
 * The words of a list search (#217): split at whitespace and at `LIKE`'s wildcards and escape
 * character, so `%`, `_` and `\` never match "anything"; repeats dropped.
 */
export function searchWords(q: string): string[] {
  return [...new Set(q.split(/[\s%_\\]+/).filter(Boolean))];
}

/** `{ a: { b: value } }` for the path `a.b`. */
function nest(path: string, value: unknown): QueryObject {
  return path.split(".").reduceRight<unknown>((inner, key) => ({ [key]: inner }), value) as QueryObject;
}

/**
 * Where every word of `q` is contained in at least one of `fields` (dotted paths, so `material.code`
 * searches a reference's business ID), or `{}` when `q` has no words. `LIKE` ignores the case of every
 * letter, Polish ones included: `@cpg/db` replaces SQLite's, which ignores it for ASCII letters only (#223).
 */
export function searchWhere(q: string, fields: readonly string[]): QueryObject {
  const words = searchWords(q);
  if (words.length === 0) return {};
  return { $and: words.map((word) => ({ $or: fields.map((field) => nest(field, { $like: `%${word}%` })) })) };
}

/**
 * A list's order: `path` (a dotted path for a reference's business ID, never its UUID) in `dir`, then
 * the business ID ascending, so equal values keep a stable order and pages never overlap.
 */
export function listOrderBy(path: string, dir: SortDirection, tieBreaker = "code"): QueryObject[] {
  return path === tieBreaker ? [nest(path, dir)] : [nest(path, dir), nest(tieBreaker, "asc")];
}
