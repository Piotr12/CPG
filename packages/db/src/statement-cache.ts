/** The part of a better-sqlite3 `Database` the cache wraps. */
export interface Preparing<S> {
  prepare(sql: string): S;
}

/** How many distinct statements the cache keeps; the least recently used one is dropped beyond it. */
export const STATEMENT_CACHE_SIZE = 500;

/**
 * Makes `db.prepare` reuse the statement it prepared before for the same SQL. Kysely prepares every
 * query afresh, and compiling the SQL was about a tenth of the generated-dataset seed (#163, #185): the
 * same few hundred statements run thousands of times. A statement still being iterated (`busy`) is
 * never handed out twice; that call gets a fresh one. SQLite re-prepares a cached statement by itself
 * when the schema changes.
 */
export function cacheStatements<S extends { busy: boolean }>(db: Preparing<S>, size = STATEMENT_CACHE_SIZE): void {
  const prepare = db.prepare.bind(db);
  const cache = new Map<string, S>();
  db.prepare = (sql: string) => {
    const cached = cache.get(sql);
    if (cached && !cached.busy) {
      // Re-inserting keeps the Map in least-recently-used order.
      cache.delete(sql);
      cache.set(sql, cached);
      return cached;
    }
    const statement = prepare(sql);
    cache.set(sql, statement);
    if (cache.size > size) cache.delete(cache.keys().next().value!);
    return statement;
  };
}
